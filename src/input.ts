import {
  TILE_SIZE,
  BOT_RADIUS,
  CAMERA_KEY_SPEED,
  EDGE_SCROLL_MARGIN,
  EDGE_SCROLL_SPEED,
} from './constants.ts';
import type { Game } from './game.ts';
import type { GreaseBot } from './bot.ts';
import { hitBuildButton } from './ui.ts';

export interface InputState {
  selectionBox: { x0: number; y0: number; x1: number; y1: number } | null;
  keyPan: { x: number; y: number };
  cursor: { x: number; y: number } | null;
  // Cursor in world tile coords — useful for placement ghost rendering.
  worldTile: { x: number; y: number } | null;
}

export function attachInput(canvas: HTMLCanvasElement, game: Game): InputState {
  const state: InputState = {
    selectionBox: null,
    keyPan: { x: 0, y: 0 },
    cursor: null,
    worldTile: null,
  };

  const keys = new Set<string>();

  let dragStart: { x: number; y: number } | null = null;
  let didDrag = false;
  let panStart: { x: number; y: number } | null = null;

  const canvasPos = (ev: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (ev.clientX - rect.left) * scaleX,
      y: (ev.clientY - rect.top) * scaleY,
    };
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('mousedown', (ev) => {
    const p = canvasPos(ev);
    if (ev.button === 0) {
      // Check for build-menu button click first (screen-space UI).
      const btn = hitBuildButton(p.x, p.y, game.viewport);
      if (btn) {
        if (game.canAfford(btn.type) || game.placementMode === btn.type) {
          game.startPlacement(btn.type);
        }
        return;
      }
      // If in placement mode, attempt to place at hovered tile.
      if (game.placementMode) {
        const world = game.screenToWorld(p.x, p.y);
        const tx = Math.floor(world.x / TILE_SIZE);
        const ty = Math.floor(world.y / TILE_SIZE);
        const selected = game.bots.filter((b) => b.selected);
        const placed = game.placeBuilding(tx, ty, selected);
        if (placed) {
          game.spawnParticle({
            x: (tx + placed.width / 2) * TILE_SIZE,
            y: (ty + placed.height / 2) * TILE_SIZE,
            vx: 0, vy: 0,
            life: 0.5, maxLife: 0.5,
            kind: 'ring', color: '#7fe0c0', size: 3,
          });
        }
        return;
      }
      // Normal left-click: begin possible selection/box-select.
      dragStart = p;
      didDrag = false;
      state.selectionBox = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    } else if (ev.button === 1) {
      panStart = p;
      ev.preventDefault();
    } else if (ev.button === 2) {
      if (game.placementMode) {
        game.cancelPlacement();
        return;
      }
      const world = game.screenToWorld(p.x, p.y);
      handleRightClick(game, world);
    }
  });

  canvas.addEventListener('mousemove', (ev) => {
    const p = canvasPos(ev);
    state.cursor = p;
    const world = game.screenToWorld(p.x, p.y);
    state.worldTile = { x: Math.floor(world.x / TILE_SIZE), y: Math.floor(world.y / TILE_SIZE) };

    if (panStart) {
      const dx = p.x - panStart.x;
      const dy = p.y - panStart.y;
      game.panCamera(-dx, -dy);
      panStart = p;
      return;
    }

    if (dragStart) {
      const dx = p.x - dragStart.x;
      const dy = p.y - dragStart.y;
      if (Math.hypot(dx, dy) > 4) didDrag = true;
      if (state.selectionBox) {
        state.selectionBox.x1 = p.x;
        state.selectionBox.y1 = p.y;
      }
    }
  });

  canvas.addEventListener('mouseup', (ev) => {
    if (ev.button === 1) { panStart = null; return; }
    if (ev.button !== 0) return;
    // Suppress selection commit if we're in placement mode.
    if (game.placementMode) {
      dragStart = null;
      didDrag = false;
      state.selectionBox = null;
      return;
    }
    const p = canvasPos(ev);
    const addToSelection = ev.shiftKey;
    if (didDrag && dragStart) {
      const box = {
        x0: Math.min(dragStart.x, p.x),
        y0: Math.min(dragStart.y, p.y),
        x1: Math.max(dragStart.x, p.x),
        y1: Math.max(dragStart.y, p.y),
      };
      selectInBox(game, box, addToSelection);
    } else if (dragStart) {
      selectAtPoint(game, p, addToSelection);
    }
    dragStart = null;
    didDrag = false;
    state.selectionBox = null;
  });

  canvas.addEventListener('mouseleave', () => {
    state.cursor = null;
    state.worldTile = null;
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      game.cancelPlacement();
      for (const b of game.bots) b.selected = false;
    }
    if (ev.repeat) return;
    keys.add(ev.key.toLowerCase());
    updateKeyPan(keys, state);
  });
  window.addEventListener('keyup', (ev) => {
    keys.delete(ev.key.toLowerCase());
    updateKeyPan(keys, state);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    updateKeyPan(keys, state);
  });

  return state;
}

function updateKeyPan(keys: Set<string>, state: InputState): void {
  let vx = 0;
  let vy = 0;
  if (keys.has('a') || keys.has('arrowleft'))  vx -= 1;
  if (keys.has('d') || keys.has('arrowright')) vx += 1;
  if (keys.has('w') || keys.has('arrowup'))    vy -= 1;
  if (keys.has('s') || keys.has('arrowdown'))  vy += 1;
  const len = Math.hypot(vx, vy);
  if (len > 0) { vx /= len; vy /= len; }
  state.keyPan.x = vx;
  state.keyPan.y = vy;
}

export function updateCameraFromInput(game: Game, state: InputState, dt: number): void {
  if (state.keyPan.x !== 0 || state.keyPan.y !== 0) {
    game.panCamera(state.keyPan.x * CAMERA_KEY_SPEED * dt, state.keyPan.y * CAMERA_KEY_SPEED * dt);
  }
  if (state.cursor) {
    let ex = 0;
    let ey = 0;
    if (state.cursor.x < EDGE_SCROLL_MARGIN) ex -= 1;
    else if (state.cursor.x > game.viewport.width - EDGE_SCROLL_MARGIN) ex += 1;
    if (state.cursor.y < EDGE_SCROLL_MARGIN) ey -= 1;
    else if (state.cursor.y > game.viewport.height - EDGE_SCROLL_MARGIN) ey += 1;
    if (ex !== 0 || ey !== 0) {
      const len = Math.hypot(ex, ey) || 1;
      game.panCamera((ex / len) * EDGE_SCROLL_SPEED * dt, (ey / len) * EDGE_SCROLL_SPEED * dt);
    }
  }
}

function selectAtPoint(game: Game, screen: { x: number; y: number }, add: boolean): void {
  const world = game.screenToWorld(screen.x, screen.y);
  let hit: GreaseBot | null = null;
  for (const bot of game.bots) {
    const dx = bot.x - world.x;
    const dy = bot.y - world.y;
    if (dx * dx + dy * dy <= (BOT_RADIUS + 2) * (BOT_RADIUS + 2)) {
      hit = bot;
      break;
    }
  }
  if (hit) {
    if (!add) for (const b of game.bots) b.selected = false;
    hit.selected = true;
  } else if (!add) {
    for (const b of game.bots) b.selected = false;
  }
}

function selectInBox(
  game: Game,
  screenBox: { x0: number; y0: number; x1: number; y1: number },
  add: boolean,
): void {
  const a = game.screenToWorld(screenBox.x0, screenBox.y0);
  const b = game.screenToWorld(screenBox.x1, screenBox.y1);
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  if (!add) for (const bot of game.bots) bot.selected = false;
  for (const bot of game.bots) {
    if (bot.x >= x0 && bot.x <= x1 && bot.y >= y0 && bot.y <= y1) {
      bot.selected = true;
    }
  }
}

function handleRightClick(game: Game, world: { x: number; y: number }): void {
  const selected = game.bots.filter((b) => b.selected);
  if (selected.length === 0) return;
  const tx = Math.floor(world.x / TILE_SIZE);
  const ty = Math.floor(world.y / TILE_SIZE);

  const resource = game.findResourceAtTile(tx, ty);
  if (resource) {
    game.commandHarvest(selected, resource);
    game.spawnParticle({
      x: (resource.tileX + 0.5) * TILE_SIZE,
      y: (resource.tileY + 0.5) * TILE_SIZE,
      vx: 0, vy: 0,
      life: 0.45, maxLife: 0.45,
      kind: 'ring', color: '#8be09a', size: 3,
    });
    return;
  }

  const building = game.findBuildingAtTile(tx, ty);
  if (building && !building.built) {
    game.commandBuild(selected, building);
    game.spawnParticle({
      x: (building.tileX + building.width / 2) * TILE_SIZE,
      y: (building.tileY + building.height / 2) * TILE_SIZE,
      vx: 0, vy: 0,
      life: 0.45, maxLife: 0.45,
      kind: 'ring', color: '#7fe0c0', size: 3,
    });
    return;
  }

  game.commandMove(selected, { x: tx, y: ty });
  game.spawnParticle({
    x: (tx + 0.5) * TILE_SIZE,
    y: (ty + 0.5) * TILE_SIZE,
    vx: 0, vy: 0,
    life: 0.45, maxLife: 0.45,
    kind: 'ring', color: '#ffdb54', size: 3,
  });
}
