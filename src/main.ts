import './style.css';
import { Game } from './game.ts';
import { render } from './render.ts';
import { attachInput, updateCameraFromInput } from './input.ts';

const canvasEl = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvasEl) throw new Error('Canvas #game not found');
const canvas: HTMLCanvasElement = canvasEl;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2D context unavailable');

function currentSize(): { w: number; h: number } {
  return { w: Math.max(320, window.innerWidth), h: Math.max(240, window.innerHeight) };
}

const initial = currentSize();
canvas.width = initial.w;
canvas.height = initial.h;

const game = new Game(initial.w, initial.h);
const input = attachInput(canvas, game);

function handleResize(): void {
  const s = currentSize();
  canvas.width = s.w;
  canvas.height = s.h;
  game.setViewport(s.w, s.h);
}
window.addEventListener('resize', handleResize);

let lastTime = performance.now();
let elapsed = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  elapsed += dt;
  updateCameraFromInput(game, input, dt);
  game.update(dt);
  render(ctx!, game, input, elapsed);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
