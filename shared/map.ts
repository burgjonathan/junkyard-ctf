import {
  TILE_SIZE,
  MAP_WIDTH,
  MAP_HEIGHT,
  RED_BASE_TILE,
  BLUE_BASE_TILE,
  RED_HQ,
  BLUE_HQ,
  BASE_HALF,
} from './constants.ts';

export const TILE = { SAND: 0, ROCK: 1 } as const;
export type TileKind = typeof TILE[keyof typeof TILE];

export interface MapData {
  width: number;
  height: number;
  tiles: Uint8Array;
}

export function generateMap(_seed: number): MapData {
  const tiles = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  addBaseWalls(tiles, RED_BASE_TILE.x, RED_BASE_TILE.y, 'east');
  addBaseWalls(tiles, BLUE_BASE_TILE.x, BLUE_BASE_TILE.y, 'west');
  addRect(tiles, RED_HQ.x, RED_HQ.y, RED_HQ.w, RED_HQ.h);
  addRect(tiles, BLUE_HQ.x, BLUE_HQ.y, BLUE_HQ.w, BLUE_HQ.h);
  return { width: MAP_WIDTH, height: MAP_HEIGHT, tiles };
}

function addBaseWalls(tiles: Uint8Array, cx: number, cy: number, gateSide: 'east' | 'west'): void {
  for (let y = cy - BASE_HALF; y <= cy + BASE_HALF; y++) {
    for (let x = cx - BASE_HALF; x <= cx + BASE_HALF; x++) {
      const onXEdge = x === cx - BASE_HALF || x === cx + BASE_HALF;
      const onYEdge = y === cy - BASE_HALF || y === cy + BASE_HALF;
      if (!onXEdge && !onYEdge) continue;
      // Gate opening — 3 tiles wide centered on cy
      if (gateSide === 'east' && x === cx + BASE_HALF && Math.abs(y - cy) <= 1) continue;
      if (gateSide === 'west' && x === cx - BASE_HALF && Math.abs(y - cy) <= 1) continue;
      setTile(tiles, x, y, TILE.ROCK);
    }
  }
}

function addRect(tiles: Uint8Array, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setTile(tiles, x + dx, y + dy, TILE.ROCK);
    }
  }
}

function setTile(tiles: Uint8Array, x: number, y: number, kind: TileKind): void {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return;
  tiles[y * MAP_WIDTH + x] = kind;
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
