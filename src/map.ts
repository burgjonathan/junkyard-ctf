import { MAP_WIDTH, MAP_HEIGHT, TERRAIN, type TerrainKind } from './constants.ts';

export interface Tile {
  kind: TerrainKind;
}

export class GameMap {
  width: number;
  height: number;
  tiles: Tile[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.tiles = new Array(width * height);
    for (let i = 0; i < this.tiles.length; i++) {
      this.tiles[i] = { kind: TERRAIN.SAND };
    }
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Tile {
    return this.tiles[y * this.width + x];
  }

  set(x: number, y: number, kind: TerrainKind): void {
    this.tiles[y * this.width + x].kind = kind;
  }

  isWalkable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.get(x, y).kind === TERRAIN.SAND;
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMap(spawnTileX: number, spawnTileY: number): GameMap {
  const map = new GameMap(MAP_WIDTH, MAP_HEIGHT);
  const rng = mulberry32(1337);

  // Scale junk-pile clusters to map area — ~1 cluster per 90 tiles.
  const clusterCount = Math.round((MAP_WIDTH * MAP_HEIGHT) / 90);
  for (let c = 0; c < clusterCount; c++) {
    const cx = Math.floor(rng() * MAP_WIDTH);
    const cy = Math.floor(rng() * MAP_HEIGHT);
    const size = 3 + Math.floor(rng() * 5);
    for (let i = 0; i < size; i++) {
      const dx = cx + Math.floor(rng() * 5) - 2;
      const dy = cy + Math.floor(rng() * 5) - 2;
      if (map.inBounds(dx, dy)) map.set(dx, dy, TERRAIN.ROCK);
    }
  }

  // Clear a generous spawn zone around the Garage so the base isn't buried.
  const clearR = 5;
  for (let y = spawnTileY - clearR; y <= spawnTileY + clearR + 2; y++) {
    for (let x = spawnTileX - clearR; x <= spawnTileX + clearR + 2; x++) {
      if (map.inBounds(x, y)) map.set(x, y, TERRAIN.SAND);
    }
  }

  return map;
}
