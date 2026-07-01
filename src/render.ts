import {
  TILE_SIZE,
  BOT_RADIUS,
  TERRAIN,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from './constants.ts';
import type { Game } from './game.ts';
import type { GreaseBot } from './bot.ts';
import type { ResourceNode } from './resource.ts';
import type { Garage } from './garage.ts';
import type { GameMap } from './map.ts';
import type { Building } from './building.ts';
import { BUILDING_SPECS } from './building.ts';
import type { InputState } from './input.ts';
import { drawParticle } from './particles.ts';
import { getBuildButtons } from './ui.ts';

const COLORS = {
  sand:       '#3b3226',
  sandDot:    '#4a3f30',
  sandDark:   '#2b241a',
  rock:       '#5a4b3a',
  rockHi:     '#7c6a52',
  rockLo:     '#3d3325',
  rockChunk:  '#8a7660',
  scrap:      '#c1c7cd',
  scrapDark:  '#5c6068',
  scrapShine: '#eef1f5',
  oil:        '#0e1116',
  oilRim:     '#3f5078',
  oilShine:   '#7f95c0',
  garage:     '#8a6a3a',
  garageHi:   '#d0a86a',
  garageLo:   '#4a3418',
  garageRoof: '#a0794a',
  garageDoor: '#141010',
  garageDoorHi:'#3a2b1e',
  warning:    '#f6d76b',
  warningLo:  '#1a130a',
  bot:        '#c07533',
  botHi:      '#e69540',
  botLo:      '#4a2a0e',
  botTread:   '#12100a',
  botTreadHi: '#3a2f22',
  botDome:    '#e0a24a',
  botDomeHi:  '#f7c974',
  botEye:     '#fff2a8',
  botEyeGlow: '#f6d76b',
  antenna:    '#1a130a',
  antennaTip: '#e14a1f',
  cargoScrap: '#c8d0d8',
  cargoScrapHi:'#eef1f5',
  cargoOil:   '#2f3b58',
  cargoOilHi: '#5a7098',
  selection:  '#ffdf5f',
  hudBg:      'rgba(20, 15, 10, 0.78)',
  hudText:    '#f0e2c1',
  hudTextDim: '#7a6e5a',
  minimapBg:  'rgba(10, 8, 6, 0.85)',
  minimapEdge:'#4a4032',
  minimapView:'rgba(255, 223, 95, 0.85)',
  bg:         '#14110e',
  // Fabricator
  fabBody:    '#5c6a7a',
  fabHi:      '#8ea0b8',
  fabLo:      '#2f3844',
  fabRoof:    '#4a5566',
  fabAccent:  '#3f8fbf',
  // Depot
  depBody:    '#9c7a48',
  depHi:      '#d0a86a',
  depLo:      '#5c4520',
  depCrate:   '#8a6a3a',
  depCrateHi: '#b8925a',
  // Blueprint / placement
  blueprint:  '#5aa8ff',
  blueprintOk:'#7fe0a4',
  blueprintBad:'#e05a5a',
};

// ----- Terrain cache (offscreen canvas painted once per map) -----

let terrainCache: HTMLCanvasElement | null = null;
let cachedFor: GameMap | null = null;

function ensureTerrain(game: Game): void {
  if (terrainCache && cachedFor === game.map) return;
  const c = document.createElement('canvas');
  c.width = WORLD_WIDTH;
  c.height = WORLD_HEIGHT;
  const cctx = c.getContext('2d');
  if (!cctx) return;
  paintTerrain(cctx, game);
  terrainCache = c;
  cachedFor = game.map;
}

function paintTerrain(cctx: CanvasRenderingContext2D, game: Game): void {
  // Base sand
  cctx.fillStyle = COLORS.sand;
  cctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Sand grit — deterministic hash-based dots for texture
  cctx.fillStyle = COLORS.sandDot;
  for (let y = 0; y < WORLD_HEIGHT; y += 4) {
    for (let x = 0; x < WORLD_WIDTH; x += 4) {
      const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      if ((h & 0x3f) < 6) {
        cctx.fillRect(x + (h & 3), y + ((h >> 2) & 3), 1, 1);
      }
    }
  }

  // Darker sand grit
  cctx.fillStyle = COLORS.sandDark;
  for (let y = 0; y < WORLD_HEIGHT; y += 6) {
    for (let x = 0; x < WORLD_WIDTH; x += 6) {
      const h = ((x * 2654435761) ^ (y * 40503)) >>> 0;
      if ((h & 0x7f) < 4) {
        cctx.fillRect(x + (h & 5), y + ((h >> 3) & 5), 1, 1);
      }
    }
  }

  // Rock / junk-pile tiles
  for (let ty = 0; ty < game.map.height; ty++) {
    for (let tx = 0; tx < game.map.width; tx++) {
      if (game.map.get(tx, ty).kind === TERRAIN.ROCK) {
        paintRockTile(cctx, tx, ty);
      }
    }
  }

  // Subtle grid lines on top
  cctx.strokeStyle = COLORS.sandDark;
  cctx.globalAlpha = 0.35;
  cctx.lineWidth = 1;
  cctx.beginPath();
  for (let x = 0; x <= game.map.width; x++) {
    cctx.moveTo(x * TILE_SIZE + 0.5, 0);
    cctx.lineTo(x * TILE_SIZE + 0.5, WORLD_HEIGHT);
  }
  for (let y = 0; y <= game.map.height; y++) {
    cctx.moveTo(0, y * TILE_SIZE + 0.5);
    cctx.lineTo(WORLD_WIDTH, y * TILE_SIZE + 0.5);
  }
  cctx.stroke();
  cctx.globalAlpha = 1;
}

function paintRockTile(cctx: CanvasRenderingContext2D, tx: number, ty: number): void {
  const px = tx * TILE_SIZE;
  const py = ty * TILE_SIZE;
  const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;

  cctx.fillStyle = COLORS.rock;
  cctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  // Top-left highlight bevel
  cctx.fillStyle = COLORS.rockHi;
  cctx.fillRect(px + 2, py + 2, TILE_SIZE - 6, 2);
  cctx.fillRect(px + 2, py + 2, 2, TILE_SIZE - 6);

  // Bottom-right shadow bevel
  cctx.fillStyle = COLORS.rockLo;
  cctx.fillRect(px + 4, py + TILE_SIZE - 4, TILE_SIZE - 6, 2);
  cctx.fillRect(px + TILE_SIZE - 4, py + 4, 2, TILE_SIZE - 6);

  // Random chunks / rivets
  const chunks: Array<[number, number, string]> = [
    [6, 6, COLORS.rockLo],
    [14, 10, COLORS.rockChunk],
    [8, 16, COLORS.rockHi],
    [16, 6, COLORS.rockChunk],
  ];
  for (let i = 0; i < 3; i++) {
    if ((h >> i) & 1) {
      const [cx, cy, color] = chunks[i % chunks.length];
      cctx.fillStyle = color;
      cctx.fillRect(px + cx, py + cy, 3, 3);
    }
  }
  if (h & 0x8) {
    cctx.fillStyle = COLORS.rockChunk;
    cctx.fillRect(px + 12, py + 14, 4, 2);
  }
}

// ----- Public entry point -----

export function render(
  ctx: CanvasRenderingContext2D,
  game: Game,
  input: InputState,
  time: number,
): void {
  ensureTerrain(game);

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, game.viewport.width, game.viewport.height);

  ctx.save();
  const camX = Math.floor(game.camera.x);
  const camY = Math.floor(game.camera.y);
  ctx.translate(-camX, -camY);

  if (terrainCache) {
    const srcW = Math.min(game.viewport.width, WORLD_WIDTH - camX);
    const srcH = Math.min(game.viewport.height, WORLD_HEIGHT - camY);
    if (srcW > 0 && srcH > 0) {
      ctx.drawImage(
        terrainCache,
        camX, camY, srcW, srcH,
        camX, camY, srcW, srcH,
      );
    }
  }

  drawGarage(ctx, game.garage, time);
  for (const b of game.buildings) drawBuilding(ctx, b, time);
  for (const node of game.resourceNodes) drawResource(ctx, node, time);
  for (const bot of game.bots) drawBot(ctx, bot, time);
  for (const p of game.particles) drawParticle(ctx, p);

  if (game.placementMode && input.worldTile) {
    drawPlacementGhost(ctx, game, input.worldTile, time);
  }

  ctx.restore();

  if (input.selectionBox) drawSelectionBox(ctx, input.selectionBox);
  drawMinimap(ctx, game);
  drawHud(ctx, game);
  drawBuildMenu(ctx, game, input.cursor, time);
}

// ----- Garage -----

function drawGarage(ctx: CanvasRenderingContext2D, g: Garage, time: number): void {
  const px = g.tileX * TILE_SIZE;
  const py = g.tileY * TILE_SIZE;
  const w = g.width * TILE_SIZE;
  const h = g.height * TILE_SIZE;

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(px + 3, py + 4, w - 4, h - 3);

  // Main structure
  ctx.fillStyle = COLORS.garage;
  ctx.fillRect(px + 2, py + 2, w - 4, h - 4);

  // Corrugated-metal roof lines
  ctx.fillStyle = COLORS.garageLo;
  for (let ly = 5; ly < h - 8; ly += 4) {
    ctx.fillRect(px + 4, py + ly, w - 8, 1);
  }
  ctx.fillStyle = COLORS.garageRoof;
  for (let ly = 6; ly < h - 8; ly += 4) {
    ctx.fillRect(px + 4, py + ly, w - 8, 1);
  }

  // Outer frame
  ctx.strokeStyle = COLORS.garageHi;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 2, py + 2, w - 4, h - 4);

  // Corner rivets
  ctx.fillStyle = COLORS.garageHi;
  const rivet = (rx: number, ry: number) => ctx.fillRect(px + rx - 1, py + ry - 1, 2, 2);
  rivet(6, 6);
  rivet(w - 6, 6);
  rivet(6, h - 6);
  rivet(w - 6, h - 6);

  // Rooftop vent
  ctx.fillStyle = COLORS.garageLo;
  ctx.fillRect(px + w / 2 - 5, py + 5, 10, 4);
  ctx.fillStyle = COLORS.garageHi;
  ctx.fillRect(px + w / 2 - 5, py + 5, 10, 1);
  ctx.fillStyle = COLORS.garageDoor;
  for (let sx = -4; sx <= 4; sx += 2) {
    ctx.fillRect(px + w / 2 + sx, py + 7, 1, 1);
  }

  // Bay door
  const doorW = 22;
  const doorH = 14;
  const doorX = px + w / 2 - doorW / 2;
  const doorY = py + h - doorH - 3;
  ctx.fillStyle = COLORS.garageDoor;
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.strokeStyle = COLORS.garageDoorHi;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let sy = doorY + 2; sy < doorY + doorH; sy += 2) {
    ctx.moveTo(doorX + 0.5, sy + 0.5);
    ctx.lineTo(doorX + doorW - 0.5, sy + 0.5);
  }
  ctx.stroke();

  // Warning stripes above door — subtly slide with time for a live "conveyor" look
  const stripeOffset = Math.floor(time * 6) % 4;
  ctx.fillStyle = COLORS.warning;
  ctx.fillRect(doorX - 1, doorY - 4, doorW + 2, 3);
  ctx.fillStyle = COLORS.warningLo;
  for (let sx = -stripeOffset; sx < doorW + 2; sx += 4) {
    ctx.fillRect(doorX - 1 + sx, doorY - 4, 2, 3);
  }
}

// ----- Resource nodes -----

function drawResource(ctx: CanvasRenderingContext2D, node: ResourceNode, time: number): void {
  const cx = (node.tileX + 0.5) * TILE_SIZE;
  const cy = (node.tileY + 0.5) * TILE_SIZE;
  const nodePhase = node.tileX * 0.37 + node.tileY * 0.61;

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (node.kind === 'scrap') {
    // Big angular chunk
    ctx.fillStyle = COLORS.scrapDark;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy + 5);
    ctx.lineTo(cx - 4, cy - 7);
    ctx.lineTo(cx + 5, cy - 5);
    ctx.lineTo(cx + 9, cy + 4);
    ctx.lineTo(cx + 2, cy + 8);
    ctx.closePath();
    ctx.fill();
    // Lit top face
    ctx.fillStyle = COLORS.scrap;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 1);
    ctx.lineTo(cx - 3, cy - 6);
    ctx.lineTo(cx + 4, cy - 4);
    ctx.lineTo(cx + 5, cy - 1);
    ctx.lineTo(cx - 4, cy + 2);
    ctx.closePath();
    ctx.fill();
    // Shine — occasional glint that sweeps across
    const glint = Math.sin(time * 1.4 + nodePhase) * 0.5 + 0.5;
    ctx.globalAlpha = 0.55 + glint * 0.45;
    ctx.fillStyle = COLORS.scrapShine;
    ctx.fillRect(cx - 2 + glint * 2, cy - 4, 3, 1);
    ctx.globalAlpha = 1;
    // Small side bolt/chunk
    ctx.fillStyle = COLORS.scrapDark;
    ctx.fillRect(cx + 5, cy + 3, 4, 4);
    ctx.fillStyle = COLORS.scrap;
    ctx.fillRect(cx + 6, cy + 3, 2, 2);
  } else {
    // Iridescent oil puddle
    ctx.fillStyle = COLORS.oil;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Iridescence rim
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = COLORS.oilRim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + 1, 9, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Animated shimmer — the shine drifts across the puddle surface
    const shim = Math.sin(time * 2 + nodePhase);
    const shift = shim * 3;
    ctx.fillStyle = COLORS.oilShine;
    ctx.globalAlpha = 0.55 + (shim * 0.5 + 0.5) * 0.4;
    ctx.beginPath();
    ctx.ellipse(cx - 3 + shift, cy - 1, 3, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#e8ecf5';
    ctx.fillRect(cx - 4 + shift, cy - 2, 2, 1);
  }

  // Amount bar
  const barW = 16;
  const barX = cx - barW / 2;
  const barY = (node.tileY + 1) * TILE_SIZE - 3;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(barX, barY, barW, 2);
  const filled = Math.max(0, Math.min(1, node.amount / node.initialAmount)) * barW;
  ctx.fillStyle = node.kind === 'scrap' ? COLORS.scrap : COLORS.oilShine;
  ctx.fillRect(barX, barY, filled, 2);
}

// ----- Grease Bot: proper robot sprite -----

function drawBot(ctx: CanvasRenderingContext2D, bot: GreaseBot, time: number): void {
  // Idle bob and harvest jitter for a bit of life.
  let bobY = 0;
  let jitterX = 0;
  let jitterY = 0;
  if (bot.state === 'idle') {
    bobY = Math.sin(time * 2.5 + bot.phaseSeed) * 0.6;
  } else if (bot.state === 'harvesting') {
    jitterX = Math.sin(time * 32 + bot.phaseSeed) * 0.7;
    jitterY = Math.cos(time * 27 + bot.phaseSeed * 1.3) * 0.5;
  } else if (bot.state === 'droppingOff') {
    bobY = Math.sin(time * 6 + bot.phaseSeed) * 0.4;
  }

  ctx.save();
  ctx.translate(bot.x + jitterX, bot.y + bobY + jitterY);

  // Ground shadow (stays on the ground; no bob).
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(1, 3 - bobY, BOT_RADIUS + 1, BOT_RADIUS * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  // Selection ring — pulsing brightness + subtle outer halo.
  if (bot.selected) {
    const pulse = 0.7 + 0.3 * Math.sin(time * 5 + bot.phaseSeed);
    ctx.strokeStyle = `rgba(255, 223, 95, ${pulse.toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, BOT_RADIUS + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 223, 95, ${(pulse * 0.35).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, BOT_RADIUS + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.rotate(bot.facing);

  const chW = 14;   // chassis length (front-back)
  const chH = 10;   // chassis width (left-right)
  const treadH = 3;

  // Treads
  ctx.fillStyle = COLORS.botTread;
  ctx.fillRect(-chW / 2 + 1, -chH / 2 - treadH, chW - 2, treadH);
  ctx.fillRect(-chW / 2 + 1, chH / 2, chW - 2, treadH);

  // Animated tread stripes
  const stripeGap = 4;
  const phase = ((bot.treadPhase % stripeGap) + stripeGap) % stripeGap;
  ctx.fillStyle = COLORS.botTreadHi;
  for (let i = -1; i < 5; i++) {
    const sx = -chW / 2 + 2 + i * stripeGap - phase;
    if (sx < -chW / 2 + 1 || sx > chW / 2 - 2) continue;
    ctx.fillRect(sx, -chH / 2 - treadH + 1, 1, treadH - 1);
    ctx.fillRect(sx, chH / 2, 1, treadH - 1);
  }

  // Chassis body — rounded rect
  ctx.beginPath();
  ctx.roundRect(-chW / 2, -chH / 2, chW, chH, 2);
  ctx.fillStyle = COLORS.bot;
  ctx.fill();
  ctx.strokeStyle = COLORS.botLo;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Top-plate highlight
  ctx.fillStyle = COLORS.botHi;
  ctx.fillRect(-chW / 2 + 2, -chH / 2 + 1, chW - 4, 1);

  // Rivets
  ctx.fillStyle = COLORS.botHi;
  ctx.fillRect(-chW / 2 + 2, -chH / 2 + 2, 1, 1);
  ctx.fillRect(chW / 2 - 3, -chH / 2 + 2, 1, 1);
  ctx.fillRect(-chW / 2 + 2, chH / 2 - 3, 1, 1);
  ctx.fillRect(chW / 2 - 3, chH / 2 - 3, 1, 1);

  // Central dome
  ctx.beginPath();
  ctx.arc(-1, 0, 3, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.botDome;
  ctx.fill();
  ctx.strokeStyle = COLORS.botLo;
  ctx.lineWidth = 1;
  ctx.stroke();
  // Dome highlight
  ctx.fillStyle = COLORS.botDomeHi;
  ctx.fillRect(-2, -2, 1, 1);

  // Front sensor housing
  ctx.fillStyle = COLORS.botLo;
  ctx.fillRect(chW / 2 - 4, -2, 3, 4);
  // Sensor lens — pulses brighter/dimmer
  const sensorPulse = 0.65 + 0.35 * Math.sin(time * 3.5 + bot.phaseSeed);
  ctx.fillStyle = COLORS.botEye;
  ctx.globalAlpha = sensorPulse;
  ctx.fillRect(chW / 2 - 3, -1, 2, 2);
  ctx.globalAlpha = 1;
  // Sensor glow
  ctx.fillStyle = COLORS.botEyeGlow;
  ctx.globalAlpha = sensorPulse * 0.9;
  ctx.fillRect(chW / 2 - 2, -1, 1, 1);
  ctx.globalAlpha = 1;

  // Antenna — wobbles side to side
  const wobble = Math.sin(time * 3.2 + bot.phaseSeed);
  ctx.strokeStyle = COLORS.antenna;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-chW / 2 + 1, -1);
  ctx.lineTo(-chW / 2 - 3 + wobble * 0.6, -4 + wobble * 0.4);
  ctx.stroke();
  ctx.fillStyle = COLORS.antennaTip;
  ctx.fillRect(-chW / 2 - 4 + wobble * 0.7, -5 + wobble * 0.5, 2, 2);

  // Cargo box on the back
  if (bot.carrying > 0) {
    const boxColor = bot.carryingKind === 'oil' ? COLORS.cargoOil : COLORS.cargoScrap;
    const boxHi    = bot.carryingKind === 'oil' ? COLORS.cargoOilHi : COLORS.cargoScrapHi;
    ctx.fillStyle = boxColor;
    ctx.fillRect(-chW / 2 + 2, -2, 4, 4);
    ctx.strokeStyle = COLORS.botLo;
    ctx.lineWidth = 1;
    ctx.strokeRect(-chW / 2 + 2 + 0.5, -1.5, 3, 3);
    ctx.fillStyle = boxHi;
    ctx.fillRect(-chW / 2 + 3, -1, 1, 1);
  }

  ctx.restore();
}

// ----- UI overlays -----

function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  box: { x0: number; y0: number; x1: number; y1: number },
): void {
  const x = Math.min(box.x0, box.x1);
  const y = Math.min(box.y0, box.y1);
  const w = Math.abs(box.x1 - box.x0);
  const h = Math.abs(box.y1 - box.y0);
  ctx.fillStyle = 'rgba(255, 223, 95, 0.14)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COLORS.selection;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
}

function drawHud(ctx: CanvasRenderingContext2D, game: Game): void {
  const pad = 8;
  const w = 260;
  const h = 56;
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(pad, pad, w, h);
  ctx.strokeStyle = '#4a4032';
  ctx.strokeRect(pad + 0.5, pad + 0.5, w, h);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = '14px ui-monospace, Consolas, monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(`Scrap: ${game.resources.scrap}`, pad + 12, pad + 8);
  ctx.fillText(`Oil:   ${game.resources.oil}`, pad + 12, pad + 30);
  ctx.fillStyle = COLORS.scrap;
  ctx.fillRect(pad + w - 26, pad + 10, 10, 10);
  ctx.fillStyle = COLORS.oil;
  ctx.fillRect(pad + w - 26, pad + 32, 10, 10);
  ctx.fillStyle = COLORS.oilShine;
  ctx.fillRect(pad + w - 23, pad + 34, 3, 2);
}

function drawMinimap(ctx: CanvasRenderingContext2D, game: Game): void {
  const size = 160;
  const pad = 8;
  const x = game.viewport.width - size - pad;
  const y = game.viewport.height - size - pad;
  const scaleX = size / WORLD_WIDTH;
  const scaleY = size / WORLD_HEIGHT;

  ctx.fillStyle = COLORS.minimapBg;
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = COLORS.minimapEdge;
  ctx.strokeRect(x + 0.5, y + 0.5, size, size);

  ctx.fillStyle = COLORS.rock;
  for (let ty = 0; ty < game.map.height; ty += 2) {
    for (let tx = 0; tx < game.map.width; tx += 2) {
      if (game.map.get(tx, ty).kind === TERRAIN.ROCK) {
        ctx.fillRect(x + tx * TILE_SIZE * scaleX, y + ty * TILE_SIZE * scaleY, 2, 2);
      }
    }
  }
  for (const node of game.resourceNodes) {
    ctx.fillStyle = node.kind === 'scrap' ? COLORS.scrap : COLORS.oilShine;
    ctx.fillRect(
      x + node.tileX * TILE_SIZE * scaleX - 1,
      y + node.tileY * TILE_SIZE * scaleY - 1,
      3, 3,
    );
  }
  ctx.fillStyle = COLORS.garageHi;
  ctx.fillRect(
    x + game.garage.tileX * TILE_SIZE * scaleX,
    y + game.garage.tileY * TILE_SIZE * scaleY,
    Math.max(3, game.garage.width * TILE_SIZE * scaleX),
    Math.max(3, game.garage.height * TILE_SIZE * scaleY),
  );
  for (const b of game.buildings) {
    ctx.fillStyle = b.type === 'fabricator' ? COLORS.fabHi : COLORS.depHi;
    ctx.globalAlpha = b.built ? 1 : 0.55;
    ctx.fillRect(
      x + b.tileX * TILE_SIZE * scaleX,
      y + b.tileY * TILE_SIZE * scaleY,
      Math.max(3, b.width * TILE_SIZE * scaleX),
      Math.max(3, b.height * TILE_SIZE * scaleY),
    );
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = COLORS.bot;
  for (const bot of game.bots) {
    ctx.fillRect(x + bot.x * scaleX - 1, y + bot.y * scaleY - 1, 2, 2);
  }
  ctx.strokeStyle = COLORS.minimapView;
  ctx.lineWidth = 1;
  ctx.strokeRect(
    x + game.camera.x * scaleX + 0.5,
    y + game.camera.y * scaleY + 0.5,
    game.viewport.width * scaleX,
    game.viewport.height * scaleY,
  );
}

// ----- Buildings -----

function drawBuilding(ctx: CanvasRenderingContext2D, b: Building, time: number): void {
  const px = b.tileX * TILE_SIZE;
  const py = b.tileY * TILE_SIZE;
  const w = b.width * TILE_SIZE;
  const h = b.height * TILE_SIZE;

  if (!b.built) {
    drawBlueprint(ctx, b, px, py, w, h, time);
    return;
  }
  if (b.type === 'fabricator') {
    drawFabricator(ctx, px, py, w, h, b, time);
  } else {
    drawDepot(ctx, px, py, w, h, b, time);
  }
}

function drawBlueprint(
  ctx: CanvasRenderingContext2D,
  b: Building,
  px: number, py: number, w: number, h: number,
  time: number,
): void {
  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(px + 3, py + 4, w - 4, h - 3);

  // Faint filled base
  ctx.fillStyle = 'rgba(90, 168, 255, 0.10)';
  ctx.fillRect(px + 2, py + 2, w - 4, h - 4);

  // Ghost silhouette of the finished building at low alpha
  ctx.globalAlpha = 0.25;
  if (b.type === 'fabricator') {
    drawFabricator(ctx, px, py, w, h, b, time);
  } else {
    drawDepot(ctx, px, py, w, h, b, time);
  }
  ctx.globalAlpha = 1;

  // Dashed blueprint border, animated
  ctx.save();
  ctx.strokeStyle = COLORS.blueprint;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.lineDashOffset = -time * 12;
  ctx.strokeRect(px + 2 + 0.5, py + 2 + 0.5, w - 4, h - 4);
  ctx.restore();

  // Tile-grid guides inside footprint
  ctx.strokeStyle = 'rgba(90, 168, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 1; gx < b.width; gx++) {
    ctx.moveTo(px + gx * TILE_SIZE + 0.5, py + 4);
    ctx.lineTo(px + gx * TILE_SIZE + 0.5, py + h - 4);
  }
  for (let gy = 1; gy < b.height; gy++) {
    ctx.moveTo(px + 4, py + gy * TILE_SIZE + 0.5);
    ctx.lineTo(px + w - 4, py + gy * TILE_SIZE + 0.5);
  }
  ctx.stroke();

  // Progress bar
  const pct = Math.max(0, Math.min(1, b.progress / b.spec.buildTime));
  const barX = px + 4;
  const barY = py + h - 6;
  const barW = w - 8;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(barX, barY, barW, 3);
  ctx.fillStyle = COLORS.blueprintOk;
  ctx.fillRect(barX, barY, barW * pct, 3);
}

function drawFabricator(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, w: number, h: number,
  b: Building, time: number,
): void {
  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(px + 4, py + 5, w - 6, h - 4);

  // Main body
  ctx.fillStyle = COLORS.fabBody;
  ctx.fillRect(px + 3, py + 3, w - 6, h - 6);
  ctx.strokeStyle = COLORS.fabHi;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 3, py + 3, w - 6, h - 6);

  // Roof panel lines
  ctx.fillStyle = COLORS.fabLo;
  for (let ly = 8; ly < h - 12; ly += 6) {
    ctx.fillRect(px + 6, py + ly, w - 12, 1);
  }
  ctx.fillStyle = COLORS.fabHi;
  for (let ly = 10; ly < h - 12; ly += 6) {
    ctx.fillRect(px + 6, py + ly, w - 12, 1);
  }

  // Central assembly window (glass panel showing progress)
  const winX = px + w / 2 - 12;
  const winY = py + h / 2 - 8;
  ctx.fillStyle = '#0f1620';
  ctx.fillRect(winX, winY, 24, 16);
  ctx.strokeStyle = COLORS.fabLo;
  ctx.strokeRect(winX + 0.5, winY + 0.5, 24, 16);
  // Blinking blue "assembly" glow — tied to production progress if building is done.
  if (b.built && b.spec?.productionTime) {
    const pct = b.productionProgress / b.spec.productionTime;
    ctx.fillStyle = COLORS.fabAccent;
    ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(time * 6));
    ctx.fillRect(winX + 2, winY + 2, 20 * pct, 12);
    ctx.globalAlpha = 1;
    // Assembly beam sweep
    const sweepX = winX + 2 + ((time * 30) % 20);
    ctx.fillStyle = '#8fd0ff';
    ctx.globalAlpha = 0.7;
    ctx.fillRect(sweepX, winY + 2, 1, 12);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = COLORS.fabAccent;
    ctx.globalAlpha = 0.15;
    ctx.fillRect(winX + 2, winY + 2, 20, 12);
    ctx.globalAlpha = 1;
  }

  // Rooftop stack / vent
  const stackX = px + 8;
  const stackY = py + 6;
  ctx.fillStyle = COLORS.fabLo;
  ctx.fillRect(stackX, stackY, 8, 10);
  ctx.fillStyle = COLORS.fabHi;
  ctx.fillRect(stackX, stackY, 8, 2);
  // Smoke puffs from stack (rendered as gentle stationary dabs)
  if (b.built) {
    const smokeAlpha = 0.15 + 0.15 * Math.sin(time * 2 + b.tileX);
    ctx.fillStyle = `rgba(200, 200, 200, ${smokeAlpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(stackX + 4, stackY - 4 + Math.sin(time * 3) * 1, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Corner rivets
  ctx.fillStyle = COLORS.fabHi;
  for (const [rx, ry] of [[6, 6], [w - 8, 6], [6, h - 8], [w - 8, h - 8]] as const) {
    ctx.fillRect(px + rx - 1, py + ry - 1, 2, 2);
  }

  // Bay door on the south face
  const doorW = 20;
  const doorH = 12;
  const doorX = px + w / 2 - doorW / 2;
  const doorY = py + h - doorH - 4;
  ctx.fillStyle = '#0d0906';
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.strokeStyle = COLORS.fabLo;
  ctx.beginPath();
  for (let sy = doorY + 2; sy < doorY + doorH; sy += 3) {
    ctx.moveTo(doorX + 0.5, sy + 0.5);
    ctx.lineTo(doorX + doorW - 0.5, sy + 0.5);
  }
  ctx.stroke();

  // Warning stripe below door
  const stripeOffset = Math.floor(time * 6) % 4;
  ctx.fillStyle = COLORS.warning;
  ctx.fillRect(doorX - 2, doorY + doorH + 1, doorW + 4, 2);
  ctx.fillStyle = COLORS.warningLo;
  for (let sx = -stripeOffset; sx < doorW + 4; sx += 4) {
    ctx.fillRect(doorX - 2 + sx, doorY + doorH + 1, 2, 2);
  }
}

function drawDepot(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, w: number, h: number,
  _b: Building, _time: number,
): void {
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(px + 3, py + 4, w - 4, h - 3);

  // Main body — warm container tan
  ctx.fillStyle = COLORS.depBody;
  ctx.fillRect(px + 2, py + 2, w - 4, h - 4);
  ctx.strokeStyle = COLORS.depHi;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 2, py + 2, w - 4, h - 4);

  // Top-face container crate texture
  ctx.fillStyle = COLORS.depLo;
  for (let ly = 6; ly < h - 6; ly += 4) {
    ctx.fillRect(px + 4, py + ly, w - 8, 1);
  }

  // Two stacked crates on top
  ctx.fillStyle = COLORS.depCrate;
  ctx.fillRect(px + 5, py + 5, 14, 10);
  ctx.strokeStyle = COLORS.depLo;
  ctx.strokeRect(px + 5 + 0.5, py + 5 + 0.5, 14, 10);
  ctx.fillStyle = COLORS.depCrateHi;
  ctx.fillRect(px + 5 + 1, py + 5 + 1, 14 - 2, 2);
  // Second crate
  ctx.fillStyle = COLORS.depCrate;
  ctx.fillRect(px + w - 20, py + h - 16, 14, 10);
  ctx.strokeStyle = COLORS.depLo;
  ctx.strokeRect(px + w - 20 + 0.5, py + h - 16 + 0.5, 14, 10);
  ctx.fillStyle = COLORS.depCrateHi;
  ctx.fillRect(px + w - 20 + 1, py + h - 16 + 1, 14 - 2, 2);

  // Corner rivets
  ctx.fillStyle = COLORS.depHi;
  for (const [rx, ry] of [[5, 5], [w - 6, 5], [5, h - 6], [w - 6, h - 6]] as const) {
    ctx.fillRect(px + rx - 1, py + ry - 1, 2, 2);
  }

  // Small door on south face
  const doorW = 12;
  const doorH = 8;
  const doorX = px + w / 2 - doorW / 2;
  const doorY = py + h - doorH - 3;
  ctx.fillStyle = '#241812';
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.strokeStyle = COLORS.depLo;
  ctx.beginPath();
  for (let sy = doorY + 2; sy < doorY + doorH; sy += 2) {
    ctx.moveTo(doorX + 0.5, sy + 0.5);
    ctx.lineTo(doorX + doorW - 0.5, sy + 0.5);
  }
  ctx.stroke();
}

// ----- Placement ghost -----

function drawPlacementGhost(
  ctx: CanvasRenderingContext2D,
  game: Game,
  worldTile: { x: number; y: number },
  time: number,
): void {
  const spec = BUILDING_SPECS[game.placementMode!];
  const tx = worldTile.x;
  const ty = worldTile.y;
  const px = tx * TILE_SIZE;
  const py = ty * TILE_SIZE;
  const w = spec.width * TILE_SIZE;
  const h = spec.height * TILE_SIZE;

  const valid = game.canPlaceAt(spec.type, tx, ty) && game.canAfford(spec.type);
  const tint = valid ? COLORS.blueprintOk : COLORS.blueprintBad;

  // Footprint tint
  ctx.fillStyle = valid ? 'rgba(127, 224, 164, 0.16)' : 'rgba(224, 90, 90, 0.20)';
  ctx.fillRect(px, py, w, h);

  // Per-tile footprint outline showing individual tile validity
  ctx.strokeStyle = valid ? 'rgba(127, 224, 164, 0.4)' : 'rgba(224, 90, 90, 0.5)';
  ctx.lineWidth = 1;
  for (let dy = 0; dy < spec.height; dy++) {
    for (let dx = 0; dx < spec.width; dx++) {
      const tileValid = game.map.inBounds(tx + dx, ty + dy) && !game.isBlockedForPath(tx + dx, ty + dy);
      ctx.strokeStyle = tileValid ? 'rgba(127, 224, 164, 0.45)' : 'rgba(224, 90, 90, 0.5)';
      ctx.strokeRect((tx + dx) * TILE_SIZE + 0.5, (ty + dy) * TILE_SIZE + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }
  }

  // Ghost silhouette
  ctx.globalAlpha = 0.5;
  const fakeBuilding = { type: spec.type, width: spec.width, height: spec.height } as Building;
  if (spec.type === 'fabricator') {
    drawFabricator(ctx, px, py, w, h, fakeBuilding, time);
  } else {
    drawDepot(ctx, px, py, w, h, fakeBuilding, time);
  }
  ctx.globalAlpha = 1;

  // Bold outer border for the footprint
  ctx.strokeStyle = tint;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.lineDashOffset = -time * 12;
  ctx.strokeRect(px + 0.5, py + 0.5, w, h);
  ctx.setLineDash([]);
}

// ----- Build menu -----

function drawBuildMenu(
  ctx: CanvasRenderingContext2D,
  game: Game,
  cursor: { x: number; y: number } | null,
  time: number,
): void {
  const buttons = getBuildButtons(game.viewport);
  for (const btn of buttons) {
    const spec = BUILDING_SPECS[btn.type];
    const affordable = game.canAfford(btn.type);
    const active = game.placementMode === btn.type;
    const hovered = cursor
      && cursor.x >= btn.x && cursor.x <= btn.x + btn.w
      && cursor.y >= btn.y && cursor.y <= btn.y + btn.h;

    // Base panel
    ctx.fillStyle = COLORS.hudBg;
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);

    // Selection outline (pulsing) when this button's placement is active
    if (active) {
      const pulse = 0.6 + 0.4 * Math.sin(time * 5);
      ctx.strokeStyle = `rgba(127, 224, 164, ${pulse.toFixed(3)})`;
      ctx.lineWidth = 2;
    } else if (hovered && affordable) {
      ctx.strokeStyle = COLORS.hudText;
      ctx.lineWidth = 1;
    } else {
      ctx.strokeStyle = '#4a4032';
      ctx.lineWidth = 1;
    }
    ctx.strokeRect(btn.x + 0.5, btn.y + 0.5, btn.w, btn.h);

    // Miniature building icon (28x28 area on left)
    const iconX = btn.x + 6;
    const iconY = btn.y + (btn.h - 32) / 2;
    ctx.save();
    ctx.translate(iconX, iconY);
    ctx.globalAlpha = affordable ? 1 : 0.5;
    const iconW = 32;
    const iconH = 32;
    const fakeB = { type: btn.type, width: spec.width, height: spec.height } as Building;
    if (btn.type === 'fabricator') drawFabricator(ctx, 0, 0, iconW, iconH, fakeB, time);
    else drawDepot(ctx, 0, 0, iconW, iconH, fakeB, time);
    ctx.globalAlpha = 1;
    ctx.restore();

    // Label + cost
    ctx.font = 'bold 13px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = affordable ? COLORS.hudText : COLORS.hudTextDim;
    ctx.fillText(spec.displayName, btn.x + 44, btn.y + 6);
    ctx.font = '11px ui-monospace, Consolas, monospace';
    const costColorScrap = game.resources.scrap >= spec.cost.scrap ? COLORS.hudText : COLORS.blueprintBad;
    const costColorOil = game.resources.oil >= spec.cost.oil ? COLORS.hudText : COLORS.blueprintBad;
    ctx.fillStyle = costColorScrap;
    ctx.fillText(`${spec.cost.scrap} scrap`, btn.x + 44, btn.y + 24);
    ctx.fillStyle = costColorOil;
    ctx.fillText(`${spec.cost.oil} oil`, btn.x + 44, btn.y + 38);
  }
}
