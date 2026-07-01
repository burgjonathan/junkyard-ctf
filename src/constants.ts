export const TILE_SIZE = 24;

// World (map) is much bigger than any viewport. Camera pans over it.
export const MAP_WIDTH = 120;
export const MAP_HEIGHT = 90;
export const WORLD_WIDTH = MAP_WIDTH * TILE_SIZE;
export const WORLD_HEIGHT = MAP_HEIGHT * TILE_SIZE;

// Fallback viewport used before main.ts calls setViewport().
export const INITIAL_VIEW_WIDTH = 960;
export const INITIAL_VIEW_HEIGHT = 720;

export const CAMERA_KEY_SPEED = 700;      // pixels/sec when using WASD/arrows
export const EDGE_SCROLL_MARGIN = 20;     // pixels from canvas edge that trigger scroll
export const EDGE_SCROLL_SPEED = 550;

export const BOT_SPEED = 95;
export const BOT_RADIUS = 9;
export const BOT_SEPARATION_RADIUS = 20;
export const BOT_SEPARATION_STRENGTH = 55;

export const HARVEST_TIME = 1.2;
export const DROP_OFF_TIME = 0.3;
export const CARRY_CAPACITY = 5;

export const TERRAIN = {
  SAND: 0,
  ROCK: 1,
} as const;
export type TerrainKind = typeof TERRAIN[keyof typeof TERRAIN];

export type ResourceKind = 'scrap' | 'oil';
