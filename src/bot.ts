import {
  TILE_SIZE,
  BOT_SPEED,
  BOT_RADIUS,
  HARVEST_TIME,
  DROP_OFF_TIME,
  CARRY_CAPACITY,
  type ResourceKind,
} from './constants.ts';
import type { TileCoord } from './pathfinding.ts';
import type { ResourceNode } from './resource.ts';
import type { Building } from './building.ts';
import type { Particle } from './particles.ts';

export type BotState = 'idle' | 'moving' | 'harvesting' | 'droppingOff' | 'building';

export interface BotCommand {
  type: 'goto' | 'harvest';
  path: TileCoord[];
  resource?: ResourceNode;
}

let nextBotId = 0;

export class GreaseBot {
  x: number;
  y: number;
  facing: number = 0;         // radians; 0 = east
  treadPhase: number = 0;
  phaseSeed: number;          // per-bot animation offset so they don't sync
  puffAccumulator: number = 0; // distance since last exhaust puff
  sparkTimer: number = 0;      // seconds until next harvest spark
  selected: boolean = false;
  path: TileCoord[] = [];
  state: BotState = 'idle';
  targetResource: ResourceNode | null = null;
  targetBuilding: Building | null = null;
  carrying: number = 0;
  carryingKind: ResourceKind | null = null;
  actionTimer: number = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    // Deterministic per-instance phase so idle bobs are offset.
    const id = nextBotId++;
    this.phaseSeed = (id * 1.7 + 0.31) % (Math.PI * 2);
  }

  get tileX(): number { return Math.floor(this.x / TILE_SIZE); }
  get tileY(): number { return Math.floor(this.y / TILE_SIZE); }

  applyCommand(cmd: BotCommand): void {
    this.path = cmd.path.slice();
    if (cmd.type === 'harvest' && cmd.resource) {
      this.targetResource = cmd.resource;
    } else {
      this.targetResource = null;
    }
    // A plain move / harvest command cancels any construction assignment.
    this.targetBuilding = null;
    this.state = this.path.length > 0 ? 'moving' : 'idle';
  }
}

export interface StepArgs {
  dt: number;
  bots: GreaseBot[];
  onDropOff: (bot: GreaseBot) => void;
  onArriveAtResource: (bot: GreaseBot) => void;
  onCarryFilled: (bot: GreaseBot) => void;
  onIdleWithCarry: (bot: GreaseBot) => void;
  spawnParticle: (p: Particle) => void;
}

export function stepBot(bot: GreaseBot, args: StepArgs): void {
  const { dt } = args;

  if (bot.state === 'moving') {
    const startX = bot.x;
    const startY = bot.y;
    advanceAlongPath(bot, dt);
    const moved = Math.hypot(bot.x - startX, bot.y - startY);
    if (moved > 0.1) {
      bot.puffAccumulator += moved;
      if (bot.puffAccumulator >= 18) {
        bot.puffAccumulator -= 18;
        emitExhaustPuff(bot, args.spawnParticle);
      }
    }
    if (bot.path.length === 0) {
      if (bot.targetBuilding && !bot.targetBuilding.built) {
        bot.state = 'building';
        bot.sparkTimer = 0.15;
      } else if (bot.targetResource && !bot.targetResource.depleted && bot.carrying === 0) {
        bot.state = 'harvesting';
        bot.actionTimer = HARVEST_TIME;
        bot.sparkTimer = 0.05;
      } else if (bot.carrying > 0) {
        bot.state = 'droppingOff';
        bot.actionTimer = DROP_OFF_TIME;
      } else {
        bot.state = 'idle';
      }
    }
  } else if (bot.state === 'building') {
    // Building bots contribute to progress via the game update loop; we just emit sparks here.
    if (!bot.targetBuilding || bot.targetBuilding.built) {
      bot.targetBuilding = null;
      bot.state = 'idle';
    } else {
      bot.sparkTimer -= dt;
      if (bot.sparkTimer <= 0) {
        bot.sparkTimer = 0.09 + Math.random() * 0.06;
        emitBuildSpark(bot, bot.targetBuilding, args.spawnParticle);
      }
    }
  } else if (bot.state === 'harvesting') {
    bot.actionTimer -= dt;
    bot.sparkTimer -= dt;
    if (bot.sparkTimer <= 0 && bot.targetResource) {
      bot.sparkTimer = 0.06 + Math.random() * 0.06;
      emitHarvestSpark(bot, bot.targetResource, args.spawnParticle);
    }
    if (bot.actionTimer <= 0) {
      const node = bot.targetResource;
      if (node && !node.depleted) {
        const taken = node.take(CARRY_CAPACITY);
        bot.carrying = taken;
        bot.carryingKind = node.kind;
      }
      args.onCarryFilled(bot);
    }
  } else if (bot.state === 'droppingOff') {
    bot.actionTimer -= dt;
    if (bot.actionTimer <= 0) {
      args.onDropOff(bot);
      if (bot.targetResource && !bot.targetResource.depleted) {
        args.onArriveAtResource(bot);
      } else {
        bot.targetResource = null;
        bot.state = 'idle';
      }
    }
  }

  applySeparation(bot, args.bots, dt);

  if (bot.state === 'idle' && bot.carrying > 0) {
    args.onIdleWithCarry(bot);
  }
}

function emitExhaustPuff(bot: GreaseBot, spawn: (p: Particle) => void): void {
  const behindX = bot.x - Math.cos(bot.facing) * 7;
  const behindY = bot.y - Math.sin(bot.facing) * 7;
  spawn({
    x: behindX + (Math.random() - 0.5) * 2,
    y: behindY + (Math.random() - 0.5) * 2,
    vx: -Math.cos(bot.facing) * 8 + (Math.random() - 0.5) * 12,
    vy: -Math.sin(bot.facing) * 8 + (Math.random() - 0.5) * 12 - 6,
    life: 0.55, maxLife: 0.55,
    kind: 'puff',
    color: '#8a7660',
    size: 1.6,
  });
}

function emitBuildSpark(
  bot: GreaseBot,
  building: Building,
  spawn: (p: Particle) => void,
): void {
  const tx = (building.tileX + building.width / 2) * TILE_SIZE;
  const ty = (building.tileY + building.height / 2) * TILE_SIZE;
  const dir = Math.atan2(ty - bot.y, tx - bot.x);
  const spread = (Math.random() - 0.5) * 1.2;
  const speed = 30 + Math.random() * 30;
  spawn({
    x: bot.x + Math.cos(dir) * 8,
    y: bot.y + Math.sin(dir) * 8 - 2,
    vx: Math.cos(dir + spread) * speed,
    vy: Math.sin(dir + spread) * speed - 30,
    life: 0.35, maxLife: 0.35,
    kind: 'spark',
    color: Math.random() < 0.55 ? '#7fe0c0' : '#c0f0e0',
    size: 1.6,
  });
}

function emitHarvestSpark(
  bot: GreaseBot,
  node: ResourceNode,
  spawn: (p: Particle) => void,
): void {
  const tx = (node.tileX + 0.5) * TILE_SIZE;
  const ty = (node.tileY + 0.5) * TILE_SIZE;
  const dir = Math.atan2(ty - bot.y, tx - bot.x);
  const spread = (Math.random() - 0.5) * 1.4;
  const speed = 40 + Math.random() * 40;
  const angle = dir + spread;
  spawn({
    x: bot.x + Math.cos(dir) * 8,
    y: bot.y + Math.sin(dir) * 8 - 2,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 40,
    life: 0.35 + Math.random() * 0.15,
    maxLife: 0.5,
    kind: 'spark',
    color: node.kind === 'oil'
      ? (Math.random() < 0.5 ? '#7f95c0' : '#c8d0d8')
      : (Math.random() < 0.4 ? '#ffe088' : '#ffb04a'),
    size: 1.6,
  });
}

function advanceAlongPath(bot: GreaseBot, dt: number): void {
  let remaining = BOT_SPEED * dt;
  while (remaining > 0 && bot.path.length > 0) {
    const next = bot.path[0];
    const targetX = (next.x + 0.5) * TILE_SIZE;
    const targetY = (next.y + 0.5) * TILE_SIZE;
    const dx = targetX - bot.x;
    const dy = targetY - bot.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.001) {
      bot.facing = shortestAngleStep(bot.facing, Math.atan2(dy, dx), 10 * dt);
    }
    if (dist <= remaining) {
      bot.treadPhase += dist;
      bot.x = targetX;
      bot.y = targetY;
      bot.path.shift();
      remaining -= dist;
    } else {
      bot.treadPhase += remaining;
      bot.x += (dx / dist) * remaining;
      bot.y += (dy / dist) * remaining;
      remaining = 0;
    }
  }
}

function shortestAngleStep(from: number, to: number, maxStep: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return to;
  return from + Math.sign(diff) * maxStep;
}

function applySeparation(bot: GreaseBot, others: GreaseBot[], dt: number): void {
  let pushX = 0;
  let pushY = 0;
  const minDist = BOT_RADIUS * 2;
  for (const other of others) {
    if (other === bot) continue;
    const dx = bot.x - other.x;
    const dy = bot.y - other.y;
    const d2 = dx * dx + dy * dy;
    if (d2 === 0 || d2 > minDist * minDist * 4) continue;
    const d = Math.sqrt(d2) || 0.001;
    const strength = (minDist * 1.6 - d) / (minDist * 1.6);
    if (strength <= 0) continue;
    pushX += (dx / d) * strength;
    pushY += (dy / d) * strength;
  }
  bot.x += pushX * 30 * dt;
  bot.y += pushY * 30 * dt;
}
