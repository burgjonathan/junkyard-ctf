export const TILE_SIZE = 24;

export const MAP_WIDTH = 100;
export const MAP_HEIGHT = 66;
export const WORLD_WIDTH = MAP_WIDTH * TILE_SIZE;    // 2400
export const WORLD_HEIGHT = MAP_HEIGHT * TILE_SIZE;  // 1584

// Squad-of-units mode: each player commands UNITS_PER_TEAM units.
export const UNITS_PER_TEAM = 5;
export const UNIT_RADIUS = 9;
export const UNIT_SPEED = 145;
export const UNIT_MAX_HP = 40;
export const UNIT_RESPAWN_TIME = 5;

export const ATTACK_COOLDOWN = 0.7;
export const ATTACK_RANGE = 28;          // must be inside this to swing
export const ATTACK_ARC_RAD = (100 * Math.PI) / 180;
export const ATTACK_DAMAGE = 12;
export const ATTACK_ANIM_TIME = 0.28;

export const DETECTION_RANGE = 90;       // enemies noticed within this radius

export const FLAG_PICKUP_RADIUS = 22;
export const FLAG_CAPTURE_RADIUS = 34;
export const FLAG_AUTORETURN_TIME = 6;

// Camera control speeds (client only, but nice to keep with constants)
export const CAMERA_KEY_SPEED = 800;
export const EDGE_SCROLL_MARGIN = 22;
export const EDGE_SCROLL_SPEED = 620;

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

// Bases are 9x9 walled rectangles centered on the base tile.
export const BASE_HALF = 4;
// HQ building is 2x2 tiles inside each base, tucked against the back wall.
export const RED_HQ = { x: RED_BASE_TILE.x - 3, y: RED_BASE_TILE.y - 1, w: 2, h: 2 };
export const BLUE_HQ = { x: BLUE_BASE_TILE.x + 1, y: BLUE_BASE_TILE.y - 1, w: 2, h: 2 };

export type Team = 'red' | 'blue';
export type MatchStatus = 'waiting' | 'playing' | 'ended';
