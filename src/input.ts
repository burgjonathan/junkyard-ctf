import { UNIT_RADIUS } from '../shared/constants.ts';
import type { Net } from './net.ts';
import type { ClientGame } from './game.ts';

export interface InputState {
  selectionBox: { x0: number; y0: number; x1: number; y1: number } | null;
  cursor: { x: number; y: number } | null;
}

interface AttachArgs {
  canvas: HTMLCanvasElement;
  net: Net;
  game: ClientGame;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
}

export function attachInput({ canvas, net, game, screenToWorld }: AttachArgs): InputState {
  const state: InputState = {
    selectionBox: null,
    cursor: null,
  };

  let dragStart: { x: number; y: number } | null = null;
  let didDrag = false;
  let seq = 0;

  const canvasPos = (ev: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (ev.clientX - rect.left) * scaleX, y: (ev.clientY - rect.top) * scaleY };
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('mousedown', (ev) => {
    const p = canvasPos(ev);
    if (ev.button === 0) {
      dragStart = p;
      didDrag = false;
      state.selectionBox = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    } else if (ev.button === 2) {
      if (game.selectedUnitIds.size === 0) return;
      const world = screenToWorld(p.x, p.y);
      net.send({
        type: 'command',
        seq: ++seq,
        unitIds: [...game.selectedUnitIds],
        target: world,
      });
      game.spawnCommandFlash(world.x, world.y);
    }
  });

  canvas.addEventListener('mousemove', (ev) => {
    const p = canvasPos(ev);
    state.cursor = p;
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
    if (ev.button !== 0) return;
    const p = canvasPos(ev);
    const add = ev.shiftKey;
    if (didDrag && dragStart) {
      const a = screenToWorld(dragStart.x, dragStart.y);
      const b = screenToWorld(p.x, p.y);
      const box = {
        x0: Math.min(a.x, b.x),
        y0: Math.min(a.y, b.y),
        x1: Math.max(a.x, b.x),
        y1: Math.max(a.y, b.y),
      };
      selectInWorldBox(game, box, add);
    } else if (dragStart) {
      const world = screenToWorld(p.x, p.y);
      selectAtWorldPoint(game, world, add);
    }
    dragStart = null;
    didDrag = false;
    state.selectionBox = null;
  });

  canvas.addEventListener('mouseleave', () => {
    state.cursor = null;
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      game.selectedUnitIds.clear();
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'a') {
      ev.preventDefault();
      for (const id of game.myUnitIds) game.selectedUnitIds.add(id);
    }
  });

  return state;
}

function selectAtWorldPoint(game: ClientGame, world: { x: number; y: number }, add: boolean): void {
  if (!game.latest) return;
  const clickR = UNIT_RADIUS + 4;
  let hit: string | null = null;
  for (const u of game.latest.units) {
    if (!game.myUnitIds.has(u.id)) continue;
    if (!u.alive) continue;
    const dx = u.x - world.x;
    const dy = u.y - world.y;
    if (dx * dx + dy * dy <= clickR * clickR) { hit = u.id; break; }
  }
  if (hit) {
    if (!add) game.selectedUnitIds.clear();
    game.selectedUnitIds.add(hit);
  } else if (!add) {
    game.selectedUnitIds.clear();
  }
}

function selectInWorldBox(
  game: ClientGame,
  box: { x0: number; y0: number; x1: number; y1: number },
  add: boolean,
): void {
  if (!game.latest) return;
  if (!add) game.selectedUnitIds.clear();
  for (const u of game.latest.units) {
    if (!game.myUnitIds.has(u.id)) continue;
    if (!u.alive) continue;
    if (u.x >= box.x0 && u.x <= box.x1 && u.y >= box.y0 && u.y <= box.y1) {
      game.selectedUnitIds.add(u.id);
    }
  }
}
