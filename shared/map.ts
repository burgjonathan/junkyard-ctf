import {
  TILE_SIZE,
  MAP_WIDTH,
  MAP_HEIGHT,
  RED_BASE_TILE,
  BLUE_BASE_TILE,
} from './constants.ts';

export const TILE = { SAND: 0, ROCK: 1 } as const;
export type TileKind = typeof TILE[keyof typeof TILE];

export interface MapData {
  width: number;
  height: number;
  tiles: Uint8Array;
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

export function generateMap(seed: number): MapData {
  const tiles = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  const rng = mulberry32(seed);

  const clusterCount = 34;
  for (let c = 0; c < clusterCount; c++) {
    // Bias clusters away from the exact center row so bases have a highway.
    const cx = Math.floor(rng() * MAP_WIDTH);
    const cy = Math.floor(rng() * MAP_HEIGHT);
    const size = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < size; i++) {
      const dx = cx + Math.floor(rng() * 5) - 2;
      const dy = cy + Math.floor(rng() * 5) - 2;
      if (dx >= 0 && dy >= 0 && dx < MAP_WIDTH && dy < MAP_HEIGHT) {
        tiles[dy * MAP_WIDTH + dx] = TILE.ROCK;
      }
    }
  }

  // Mirror-copy left half to right half so the arena is symmetric.
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < Math.floor(MAP_WIDTH / 2); x++) {
      tiles[y * MAP_WIDTH + (MAP_WIDTH - 1 - x)] = tiles[y * MAP_WIDTH + x];
    }
  }

  clearZone(tiles, RED_BASE_TILE.x, RED_BASE_TILE.y, 5);
  clearZone(tiles, BLUE_BASE_TILE.x, BLUE_BASE_TILE.y, 5);
  return { width: MAP_WIDTH, height: MAP_HEIGHT, tiles };
}

function clearZone(tiles: Uint8Array, cx: number, cy: number, r: number): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT) {
        tiles[y * MAP_WIDTH + x] = TILE.SAND;
      }
    }
  }
}

export function tileAt(map: MapData, tx: number, ty: number): TileKind {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return TILE.ROCK;
  return map.tiles[ty * map.width + tx] as TileKind;
}

export function isBlockedAtPixel(map: MapData, px: number, py: number): boolean {
  const tx = Math.floor(px / TILE_SIZE);
  const ty = Math.floor(py / TILE_SIZE);
  return tileAt(map, tx, ty) === TILE.ROCK;
}
