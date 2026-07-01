import './style.css';
import { Net } from './net.ts';
import { attachLobby, showLobbyError, showScreen, setRoomCodeDisplay, setEndedText } from './lobby.ts';
import { ClientGame } from './game.ts';
import { attachInput } from './input.ts';
import { render, computeView } from './render.ts';

const canvasEl = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvasEl) throw new Error('Canvas not found');
const canvas: HTMLCanvasElement = canvasEl;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2D context not available');

const viewport = { width: window.innerWidth, height: window.innerHeight };
function fitCanvas(): void {
  viewport.width = window.innerWidth;
  viewport.height = window.innerHeight;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

const net = new Net();
const game = new ClientGame();

// World-space converter — invert the fit-to-window transform used by render.
function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  const v = computeView(viewport);
  return { x: (sx - v.offsetX) / v.scale, y: (sy - v.offsetY) / v.scale };
}

// Attach input immediately — send loop only fires once we have an own player, but ok.
const input = attachInput({
  canvas,
  net,
  screenToWorld,
  ownHeroPos: () => {
    const own = game.ownPlayer();
    return own ? { x: own.x, y: own.y } : null;
  },
});

attachLobby(net, {
  onCreate: () => net.send({ type: 'createRoom' }),
  onJoin: (roomCode) => net.send({ type: 'joinRoom', roomCode }),
});

net.onMessage((msg) => {
  if (msg.type === 'joined') {
    game.playerId = msg.playerId;
    game.team = msg.team;
    game.roomCode = msg.roomCode;
    game.setMap(msg.mapSeed);
    setRoomCodeDisplay(msg.roomCode);
    showScreen('waiting');
  } else if (msg.type === 'error') {
    showLobbyError(msg.message);
  } else if (msg.type === 'state') {
    game.applySnapshot(msg.snap);
    if (msg.snap.status === 'playing') {
      showScreen('game');
    } else if (msg.snap.status === 'ended' && msg.snap.winner) {
      const youWon = msg.snap.winner === game.team;
      setEndedText(
        youWon ? 'Victory' : 'Defeat',
        `Final: Red ${msg.snap.scores.red} — Blue ${msg.snap.scores.blue}`,
      );
      showScreen('ended');
    }
  }
});

net.onClose(() => {
  showScreen('disconnected');
});

// Dev: Vite serves the client on :5173 and the ws server is separate on :3001.
// Prod: a single Node service serves both — connect same-origin (wss on HTTPS, ws on HTTP).
const wsUrl = import.meta.env.DEV
  ? `ws://${location.hostname || 'localhost'}:3001`
  : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
net.connect(wsUrl).catch(() => {
  showLobbyError(`Cannot reach server at ${wsUrl}. Is it running?`);
});

// Render loop
let lastTime = performance.now();
let elapsed = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  elapsed += dt;
  game.updateEffects(dt);
  render(ctx!, game, viewport, elapsed, {
    x: input.mouseCanvasX,
    y: input.mouseCanvasY,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
