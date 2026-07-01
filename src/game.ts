import type { StateSnapshot, UnitSnapshot } from '../shared/types.ts';
import { generateMap, type MapData } from '../shared/map.ts';
import type { Team } from '../shared/constants.ts';

export interface Effect {
  kind: 'hit' | 'capture' | 'commandMove';
  x: number;
  y: number;
  team: Team | null;
  life: number;
  maxLife: number;
}

export class ClientGame {
  playerId: string | null = null;
  team: Team | null = null;
  roomCode: string | null = null;
  map: MapData | null = null;
  latest: StateSnapshot | null = null;

  // Client-only state:
  myUnitIds: Set<string> = new Set();
  selectedUnitIds: Set<string> = new Set();
  effects: Effect[] = [];

  setMap(seed: number): void {
    this.map = generateMap(seed);
  }

  applySnapshot(snap: StateSnapshot): void {
    this.latest = snap;
    for (const h of snap.hits) {
      this.effects.push({ kind: 'hit', x: h.x, y: h.y, team: h.team, life: 0.35, maxLife: 0.35 });
    }
    for (const c of snap.captures) {
      this.effects.push({ kind: 'capture', x: c.x, y: c.y, team: c.team, life: 0.8, maxLife: 0.8 });
    }
    // Clean up selection for units that no longer exist
    const known = new Set(snap.units.map(u => u.id));
    for (const id of this.selectedUnitIds) {
      if (!known.has(id)) this.selectedUnitIds.delete(id);
    }
  }

  updateEffects(dt: number): void {
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter(e => e.life > 0);
  }

  spawnCommandFlash(x: number, y: number): void {
    this.effects.push({
      kind: 'commandMove', x, y, team: this.team,
      life: 0.45, maxLife: 0.45,
    });
  }

  myUnits(): UnitSnapshot[] {
    if (!this.latest) return [];
    return this.latest.units.filter(u => this.myUnitIds.has(u.id));
  }
}
