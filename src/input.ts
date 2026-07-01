import { CLIENT_INPUT_HZ } from '../shared/constants.ts';
import type { Net } from './net.ts';

export interface InputState {
  moveX: number;         // -1..1
  moveY: number;         // -1..1
  aimAngle: number;      // radians
  attack: boolean;
  mouseCanvasX: number;
  mouseCanvasY: number;
}

interface AttachArgs {
  canvas: HTMLCanvasElement;
  net: Net;
  // Given screen (canvas) coords, return world coords — used to translate mouse into aim direction.
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  // Returns the current hero's world position so we can compute aim angle from it.
  ownHeroPos: () => { x: number; y: number } | null;
}

export function attachInput({ canvas, net, screenToWorld, ownHeroPos }: AttachArgs): InputState {
  const state: InputState = {
    moveX: 0, moveY: 0,
    aimAngle: 0,
    attack: false,
    mouseCanvasX: 0, mouseCanvasY: 0,
  };

  const keys = new Set<string>();
  const canvasPos = (ev: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (ev.clientX - rect.left) * scaleX, y: (ev.clientY - rect.top) * scaleY };
  };

  window.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    const k = ev.key.toLowerCase();
    keys.add(k);
    updateMove();
    if (k === ' ' || k === 'j') state.attack = true;
  });
  window.addEventListener('keyup', (ev) => {
    const k = ev.key.toLowerCase();
    keys.delete(k);
    updateMove();
    if (k === ' ' || k === 'j') state.attack = false;
  });
  window.addEventListener('blur', () => {
    keys.clear();
    state.moveX = 0; state.moveY = 0;
    state.attack = false;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousemove', (ev) => {
    const p = canvasPos(ev);
    state.mouseCanvasX = p.x;
    state.mouseCanvasY = p.y;
  });
  canvas.addEventListener('mousedown', (ev) => {
    if (ev.button === 0) state.attack = true;
  });
  canvas.addEventListener('mouseup', (ev) => {
    if (ev.button === 0) state.attack = false;
  });

  function updateMove() {
    let mx = 0, my = 0;
    if (keys.has('a') || keys.has('arrowleft'))  mx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mx += 1;
    if (keys.has('w') || keys.has('arrowup'))    my -= 1;
    if (keys.has('s') || keys.has('arrowdown'))  my += 1;
    state.moveX = mx;
    state.moveY = my;
  }

  // Input send loop — sends the current input state to the server at CLIENT_INPUT_HZ.
  let seq = 0;
  const sendInterval = setInterval(() => {
    const hero = ownHeroPos();
    if (hero) {
      const world = screenToWorld(state.mouseCanvasX, state.mouseCanvasY);
      state.aimAngle = Math.atan2(world.y - hero.y, world.x - hero.x);
    }
    net.send({
      type: 'input',
      seq: ++seq,
      moveX: state.moveX,
      moveY: state.moveY,
      aimAngle: state.aimAngle,
      attack: state.attack,
    });
  }, 1000 / CLIENT_INPUT_HZ);
  window.addEventListener('beforeunload', () => clearInterval(sendInterval));

  return state;
}
