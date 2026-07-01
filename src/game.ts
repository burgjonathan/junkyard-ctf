import {
  TILE_SIZE,
  MAP_WIDTH,
  MAP_HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  INITIAL_VIEW_WIDTH,
  INITIAL_VIEW_HEIGHT,
  DROP_OFF_TIME,
  HARVEST_TIME,
  type ResourceKind,
} from './constants.ts';
import { GameMap, generateMap } from './map.ts';
import { findPath, findNearestWalkable, type TileCoord } from './pathfinding.ts';
import { GreaseBot, stepBot } from './bot.ts';
import { Garage } from './garage.ts';
import { ResourceNode } from './resource.ts';
import { Building, BUILDING_SPECS, type BuildingType } from './building.ts';
import { updateParticle, type Particle } from './particles.ts';

export interface Resources {
  scrap: number;
  oil: number;
}

export class Game {
  map: GameMap;
  garage: Garage;
  bots: GreaseBot[] = [];
  resourceNodes: ResourceNode[] = [];
  buildings: Building[] = [];
  resources: Resources = { scrap: 100, oil: 50 };
  particles: Particle[] = [];
  placementMode: BuildingType | null = null;
  camera: { x: number; y: number } = { x: 0, y: 0 };
  viewport: { width: number; height: number } = { width: INITIAL_VIEW_WIDTH, height: INITIAL_VIEW_HEIGHT };

  constructor(viewportWidth: number = INITIAL_VIEW_WIDTH, viewportHeight: number = INITIAL_VIEW_HEIGHT) {
    this.viewport.width = viewportWidth;
    this.viewport.height = viewportHeight;
    const garageTileX = 15;
    const garageTileY = 44;
    this.map = generateMap(garageTileX, garageTileY);
    this.garage = new Garage(garageTileX, garageTileY);
    this.spawnBotsNearGarage();
    this.scatterResources();
    this.centerCameraOn(
      (garageTileX + 1) * TILE_SIZE,
      (garageTileY + 1) * TILE_SIZE,
    );
  }

  setViewport(width: number, height: number): void {
    this.viewport.width = width;
    this.viewport.height = height;
    this.clampCamera();
  }

  private spawnBotsNearGarage(): void {
    const spawnTiles: TileCoord[] = [
      { x: this.garage.tileX + 2, y: this.garage.tileY },
      { x: this.garage.tileX + 2, y: this.garage.tileY + 1 },
      { x: this.garage.tileX - 1, y: this.garage.tileY },
      { x: this.garage.tileX - 1, y: this.garage.tileY + 1 },
    ];
    for (const t of spawnTiles) {
      this.bots.push(new GreaseBot(
        (t.x + 0.5) * TILE_SIZE,
        (t.y + 0.5) * TILE_SIZE,
      ));
    }
  }

  private scatterResources(): void {
    const spots: Array<{ x: number; y: number; kind: ResourceKind; amount: number }> = [
      { x: 25,  y: 40, kind: 'scrap', amount: 200 },
      { x: 28,  y: 47, kind: 'scrap', amount: 200 },
      { x: 32,  y: 42, kind: 'oil',   amount: 150 },
      { x: 22,  y: 52, kind: 'oil',   amount: 150 },
      { x: 8,   y: 36, kind: 'scrap', amount: 200 },
      { x: 10,  y: 55, kind: 'scrap', amount: 200 },
      { x: 45,  y: 20, kind: 'scrap', amount: 300 },
      { x: 55,  y: 30, kind: 'scrap', amount: 300 },
      { x: 60,  y: 55, kind: 'oil',   amount: 250 },
      { x: 40,  y: 70, kind: 'oil',   amount: 250 },
      { x: 70,  y: 45, kind: 'scrap', amount: 300 },
      { x: 50,  y: 65, kind: 'scrap', amount: 300 },
      { x: 90,  y: 15, kind: 'oil',   amount: 400 },
      { x: 100, y: 40, kind: 'oil',   amount: 400 },
      { x: 85,  y: 70, kind: 'scrap', amount: 400 },
      { x: 110, y: 60, kind: 'scrap', amount: 400 },
      { x: 105, y: 80, kind: 'oil',   amount: 400 },
      { x: 75,  y: 82, kind: 'scrap', amount: 400 },
      { x: 30,  y: 10, kind: 'oil',   amount: 250 },
      { x: 15,  y: 78, kind: 'scrap', amount: 250 },
    ];
    for (const s of spots) {
      if (!this.map.inBounds(s.x, s.y)) continue;
      this.resourceNodes.push(new ResourceNode(s.x, s.y, s.kind, s.amount));
    }
  }

  update(dt: number): void {
    for (const bot of this.bots) {
      stepBot(bot, {
        dt,
        bots: this.bots,
        onCarryFilled: (b) => this.sendBotToDropOff(b),
        onDropOff: (b) => this.completeDropOff(b),
        onArriveAtResource: (b) => this.sendBotToResource(b),
        onIdleWithCarry: (b) => this.sendBotToDropOff(b),
        spawnParticle: (p) => this.spawnParticle(p),
      });
    }
    this.resourceNodes = this.resourceNodes.filter((n) => !n.depleted);

    for (const b of this.buildings) this.updateBuilding(b, dt);

    for (const p of this.particles) updateParticle(p, dt);
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  spawnParticle(p: Particle): void {
    this.particles.push(p);
  }

  // ----- Camera -----

  clampCamera(): void {
    const maxX = Math.max(0, WORLD_WIDTH - this.viewport.width);
    const maxY = Math.max(0, WORLD_HEIGHT - this.viewport.height);
    this.camera.x = Math.max(0, Math.min(maxX, this.camera.x));
    this.camera.y = Math.max(0, Math.min(maxY, this.camera.y));
  }

  centerCameraOn(worldX: number, worldY: number): void {
    this.camera.x = worldX - this.viewport.width / 2;
    this.camera.y = worldY - this.viewport.height / 2;
    this.clampCamera();
  }

  panCamera(dx: number, dy: number): void {
    this.camera.x += dx;
    this.camera.y += dy;
    this.clampCamera();
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: sx + this.camera.x, y: sy + this.camera.y };
  }

  // ----- Path helpers -----

  isBlockedForPath(x: number, y: number): boolean {
    if (!this.map.isWalkable(x, y)) return true;
    if (this.garage.occupies(x, y)) return true;
    for (const b of this.buildings) {
      if (b.occupies(x, y)) return true;
    }
    for (const node of this.resourceNodes) {
      if (node.tileX === x && node.tileY === y) return true;
    }
    return false;
  }

  pathBetween(from: TileCoord, to: TileCoord): TileCoord[] {
    return findPath(from, to, (x, y) => this.isBlockedForPath(x, y), MAP_WIDTH, MAP_HEIGHT);
  }

  nearestReachableAdjacent(from: TileCoord, target: TileCoord): TileCoord | null {
    return findNearestWalkable(
      from,
      target,
      (x, y) => !this.isBlockedForPath(x, y),
      MAP_WIDTH,
      MAP_HEIGHT,
    );
  }

  // ----- Commands from input -----

  commandMove(bots: GreaseBot[], target: TileCoord): void {
    if (!this.map.inBounds(target.x, target.y)) return;
    for (const bot of bots) {
      let dest: TileCoord | null = target;
      if (this.isBlockedForPath(target.x, target.y)) {
        dest = this.nearestReachableAdjacent({ x: bot.tileX, y: bot.tileY }, target);
      }
      if (!dest) continue;
      const path = this.pathBetween({ x: bot.tileX, y: bot.tileY }, dest);
      bot.applyCommand({ type: 'goto', path });
    }
  }

  commandHarvest(bots: GreaseBot[], node: ResourceNode): void {
    for (const bot of bots) {
      bot.targetResource = node;
      bot.targetBuilding = null;
      this.sendBotToResource(bot);
    }
  }

  commandBuild(bots: GreaseBot[], building: Building): void {
    for (const bot of bots) {
      this.assignBotToBuilding(bot, building);
    }
  }

  findResourceAtTile(x: number, y: number): ResourceNode | null {
    for (const node of this.resourceNodes) {
      if (node.tileX === x && node.tileY === y) return node;
    }
    return null;
  }

  findBuildingAtTile(x: number, y: number): Building | null {
    for (const b of this.buildings) {
      if (b.occupies(x, y)) return b;
    }
    return null;
  }

  // ----- Placement -----

  startPlacement(type: BuildingType): void {
    this.placementMode = this.placementMode === type ? null : type;
  }

  cancelPlacement(): void {
    this.placementMode = null;
  }

  canAfford(type: BuildingType): boolean {
    const spec = BUILDING_SPECS[type];
    return this.resources.scrap >= spec.cost.scrap && this.resources.oil >= spec.cost.oil;
  }

  canPlaceAt(type: BuildingType, tx: number, ty: number): boolean {
    const spec = BUILDING_SPECS[type];
    for (let dy = 0; dy < spec.height; dy++) {
      for (let dx = 0; dx < spec.width; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if (!this.map.inBounds(x, y)) return false;
        if (this.isBlockedForPath(x, y)) return false;
      }
    }
    return true;
  }

  // Place blueprint at tile. Returns the new Building, or null if it failed.
  placeBuilding(tx: number, ty: number, assignBots: GreaseBot[]): Building | null {
    const type = this.placementMode;
    if (!type) return null;
    if (!this.canAfford(type)) return null;
    if (!this.canPlaceAt(type, tx, ty)) return null;
    const spec = BUILDING_SPECS[type];
    this.resources.scrap -= spec.cost.scrap;
    this.resources.oil -= spec.cost.oil;
    const b = new Building(type, tx, ty);
    this.buildings.push(b);

    // Prefer the caller's selection; fall back to nearest idle bots so the site doesn't stall.
    const workers = assignBots.length > 0
      ? assignBots
      : this.findNearestIdleBots(b, 3);
    for (const bot of workers) this.assignBotToBuilding(bot, b);

    this.placementMode = null;
    return b;
  }

  private findNearestIdleBots(b: Building, count: number): GreaseBot[] {
    const candidates = this.bots.filter((bot) => bot.state === 'idle' || bot.state === 'moving');
    candidates.sort((a, c) => {
      const dA = Math.abs(a.tileX - b.tileX) + Math.abs(a.tileY - b.tileY);
      const dC = Math.abs(c.tileX - b.tileX) + Math.abs(c.tileY - b.tileY);
      return dA - dC;
    });
    return candidates.slice(0, count);
  }

  private assignBotToBuilding(bot: GreaseBot, b: Building): void {
    bot.targetBuilding = b;
    bot.targetResource = null;
    // Path to a walkable tile adjacent to the building footprint.
    const adj = this.findAdjacentBuildableTile(bot, b);
    if (!adj) { bot.state = 'idle'; bot.targetBuilding = null; return; }
    const path = this.pathBetween({ x: bot.tileX, y: bot.tileY }, adj);
    bot.path = path;
    if (path.length > 0) {
      bot.state = 'moving';
    } else {
      bot.state = 'building';
    }
  }

  private findAdjacentBuildableTile(bot: GreaseBot, b: Building): TileCoord | null {
    // Scan the ring around the building footprint; pick the closest walkable one.
    const candidates: TileCoord[] = [];
    for (let ay = b.tileY - 1; ay <= b.tileY + b.height; ay++) {
      for (let ax = b.tileX - 1; ax <= b.tileX + b.width; ax++) {
        const insideX = ax >= b.tileX && ax < b.tileX + b.width;
        const insideY = ay >= b.tileY && ay < b.tileY + b.height;
        if (insideX && insideY) continue;
        if (!this.map.inBounds(ax, ay)) continue;
        if (this.isBlockedForPath(ax, ay)) continue;
        candidates.push({ x: ax, y: ay });
      }
    }
    if (candidates.length === 0) return null;
    let best = candidates[0];
    let bestD = Math.abs(bot.tileX - best.x) + Math.abs(bot.tileY - best.y);
    for (let i = 1; i < candidates.length; i++) {
      const d = Math.abs(bot.tileX - candidates[i].x) + Math.abs(bot.tileY - candidates[i].y);
      if (d < bestD) { best = candidates[i]; bestD = d; }
    }
    return best;
  }

  // ----- Building tick -----

  private updateBuilding(b: Building, dt: number): void {
    if (!b.built) {
      let workers = 0;
      for (const bot of this.bots) {
        if (bot.targetBuilding === b && bot.state === 'building') workers++;
      }
      b.progress += workers * dt;
      if (b.progress >= b.spec.buildTime) {
        b.built = true;
        b.progress = b.spec.buildTime;
        // Release worker bots and pop a completion flash.
        for (const bot of this.bots) {
          if (bot.targetBuilding === b) {
            bot.targetBuilding = null;
            bot.state = 'idle';
          }
        }
        const c = b.centerPixel();
        this.spawnParticle({
          x: c.x, y: c.y,
          vx: 0, vy: 0,
          life: 0.6, maxLife: 0.6,
          kind: 'ring', color: '#8be0a4', size: 6,
        });
      }
      return;
    }

    // Built: production loop only relevant for fabricators.
    if (b.type === 'fabricator' && b.spec.productionCost && b.spec.productionTime) {
      const cost = b.spec.productionCost;
      if (this.resources.scrap >= cost.scrap && this.resources.oil >= cost.oil) {
        b.productionProgress += dt;
        if (b.productionProgress >= b.spec.productionTime) {
          const spawn = this.findAdjacentBuildableTile(
            { tileX: b.tileX + Math.floor(b.width / 2), tileY: b.tileY + Math.floor(b.height / 2) } as GreaseBot,
            b,
          );
          if (spawn) {
            this.resources.scrap -= cost.scrap;
            this.resources.oil -= cost.oil;
            b.productionProgress = 0;
            const newBot = new GreaseBot(
              (spawn.x + 0.5) * TILE_SIZE,
              (spawn.y + 0.5) * TILE_SIZE,
            );
            this.bots.push(newBot);
            const c = b.centerPixel();
            this.spawnParticle({
              x: c.x, y: c.y,
              vx: 0, vy: 0,
              life: 0.5, maxLife: 0.5,
              kind: 'ring', color: '#ffdb54', size: 4,
            });
          } else {
            // No exit tile available — pause production and wait for space.
            b.productionProgress = b.spec.productionTime;
          }
        }
      }
    }
  }

  // ----- Transitions -----

  private sendBotToResource(bot: GreaseBot): void {
    const node = bot.targetResource;
    if (!node || node.depleted) {
      bot.state = 'idle';
      bot.targetResource = null;
      return;
    }
    const adj = this.nearestReachableAdjacent(
      { x: bot.tileX, y: bot.tileY },
      { x: node.tileX, y: node.tileY },
    );
    if (!adj) { bot.state = 'idle'; return; }
    const path = this.pathBetween({ x: bot.tileX, y: bot.tileY }, adj);
    if (path.length === 0 && !(bot.tileX === adj.x && bot.tileY === adj.y)) {
      bot.state = 'idle';
      return;
    }
    bot.path = path;
    bot.state = path.length > 0 ? 'moving' : 'harvesting';
    if (bot.state === 'harvesting') bot.actionTimer = HARVEST_TIME;
  }

  // Nearest built drop-off (Garage or any completed Depot).
  private sendBotToDropOff(bot: GreaseBot): void {
    type DropOff = { tx: number; ty: number; w: number; h: number };
    const dropOffs: DropOff[] = [{
      tx: this.garage.tileX, ty: this.garage.tileY,
      w: this.garage.width, h: this.garage.height,
    }];
    for (const b of this.buildings) {
      if (b.type === 'depot' && b.built) {
        dropOffs.push({ tx: b.tileX, ty: b.tileY, w: b.width, h: b.height });
      }
    }

    let best = dropOffs[0];
    let bestD = Math.abs(bot.tileX - (best.tx + best.w / 2))
              + Math.abs(bot.tileY - (best.ty + best.h / 2));
    for (let i = 1; i < dropOffs.length; i++) {
      const d = Math.abs(bot.tileX - (dropOffs[i].tx + dropOffs[i].w / 2))
              + Math.abs(bot.tileY - (dropOffs[i].ty + dropOffs[i].h / 2));
      if (d < bestD) { best = dropOffs[i]; bestD = d; }
    }

    const adj = this.nearestReachableAdjacent(
      { x: bot.tileX, y: bot.tileY },
      { x: best.tx, y: best.ty },
    );
    const target = adj ?? this.nearestReachableAdjacent(
      { x: bot.tileX, y: bot.tileY },
      { x: best.tx + best.w - 1, y: best.ty + best.h - 1 },
    );
    if (!target) {
      bot.state = 'droppingOff';
      bot.actionTimer = DROP_OFF_TIME;
      return;
    }
    const path = this.pathBetween({ x: bot.tileX, y: bot.tileY }, target);
    bot.path = path;
    bot.state = path.length > 0 ? 'moving' : 'droppingOff';
    if (bot.state === 'droppingOff') bot.actionTimer = DROP_OFF_TIME;
  }

  private completeDropOff(bot: GreaseBot): void {
    if (bot.carryingKind === 'scrap') this.resources.scrap += bot.carrying;
    else if (bot.carryingKind === 'oil') this.resources.oil += bot.carrying;
    this.spawnParticle({
      x: bot.x, y: bot.y,
      vx: 0, vy: 0,
      life: 0.4, maxLife: 0.4,
      kind: 'ring',
      color: bot.carryingKind === 'oil' ? '#7f95c0' : '#ffdb54',
      size: 4,
    });
    bot.carrying = 0;
    bot.carryingKind = null;
  }
}
