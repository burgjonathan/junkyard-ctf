export const TILE_SIZE = 24;

export const MAP_WIDTH = 60;
export const MAP_HEIGHT = 40;
export const WORLD_WIDTH = MAP_WIDTH * TILE_SIZE;    // 1440
export const WORLD_HEIGHT = MAP_HEIGHT * TILE_SIZE;  // 960

export const HERO_RADIUS = 11;
export const HERO_SPEED = 135;
export const HERO_MAX_HP = 100;
export const HERO_RESPAWN_TIME = 3;

export const ATTACK_COOLDOWN = 0.45;
export const ATTACK_REACH = 34;
export const ATTACK_ARC_RAD = (95 * Math.PI) / 180;
export const ATTACK_DAMAGE = 25;
export const ATTACK_ANIM_TIME = 0.28;

export const FLAG_PICKUP_RADIUS = 18;
export const FLAG_CAPTURE_RADIUS = 24;
export const FLAG_AUTORETURN_TIME = 6;

export const CAPTURES_TO_WIN = 3;

export const SERVER_SIM_HZ = 30;
export const SERVER_BROADCAST_HZ = 20;
export const CLIENT_INPUT_HZ = 30;

export const RED_BASE_TILE = { x: 5, y: 20 };
export const BLUE_BASE_TILE = { x: MAP_WIDTH - 6, y: 20 };
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
