import type { WebSocket } from 'ws';
import {
  UNIT_RADIUS, UNIT_SPEED, UNIT_MAX_HP, UNIT_RESPAWN_TIME,
  ATTACK_COOLDOWN, ATTACK_RANGE, ATTACK_ARC_RAD, ATTACK_DAMAGE, ATTACK_ANIM_TIME,
  DETECTION_RANGE,
  FLAG_PICKUP_RADIUS, FLAG_CAPTURE_RADIUS, FLAG_AUTORETURN_TIME,
  CAPTURES_TO_WIN,
  SERVER_SIM_HZ, SERVER_BROADCAST_HZ,
  RED_BASE, BLUE_BASE, RED_BASE_TILE, BLUE_BASE_TILE,
  WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE,
  MAP_WIDTH, MAP_HEIGHT,
  type Team, type MatchStatus,
} from '../shared/constants.ts';
import type {
  ClientMessage, ServerMessage, StateSnapshot,
  HitEvent, CaptureEvent,
} from '../shared/types.ts';
import { generateMap, tileAt, TILE, type MapData } from '../shared/map.ts';
import { findPath, findNearestWalkable, type TileCoord } from '../shared/pathfinding.ts';

interface ServerUnit {
  id: string;
  ownerId: string;
  team: Team;
  spawnX: number;
  spawnY: number;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  facing: number;
  attackCooldown: number;
  attackAnimTimer: number;
  carrying: Team | null;
  respawnTimer: number;
  // AI state
  commandedTarget: { x: number; y: number } | null;
  path: TileCoord[];
  currentGoal: { x: number; y: number } | null;   // pixel goal for current path (may be enemy pos or commanded target)
  chasingEnemyId: string | null;
  repathCooldown: number;
}

interface ServerCommander {
  id: string;
  ws: WebSocket;
  team: Team;
  score: number;
  unitIds: string[];
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
  [UNIT_RADIUS - 1, 0], [-(UNIT_RADIUS - 1), 0],
  [0, UNIT_RADIUS - 1], [0, -(UNIT_RADIUS - 1)],
];

export class Room {
  code: string;
  private onEmpty: () => void;
  private commanders = new Map<string, ServerCommander>();
  private units = new Map<string, ServerUnit>();
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
  private nextPlayerNum = 1;
  private nextUnitNum = 1;

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
    if (this.commanders.size >= 2) return null;
    const id = 'c' + this.nextPlayerNum++;
    const team: Team = this.commanders.size === 0 ? 'red' : 'blue';
    const unitIds = this.spawnUnits(id, team);
    const commander: ServerCommander = { id, ws, team, score: 0, unitIds };
    this.commanders.set(id, commander);

    const joined: ServerMessage = {
      type: 'joined',
      playerId: id,
      team,
      roomCode: this.code,
      mapSeed: this.mapSeed,
      unitIds,
    };
    ws.send(JSON.stringify(joined));

    if (this.commanders.size === 2) {
      this.status = 'playing';
      this.matchStart = Date.now();
    }
    return id;
  }

  removePlayer(id: string): void {
    const c = this.commanders.get(id);
    if (!c) return;
    // Remove owned units
    for (const uid of c.unitIds) {
      const u = this.units.get(uid);
      if (u?.carrying) {
        const flag = u.carrying === 'red' ? this.redFlag : this.blueFlag;
        flag.carriedBy = null;
        flag.x = u.x; flag.y = u.y;
        flag.atHome = false;
        flag.droppedTimer = FLAG_AUTORETURN_TIME;
      }
      this.units.delete(uid);
    }
    this.commanders.delete(id);
    if (this.commanders.size === 0) {
      clearInterval(this.simTimer);
      clearInterval(this.bcTimer);
      this.onEmpty();
    } else {
      this.status = 'waiting';
    }
  }

  handleMessage(playerId: string, msg: ClientMessage): void {
    if (msg.type !== 'command') return;
    const c = this.commanders.get(playerId);
    if (!c) return;
    const target = msg.target;
    if (
      typeof target?.x !== 'number' || typeof target?.y !== 'number' ||
      target.x < 0 || target.x > WORLD_WIDTH ||
      target.y < 0 || target.y > WORLD_HEIGHT
    ) return;
    for (const uid of msg.unitIds) {
      const u = this.units.get(uid);
      if (!u) continue;
      if (u.ownerId !== playerId) continue;
      if (!u.alive) continue;
      u.commandedTarget = { x: target.x, y: target.y };
      u.chasingEnemyId = null;
      this.repath(u, target);
    }
  }

  private spawnUnits(ownerId: string, team: Team): string[] {
    const base = team === 'red' ? RED_BASE_TILE : BLUE_BASE_TILE;
    const inside = team === 'red' ? +1 : -1; // step toward gate side
    // 5 positions inside the base — 2 rows of 3/2
    const spots: TileCoord[] = [
      { x: base.x - 1, y: base.y - 1 },
      { x: base.x,     y: base.y - 1 },
      { x: base.x + 1 * inside, y: base.y - 1 },
      { x: base.x,     y: base.y + 1 },
      { x: base.x + 1 * inside, y: base.y + 1 },
    ];
    const ids: string[] = [];
    for (const s of spots) {
      const id = 'u' + this.nextUnitNum++;
      const px = (s.x + 0.5) * TILE_SIZE;
      const py = (s.y + 0.5) * TILE_SIZE;
      const u: ServerUnit = {
        id, ownerId, team,
        spawnX: px, spawnY: py,
        x: px, y: py,
        hp: UNIT_MAX_HP,
        alive: true,
        facing: team === 'red' ? 0 : Math.PI,
        attackCooldown: 0,
        attackAnimTimer: 0,
        carrying: null,
        respawnTimer: 0,
        commandedTarget: null,
        path: [],
        currentGoal: null,
        chasingEnemyId: null,
        repathCooldown: 0,
      };
      this.units.set(id, u);
      ids.push(id);
    }
    return ids;
  }

  // ---- Simulation ----

  private tick(): void {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    if (this.status !== 'playing') return;

    // Movement + combat per unit
    for (const u of this.units.values()) {
      this.tickUnit(u, dt);
    }

    // Flag updates (autoreturn if dropped)
    this.updateFlag(this.redFlag, dt);
    this.updateFlag(this.blueFlag, dt);

    // Separation between units so they don't stack
    this.applySeparation(dt);
  }

  private tickUnit(u: ServerUnit, dt: number): void {
    if (!u.alive) {
      u.respawnTimer -= dt;
      if (u.respawnTimer <= 0) this.respawn(u);
      return;
    }

    u.attackCooldown = Math.max(0, u.attackCooldown - dt);
    u.attackAnimTimer = Math.max(0, u.attackAnimTimer - dt);
    u.repathCooldown = Math.max(0, u.repathCooldown - dt);

    // ---- Enemy scan ----
    const nearestEnemy = this.nearestEnemyInRange(u, DETECTION_RANGE);
    if (nearestEnemy) {
      const dx = nearestEnemy.x - u.x;
      const dy = nearestEnemy.y - u.y;
      const dist = Math.hypot(dx, dy);
      // Face the enemy while engaging
      if (dist > 0.01) u.facing = Math.atan2(dy, dx);

      if (dist <= ATTACK_RANGE + UNIT_RADIUS) {
        // In attack range — swing on cooldown, don't move.
        if (u.attackCooldown <= 0) {
          u.attackCooldown = ATTACK_COOLDOWN;
          u.attackAnimTimer = ATTACK_ANIM_TIME;
          this.applyAttack(u, nearestEnemy);
        }
        return; // no movement this tick
      }

      // Enemy detected but not in attack range — chase (re-path occasionally).
      if (u.chasingEnemyId !== nearestEnemy.id || u.repathCooldown <= 0) {
        u.chasingEnemyId = nearestEnemy.id;
        u.repathCooldown = 0.35;
        this.repath(u, { x: nearestEnemy.x, y: nearestEnemy.y });
      }
    } else if (u.chasingEnemyId) {
      // Lost sight — go back to commanded target if any
      u.chasingEnemyId = null;
      if (u.commandedTarget) this.repath(u, u.commandedTarget);
      else u.path = [];
    }

    // ---- Movement along path ----
    if (u.path.length > 0) {
      this.advanceAlongPath(u, dt);
    }

    // ---- Flag interactions ----
    this.checkFlagPickup(u);
    this.checkFlagCapture(u);
  }

  private applyAttack(attacker: ServerUnit, target: ServerUnit): void {
    // Check arc: target must be within cone in front of attacker
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    let diff = Math.atan2(dy, dx) - attacker.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > ATTACK_ARC_RAD / 2) return;

    target.hp -= ATTACK_DAMAGE;
    this.pendingHits.push({ x: target.x, y: target.y, team: attacker.team });
    if (target.hp <= 0) this.killUnit(target);
  }

  private killUnit(u: ServerUnit): void {
    u.alive = false;
    u.hp = 0;
    u.respawnTimer = UNIT_RESPAWN_TIME;
    u.path = [];
    u.chasingEnemyId = null;
    if (u.carrying) {
      const flag = u.carrying === 'red' ? this.redFlag : this.blueFlag;
      flag.carriedBy = null;
      flag.x = u.x; flag.y = u.y;
      flag.atHome = false;
      flag.droppedTimer = FLAG_AUTORETURN_TIME;
      u.carrying = null;
    }
  }

  private respawn(u: ServerUnit): void {
    u.x = u.spawnX;
    u.y = u.spawnY;
    u.hp = UNIT_MAX_HP;
    u.alive = true;
    u.respawnTimer = 0;
    u.path = [];
    u.commandedTarget = null;
    u.chasingEnemyId = null;
    u.attackCooldown = 0;
    u.attackAnimTimer = 0;
  }

  private advanceAlongPath(u: ServerUnit, dt: number): void {
    let remaining = UNIT_SPEED * dt;
    while (remaining > 0 && u.path.length > 0) {
      const next = u.path[0];
      const tx = (next.x + 0.5) * TILE_SIZE;
      const ty = (next.y + 0.5) * TILE_SIZE;
      const dx = tx - u.x;
      const dy = ty - u.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01) u.facing = Math.atan2(dy, dx);
      if (dist <= remaining) {
        u.x = tx;
        u.y = ty;
        u.path.shift();
        remaining -= dist;
      } else {
        u.x += (dx / dist) * remaining;
        u.y += (dy / dist) * remaining;
        remaining = 0;
      }
    }
  }

  // Compute a new path for u ending at the tile of `target` (pixel coords).
  private repath(u: ServerUnit, target: { x: number; y: number }): void {
    const startTile: TileCoord = {
      x: Math.floor(u.x / TILE_SIZE),
      y: Math.floor(u.y / TILE_SIZE),
    };
    const rawTile: TileCoord = {
      x: Math.floor(target.x / TILE_SIZE),
      y: Math.floor(target.y / TILE_SIZE),
    };
    const goalTile = findNearestWalkable(
      startTile, rawTile,
      (x, y) => tileAt(this.map, x, y) !== TILE.ROCK,
      MAP_WIDTH, MAP_HEIGHT,
    );
    if (!goalTile) { u.path = []; return; }
    const path = findPath(
      startTile, goalTile,
      (x, y) => tileAt(this.map, x, y) === TILE.ROCK,
      MAP_WIDTH, MAP_HEIGHT,
    );
    u.path = path;
    u.currentGoal = target;
  }

  private nearestEnemyInRange(u: ServerUnit, range: number): ServerUnit | null {
    let best: ServerUnit | null = null;
    let bestD2 = range * range;
    for (const o of this.units.values()) {
      if (o === u) continue;
      if (!o.alive) continue;
      if (o.team === u.team) continue;
      const dx = o.x - u.x;
      const dy = o.y - u.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) { best = o; bestD2 = d2; }
    }
    return best;
  }

  private applySeparation(dt: number): void {
    const minDist = UNIT_RADIUS * 2 + 2;
    const arr = [...this.units.values()];
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (!a.alive) continue;
      let pushX = 0, pushY = 0;
      for (let j = 0; j < arr.length; j++) {
        if (i === j) continue;
        const b = arr[j];
        if (!b.alive) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 === 0 || d2 > minDist * minDist * 4) continue;
        const d = Math.sqrt(d2) || 0.001;
        const strength = (minDist * 1.5 - d) / (minDist * 1.5);
        if (strength <= 0) continue;
        pushX += (dx / d) * strength;
        pushY += (dy / d) * strength;
      }
      // Apply the push, but only if the resulting position isn't blocked.
      const nx = a.x + pushX * 45 * dt;
      const ny = a.y + pushY * 45 * dt;
      if (this.isPixelPositionFree(nx, a.y)) a.x = nx;
      if (this.isPixelPositionFree(a.x, ny)) a.y = ny;
      // World clamp
      a.x = Math.max(UNIT_RADIUS, Math.min(WORLD_WIDTH - UNIT_RADIUS, a.x));
      a.y = Math.max(UNIT_RADIUS, Math.min(WORLD_HEIGHT - UNIT_RADIUS, a.y));
    }
  }

  private isPixelPositionFree(cx: number, cy: number): boolean {
    for (const [ox, oy] of SAMPLE_OFFSETS) {
      const tx = Math.floor((cx + ox) / TILE_SIZE);
      const ty = Math.floor((cy + oy) / TILE_SIZE);
      if (tileAt(this.map, tx, ty) === TILE.ROCK) return false;
    }
    return true;
  }

  // ---- Flag mechanics ----

  private checkFlagPickup(u: ServerUnit): void {
    if (u.carrying) return;
    const enemyFlag = u.team === 'red' ? this.blueFlag : this.redFlag;
    if (enemyFlag.carriedBy) return;
    const dx = u.x - enemyFlag.x;
    const dy = u.y - enemyFlag.y;
    if (dx * dx + dy * dy > FLAG_PICKUP_RADIUS * FLAG_PICKUP_RADIUS) return;
    enemyFlag.carriedBy = u.id;
    enemyFlag.atHome = false;
    enemyFlag.droppedTimer = 0;
    u.carrying = enemyFlag.team;
  }

  private checkFlagCapture(u: ServerUnit): void {
    if (!u.carrying) return;
    const ownFlag = u.team === 'red' ? this.redFlag : this.blueFlag;
    if (!ownFlag.atHome) return;
    const home = u.team === 'red' ? RED_BASE : BLUE_BASE;
    const dx = u.x - home.x;
    const dy = u.y - home.y;
    if (dx * dx + dy * dy > FLAG_CAPTURE_RADIUS * FLAG_CAPTURE_RADIUS) return;

    this.scores[u.team]++;
    // Commander score
    const c = this.commanders.get(u.ownerId);
    if (c) c.score++;
    this.pendingCaptures.push({ team: u.team, x: u.x, y: u.y });

    const captured = u.carrying === 'red' ? this.redFlag : this.blueFlag;
    const capturedHome = u.carrying === 'red' ? RED_BASE : BLUE_BASE;
    captured.x = capturedHome.x;
    captured.y = capturedHome.y;
    captured.atHome = true;
    captured.carriedBy = null;
    captured.droppedTimer = 0;
    u.carrying = null;

    if (this.scores[u.team] >= CAPTURES_TO_WIN) {
      this.status = 'ended';
      this.winner = u.team;
    }
  }

  private updateFlag(flag: ServerFlag, dt: number): void {
    if (flag.carriedBy) {
      const u = this.units.get(flag.carriedBy);
      if (!u || !u.alive) {
        flag.carriedBy = null;
      } else {
        flag.x = u.x;
        flag.y = u.y;
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
      team, x: home.x, y: home.y,
      atHome: true, carriedBy: null, droppedTimer: 0,
    };
  }

  // ---- Broadcast ----

  private broadcast(): void {
    const snap: StateSnapshot = {
      serverTime: Date.now(),
      units: [...this.units.values()].map(u => ({
        id: u.id, team: u.team,
        x: u.x, y: u.y,
        hp: u.hp, alive: u.alive,
        facing: u.facing,
        attackAnimT: u.attackAnimTimer / ATTACK_ANIM_TIME,
        carrying: u.carrying,
        respawnIn: u.alive ? undefined : u.respawnTimer,
      })),
      flags: [this.flagSnap(this.redFlag), this.flagSnap(this.blueFlag)],
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
    for (const c of this.commanders.values()) {
      if (c.ws.readyState === 1) c.ws.send(json);
    }
  }

  private flagSnap(f: ServerFlag) {
    return {
      team: f.team, x: f.x, y: f.y,
      atHome: f.atHome, carriedBy: f.carriedBy,
      droppedIn: f.atHome ? undefined : f.droppedTimer,
    };
  }
}
