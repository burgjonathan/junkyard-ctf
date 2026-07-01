import type { WebSocket } from 'ws';
import {
  HERO_MAX_HP, HERO_SPEED, HERO_RADIUS, HERO_RESPAWN_TIME,
  ATTACK_COOLDOWN, ATTACK_REACH, ATTACK_ARC_RAD, ATTACK_DAMAGE, ATTACK_ANIM_TIME,
  FLAG_PICKUP_RADIUS, FLAG_CAPTURE_RADIUS, FLAG_AUTORETURN_TIME,
  CAPTURES_TO_WIN,
  SERVER_SIM_HZ, SERVER_BROADCAST_HZ,
  RED_BASE, BLUE_BASE,
  WORLD_WIDTH, WORLD_HEIGHT,
  type Team, type MatchStatus,
} from '../shared/constants.ts';
import type {
  ClientMessage, ServerMessage, StateSnapshot,
  HitEvent, CaptureEvent,
} from '../shared/types.ts';
import { generateMap, isBlockedAtPixel, type MapData } from '../shared/map.ts';

interface Input {
  seq: number;
  moveX: number;
  moveY: number;
  aimAngle: number;
  attack: boolean;
}

interface ServerPlayer {
  id: string;
  ws: WebSocket;
  team: Team;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  aimAngle: number;
  attackCooldown: number;
  attackAnimTimer: number;
  carrying: Team | null;
  score: number;
  respawnTimer: number;
  lastInput: Input;
}

interface ServerFlag {
  team: Team;
  x: number;
  y: number;
  atHome: boolean;
  carriedBy: string | null;
  droppedTimer: number;
}

const SAMPLE_OFFSETS: Array<[number, number]> = [
  [0, 0],
  [HERO_RADIUS - 1, 0], [-(HERO_RADIUS - 1), 0],
  [0, HERO_RADIUS - 1], [0, -(HERO_RADIUS - 1)],
];

export class Room {
  code: string;
  private onEmpty: () => void;
  private players = new Map<string, ServerPlayer>();
  private redFlag: ServerFlag;
  private blueFlag: ServerFlag;
  private scores = { red: 0, blue: 0 };
  private status: MatchStatus = 'waiting';
  private winner: Team | null = null;
  private map: MapData;
  private mapSeed: number;
  private simTimer: ReturnType<typeof setInterval>;
  private bcTimer: ReturnType<typeof setInterval>;
  private lastTick = Date.now();
  private matchStart = 0;
  private pendingHits: HitEvent[] = [];
  private pendingCaptures: CaptureEvent[] = [];
  private nextNum = 1;

  constructor(code: string, onEmpty: () => void) {
    this.code = code;
    this.onEmpty = onEmpty;
    this.mapSeed = Math.floor(Math.random() * 0xFFFFFFFF);
    this.map = generateMap(this.mapSeed);
    this.redFlag = this.freshFlag('red');
    this.blueFlag = this.freshFlag('blue');
    this.simTimer = setInterval(() => this.tick(), 1000 / SERVER_SIM_HZ);
    this.bcTimer = setInterval(() => this.broadcast(), 1000 / SERVER_BROADCAST_HZ);
  }

  addPlayer(ws: WebSocket): string | null {
    if (this.players.size >= 2) return null;
    const id = 'p' + this.nextNum++;
    const team: Team = this.players.size === 0 ? 'red' : 'blue';
    const base = team === 'red' ? RED_BASE : BLUE_BASE;
    this.players.set(id, {
      id, ws, team,
      x: base.x, y: base.y,
      hp: HERO_MAX_HP,
      alive: true,
      aimAngle: team === 'red' ? 0 : Math.PI,
      attackCooldown: 0,
      attackAnimTimer: 0,
      carrying: null,
      score: 0,
      respawnTimer: 0,
      lastInput: { seq: 0, moveX: 0, moveY: 0, aimAngle: 0, attack: false },
    });
    const joinedMsg: ServerMessage = {
      type: 'joined',
      playerId: id,
      team,
      roomCode: this.code,
      mapSeed: this.mapSeed,
    };
    ws.send(JSON.stringify(joinedMsg));

    if (this.players.size === 2) {
      this.status = 'playing';
      this.matchStart = Date.now();
      this.resetMatch(/*resetScores*/ false);
    }
    return id;
  }

  removePlayer(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.carrying) {
      const flag = p.carrying === 'red' ? this.redFlag : this.blueFlag;
      flag.carriedBy = null;
      flag.x = p.x; flag.y = p.y;
      flag.atHome = false;
      flag.droppedTimer = FLAG_AUTORETURN_TIME;
    }
    this.players.delete(id);
    if (this.players.size === 0) {
      clearInterval(this.simTimer);
      clearInterval(this.bcTimer);
      this.onEmpty();
    } else {
      // Only 1 player left — pause into waiting.
      this.status = 'waiting';
    }
  }

  handleInput(playerId: string, msg: Extract<ClientMessage, { type: 'input' }>): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.lastInput = {
      seq: msg.seq,
      moveX: msg.moveX,
      moveY: msg.moveY,
      aimAngle: msg.aimAngle,
      attack: msg.attack,
    };
    p.aimAngle = msg.aimAngle;
  }

  // ----- Simulation -----

  private tick(): void {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    if (this.status !== 'playing') return;

    for (const p of this.players.values()) {
      if (!p.alive) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) this.respawn(p);
        continue;
      }
      const mx = clamp(p.lastInput.moveX, -1, 1);
      const my = clamp(p.lastInput.moveY, -1, 1);
      const len = Math.hypot(mx, my);
      if (len > 0.01) {
        const nx = mx / Math.max(len, 1);
        const ny = my / Math.max(len, 1);
        this.tryMove(p, nx * HERO_SPEED * dt, ny * HERO_SPEED * dt);
      }
      p.attackCooldown = Math.max(0, p.attackCooldown - dt);
      p.attackAnimTimer = Math.max(0, p.attackAnimTimer - dt);

      if (p.lastInput.attack && p.attackCooldown <= 0) this.doAttack(p);

      this.checkFlagPickup(p);
      this.checkFlagCapture(p);
    }

    this.updateFlag(this.redFlag, dt);
    this.updateFlag(this.blueFlag, dt);
  }

  private tryMove(p: ServerPlayer, dx: number, dy: number): void {
    const tryX = p.x + dx;
    if (this.isPositionFree(tryX, p.y)) p.x = tryX;
    const tryY = p.y + dy;
    if (this.isPositionFree(p.x, tryY)) p.y = tryY;
    p.x = clamp(p.x, HERO_RADIUS, WORLD_WIDTH - HERO_RADIUS);
    p.y = clamp(p.y, HERO_RADIUS, WORLD_HEIGHT - HERO_RADIUS);
  }

  private isPositionFree(cx: number, cy: number): boolean {
    for (const off of SAMPLE_OFFSETS) {
      if (isBlockedAtPixel(this.map, cx + off[0], cy + off[1])) return false;
    }
    return true;
  }

  private doAttack(attacker: ServerPlayer): void {
    attacker.attackCooldown = ATTACK_COOLDOWN;
    attacker.attackAnimTimer = ATTACK_ANIM_TIME;
    for (const other of this.players.values()) {
      if (other === attacker) continue;
      if (other.team === attacker.team) continue;
      if (!other.alive) continue;
      const dx = other.x - attacker.x;
      const dy = other.y - attacker.y;
      const dist = Math.hypot(dx, dy);
      if (dist > ATTACK_REACH + HERO_RADIUS) continue;
      const angleToTarget = Math.atan2(dy, dx);
      let diff = angleToTarget - attacker.aimAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > ATTACK_ARC_RAD / 2) continue;
      other.hp -= ATTACK_DAMAGE;
      this.pendingHits.push({ x: other.x, y: other.y, team: attacker.team });
      if (other.hp <= 0) this.killPlayer(other);
    }
  }

  private killPlayer(victim: ServerPlayer): void {
    victim.alive = false;
    victim.hp = 0;
    victim.respawnTimer = HERO_RESPAWN_TIME;
    if (victim.carrying) {
      const flag = victim.carrying === 'red' ? this.redFlag : this.blueFlag;
      flag.carriedBy = null;
      flag.x = victim.x; flag.y = victim.y;
      flag.atHome = false;
      flag.droppedTimer = FLAG_AUTORETURN_TIME;
      victim.carrying = null;
    }
  }

  private respawn(p: ServerPlayer): void {
    const base = p.team === 'red' ? RED_BASE : BLUE_BASE;
    p.x = base.x;
    p.y = base.y;
    p.hp = HERO_MAX_HP;
    p.alive = true;
    p.respawnTimer = 0;
    p.attackCooldown = 0;
    p.attackAnimTimer = 0;
  }

  private checkFlagPickup(p: ServerPlayer): void {
    if (p.carrying) return;
    const enemyFlag = p.team === 'red' ? this.blueFlag : this.redFlag;
    if (enemyFlag.carriedBy) return;
    const dx = p.x - enemyFlag.x;
    const dy = p.y - enemyFlag.y;
    if (dx * dx + dy * dy > FLAG_PICKUP_RADIUS * FLAG_PICKUP_RADIUS) return;
    enemyFlag.carriedBy = p.id;
    enemyFlag.atHome = false;
    enemyFlag.droppedTimer = 0;
    p.carrying = enemyFlag.team;
  }

  private checkFlagCapture(p: ServerPlayer): void {
    if (!p.carrying) return;
    const ownFlag = p.team === 'red' ? this.redFlag : this.blueFlag;
    if (!ownFlag.atHome) return;
    const home = p.team === 'red' ? RED_BASE : BLUE_BASE;
    const dx = p.x - home.x;
    const dy = p.y - home.y;
    if (dx * dx + dy * dy > FLAG_CAPTURE_RADIUS * FLAG_CAPTURE_RADIUS) return;

    this.scores[p.team]++;
    p.score++;
    this.pendingCaptures.push({ team: p.team, x: p.x, y: p.y });

    // Return the captured flag to its home base
    const capturedFlag = p.carrying === 'red' ? this.redFlag : this.blueFlag;
    const capturedHome = p.carrying === 'red' ? RED_BASE : BLUE_BASE;
    capturedFlag.x = capturedHome.x;
    capturedFlag.y = capturedHome.y;
    capturedFlag.atHome = true;
    capturedFlag.carriedBy = null;
    capturedFlag.droppedTimer = 0;
    p.carrying = null;

    if (this.scores[p.team] >= CAPTURES_TO_WIN) {
      this.status = 'ended';
      this.winner = p.team;
    }
  }

  private updateFlag(flag: ServerFlag, dt: number): void {
    if (flag.carriedBy) {
      const carrier = this.players.get(flag.carriedBy);
      if (!carrier || !carrier.alive) {
        flag.carriedBy = null;
      } else {
        flag.x = carrier.x;
        flag.y = carrier.y;
      }
      return;
    }
    if (flag.atHome) return;
    flag.droppedTimer -= dt;
    if (flag.droppedTimer <= 0) {
      const home = flag.team === 'red' ? RED_BASE : BLUE_BASE;
      flag.x = home.x;
      flag.y = home.y;
      flag.atHome = true;
    }
  }

  private freshFlag(team: Team): ServerFlag {
    const home = team === 'red' ? RED_BASE : BLUE_BASE;
    return {
      team,
      x: home.x, y: home.y,
      atHome: true,
      carriedBy: null,
      droppedTimer: 0,
    };
  }

  private resetMatch(resetScores: boolean): void {
    for (const p of this.players.values()) this.respawn(p);
    this.redFlag = this.freshFlag('red');
    this.blueFlag = this.freshFlag('blue');
    if (resetScores) {
      this.scores.red = 0;
      this.scores.blue = 0;
      this.winner = null;
    }
  }

  // ----- Broadcast -----

  private broadcast(): void {
    const snap: StateSnapshot = {
      serverTime: Date.now(),
      players: [...this.players.values()].map(p => ({
        id: p.id, team: p.team,
        x: p.x, y: p.y,
        hp: p.hp, alive: p.alive,
        aimAngle: p.aimAngle,
        attackAnimT: p.attackAnimTimer / ATTACK_ANIM_TIME,
        carrying: p.carrying,
        score: p.score,
        respawnIn: p.alive ? undefined : p.respawnTimer,
      })),
      flags: [
        this.flagSnap(this.redFlag),
        this.flagSnap(this.blueFlag),
      ],
      scores: { red: this.scores.red, blue: this.scores.blue },
      status: this.status,
      winner: this.winner,
      hits: this.pendingHits,
      captures: this.pendingCaptures,
      matchTime: this.status === 'playing' ? (Date.now() - this.matchStart) / 1000 : 0,
    };
    this.pendingHits = [];
    this.pendingCaptures = [];

    const msg: ServerMessage = { type: 'state', snap };
    const json = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.ws.readyState === 1) p.ws.send(json);
    }
  }

  private flagSnap(f: ServerFlag) {
    return {
      team: f.team, x: f.x, y: f.y,
      atHome: f.atHome,
      carriedBy: f.carriedBy,
      droppedIn: f.atHome ? undefined : f.droppedTimer,
    };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
