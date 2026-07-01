export const TILE_SIZE = 24;

export const MAP_WIDTH = 100;
export const MAP_HEIGHT = 66;
export const WORLD_WIDTH = MAP_WIDTH * TILE_SIZE;    // 2400
export const WORLD_HEIGHT = MAP_HEIGHT * TILE_SIZE;  // 1584

export const HERO_RADIUS = 14;
export const HERO_SPEED = 205;
export const HERO_MAX_HP = 100;
export const HERO_RESPAWN_TIME = 3;

export const ATTACK_COOLDOWN = 0.45;
export const ATTACK_REACH = 42;
export const ATTACK_ARC_RAD = (95 * Math.PI) / 180;
export const ATTACK_DAMAGE = 25;
export const ATTACK_ANIM_TIME = 0.28;

export const FLAG_PICKUP_RADIUS = 24;
export const FLAG_CAPTURE_RADIUS = 34;
export const FLAG_AUTORETURN_TIME = 6;

export const CAPTURES_TO_WIN = 3;

export const SERVER_SIM_HZ = 30;
export const SERVER_BROADCAST_HZ = 20;
export const CLIENT_INPUT_HZ = 30;

export const RED_BASE_TILE = { x: 8, y: 33 };
export const BLUE_BASE_TILE = { x: MAP_WIDTH - 9, y: 33 };
export const RED_BASE = {
  x: (RED_BASE_TILE.x + 0.5) * TILE_SIZE,
  y: (RED_BASE_TILE.y + 0.5) * TILE_SIZE,
};
export const BLUE_BASE = {
  x: (BLUE_BASE_TILE.x + 0.5) * TILE_SIZE,
  y: (BLUE_BASE_TILE.y + 0.5) * TILE_SIZE,
};

export type Team = 'red' | 'blue';
export type MatchStatus = 'waiting' | 'playing' | 'ended';
