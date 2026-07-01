import type { StateSnapshot, PlayerSnapshot } from '../shared/types.ts';
import { generateMap, type MapData } from '../shared/map.ts';
import type { Team } from '../shared/constants.ts';

// One-off visual effect (hit spark, capture flash). Time-based.
export interface Effect {
  kind: 'hit' | 'capture';
  x: number;
  y: number;
  team: Team;
  life: number;
  maxLife: number;
}

export class ClientGame {
  playerId: string | null = null;
  team: Team | null = null;
  roomCode: string | null = null;
  map: MapData | null = null;
  latest: StateSnapshot | null = null;
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
  }

  updateEffects(dt: number): void {
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter(e => e.life > 0);
  }

  ownPlayer(): PlayerSnapshot | null {
    if (!this.latest || !this.playerId) return null;
    return this.latest.players.find(p => p.id === this.playerId) ?? null;
  }
}
