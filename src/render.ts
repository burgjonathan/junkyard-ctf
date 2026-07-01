import {
  TILE_SIZE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  HERO_RADIUS,
  HERO_MAX_HP,
  ATTACK_REACH,
  ATTACK_ARC_RAD,
  RED_BASE,
  BLUE_BASE,
  FLAG_CAPTURE_RADIUS,
  CAPTURES_TO_WIN,
  type Team,
} from '../shared/constants.ts';
import type { PlayerSnapshot, FlagSnapshot } from '../shared/types.ts';
import { TILE, tileAt, type MapData } from '../shared/map.ts';
import type { ClientGame, Effect } from './game.ts';

const COLORS = {
  bg:         '#14110e',
  sand:       '#3b3226',
  sandDot:    '#4a3f30',
  sandDark:   '#2b241a',
  rock:       '#5a4b3a',
  rockHi:     '#7c6a52',
  rockLo:     '#3d3325',
  red:        '#e05a5a',
  redDark:    '#7a2020',
  redPad:     '#4a1a1a',
  blue:       '#5aa8ff',
  blueDark:   '#1e4e80',
  bluePad:    '#1a2c4a',
  flagPole:   '#a0947a',
  hpGood:     '#7fe094',
  hpMid:      '#f6d76b',
  hpBad:      '#e04a3a',
  hudBg:      'rgba(20, 15, 10, 0.85)',
  hudText:    '#f0e2c1',
  hudDim:     '#7a6e5a',
};

// Terrain cache — repaint whenever the map ref changes.
let terrainCache: HTMLCanvasElement | null = null;
let cachedMap: MapData | null = null;

function ensureTerrain(map: MapData): void {
  if (terrainCache && cachedMap === map) return;
  const c = document.createElement('canvas');
  c.width = WORLD_WIDTH;
  c.height = WORLD_HEIGHT;
  const cctx = c.getContext('2d');
  if (!cctx) return;
  paintTerrain(cctx, map);
  terrainCache = c;
  cachedMap = map;
}

function paintTerrain(ctx: CanvasRenderingContext2D, map: MapData): void {
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Sand grit — hash-based deterministic dots
  ctx.fillStyle = COLORS.sandDot;
  for (let y = 0; y < WORLD_HEIGHT; y += 4) {
    for (let x = 0; x < WORLD_WIDTH; x += 4) {
      const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      if ((h & 0x3f) < 6) ctx.fillRect(x + (h & 3), y + ((h >> 2) & 3), 1, 1);
    }
  }
  ctx.fillStyle = COLORS.sandDark;
  for (let y = 0; y < WORLD_HEIGHT; y += 6) {
    for (let x = 0; x < WORLD_WIDTH; x += 6) {
      const h = ((x * 2654435761) ^ (y * 40503)) >>> 0;
      if ((h & 0x7f) < 4) ctx.fillRect(x + (h & 5), y + ((h >> 3) & 5), 1, 1);
    }
  }

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (tileAt(map, tx, ty) === TILE.ROCK) paintRockTile(ctx, tx, ty);
    }
  }

  // Grid lines
  ctx.strokeStyle = COLORS.sandDark;
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  for (let x = 0; x <= map.width; x++) {
    ctx.moveTo(x * TILE_SIZE + 0.5, 0);
    ctx.lineTo(x * TILE_SIZE + 0.5, WORLD_HEIGHT);
  }
  for (let y = 0; y <= map.height; y++) {
    ctx.moveTo(0, y * TILE_SIZE + 0.5);
    ctx.lineTo(WORLD_WIDTH, y * TILE_SIZE + 0.5);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function paintRockTile(ctx: CanvasRenderingContext2D, tx: number, ty: number): void {
  const px = tx * TILE_SIZE;
  const py = ty * TILE_SIZE;
  const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
  ctx.fillStyle = COLORS.rock;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = COLORS.rockHi;
  ctx.fillRect(px + 2, py + 2, TILE_SIZE - 6, 2);
  ctx.fillRect(px + 2, py + 2, 2, TILE_SIZE - 6);
  ctx.fillStyle = COLORS.rockLo;
  ctx.fillRect(px + 4, py + TILE_SIZE - 4, TILE_SIZE - 6, 2);
  ctx.fillRect(px + TILE_SIZE - 4, py + 4, 2, TILE_SIZE - 6);
  if (h & 1) { ctx.fillStyle = COLORS.rockLo; ctx.fillRect(px + 6, py + 6, 3, 3); }
  if (h & 2) { ctx.fillStyle = COLORS.rockHi; ctx.fillRect(px + 14, py + 8, 3, 3); }
}

// ----- Public entry -----

export function render(
  ctx: CanvasRenderingContext2D,
  game: ClientGame,
  viewport: { width: number; height: number },
  time: number,
  mouseCanvas: { x: number; y: number },
): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  if (!game.map || !game.latest) return;
  ensureTerrain(game.map);

  const camX = Math.floor((viewport.width - WORLD_WIDTH) / 2);
  const camY = Math.floor((viewport.height - WORLD_HEIGHT) / 2);

  ctx.save();
  ctx.translate(camX, camY);

  if (terrainCache) ctx.drawImage(terrainCache, 0, 0);

  drawBase(ctx, RED_BASE, 'red', time);
  drawBase(ctx, BLUE_BASE, 'blue', time);

  for (const flag of game.latest.flags) drawFlag(ctx, flag, time);

  for (const p of game.latest.players) drawPlayer(ctx, p, time, p.id === game.playerId);

  for (const e of game.effects) drawEffect(ctx, e);

  ctx.restore();

  drawHud(ctx, game, viewport, time);
  drawAimReticle(ctx, mouseCanvas);
}

function drawBase(ctx: CanvasRenderingContext2D, base: { x: number; y: number }, team: Team, time: number): void {
  const teamColor = team === 'red' ? COLORS.red : COLORS.blue;
  const padColor = team === 'red' ? COLORS.redPad : COLORS.bluePad;
  const darkColor = team === 'red' ? COLORS.redDark : COLORS.blueDark;

  ctx.fillStyle = padColor;
  ctx.beginPath();
  ctx.arc(base.x, base.y, FLAG_CAPTURE_RADIUS + 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(base.x, base.y, FLAG_CAPTURE_RADIUS + 4, 0, Math.PI * 2);
  ctx.stroke();

  // Animated rotating stripes
  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.rotate(time * 0.4 * (team === 'red' ? 1 : -1));
  ctx.strokeStyle = teamColor;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8);
    ctx.lineTo(Math.cos(a) * (FLAG_CAPTURE_RADIUS + 2), Math.sin(a) * (FLAG_CAPTURE_RADIUS + 2));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawFlag(ctx: CanvasRenderingContext2D, flag: FlagSnapshot, time: number): void {
  const teamColor = flag.team === 'red' ? COLORS.red : COLORS.blue;
  const darkColor = flag.team === 'red' ? COLORS.redDark : COLORS.blueDark;
  const x = flag.x;
  const y = flag.y;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y + 8, 7, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pole
  ctx.fillStyle = COLORS.flagPole;
  ctx.fillRect(x - 1, y - 14, 2, 22);

  // Flag cloth — wave with time
  const wave = Math.sin(time * 4 + x * 0.02) * 1.4;
  ctx.beginPath();
  ctx.moveTo(x + 1, y - 14);
  ctx.lineTo(x + 12 + wave, y - 12 + wave * 0.5);
  ctx.lineTo(x + 10 + wave * 0.6, y - 6);
  ctx.lineTo(x + 1, y - 8);
  ctx.closePath();
  ctx.fillStyle = teamColor;
  ctx.fill();
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // "Not at home" indicator: dropped flag pulses
  if (!flag.atHome && !flag.carriedBy) {
    const pulse = 0.4 + 0.4 * Math.sin(time * 6);
    ctx.strokeStyle = teamColor;
    ctx.globalAlpha = pulse;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerSnapshot, time: number, isOwn: boolean): void {
  if (!p.alive) {
    // "Ghost" marker while dead — small X at last position
    ctx.strokeStyle = p.team === 'red' ? COLORS.redDark : COLORS.blueDark;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - 5, p.y - 5); ctx.lineTo(p.x + 5, p.y + 5);
    ctx.moveTo(p.x - 5, p.y + 5); ctx.lineTo(p.x + 5, p.y - 5);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  const teamColor = p.team === 'red' ? COLORS.red : COLORS.blue;
  const darkColor = p.team === 'red' ? COLORS.redDark : COLORS.blueDark;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(p.x + 1, p.y + 3, HERO_RADIUS, HERO_RADIUS * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Own-hero indicator ring (pulsing)
  if (isOwn) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    ctx.strokeStyle = `rgba(255, 223, 95, ${pulse.toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, HERO_RADIUS + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Body
  ctx.fillStyle = teamColor;
  ctx.beginPath();
  ctx.arc(p.x, p.y, HERO_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Aim indicator — small notch pointing forward
  const notchX = p.x + Math.cos(p.aimAngle) * (HERO_RADIUS - 1);
  const notchY = p.y + Math.sin(p.aimAngle) * (HERO_RADIUS - 1);
  ctx.fillStyle = '#fff2a8';
  ctx.beginPath();
  ctx.arc(notchX, notchY, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Attack swing arc (visible when attackAnimT > 0)
  if (p.attackAnimT > 0.01) {
    const swing = p.attackAnimT; // 1..0
    ctx.strokeStyle = teamColor;
    ctx.globalAlpha = swing * 0.85;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ATTACK_REACH * (1 - swing * 0.15),
      p.aimAngle - ATTACK_ARC_RAD / 2,
      p.aimAngle + ATTACK_ARC_RAD / 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // HP bar over head
  const barW = 22;
  const barH = 4;
  const barX = p.x - barW / 2;
  const barY = p.y - HERO_RADIUS - 8;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
  const pct = Math.max(0, p.hp / HERO_MAX_HP);
  ctx.fillStyle = pct > 0.6 ? COLORS.hpGood : pct > 0.3 ? COLORS.hpMid : COLORS.hpBad;
  ctx.fillRect(barX, barY, barW * pct, barH);

  // Flag icon on top if carrying
  if (p.carrying) {
    const carriedColor = p.carrying === 'red' ? COLORS.red : COLORS.blue;
    ctx.fillStyle = COLORS.flagPole;
    ctx.fillRect(p.x - 1, p.y - HERO_RADIUS - 20, 2, 12);
    ctx.fillStyle = carriedColor;
    ctx.beginPath();
    ctx.moveTo(p.x + 1, p.y - HERO_RADIUS - 20);
    ctx.lineTo(p.x + 8, p.y - HERO_RADIUS - 18);
    ctx.lineTo(p.x + 8, p.y - HERO_RADIUS - 14);
    ctx.lineTo(p.x + 1, p.y - HERO_RADIUS - 12);
    ctx.closePath();
    ctx.fill();
  }
}

function drawEffect(ctx: CanvasRenderingContext2D, e: Effect): void {
  const t = Math.max(0, e.life / e.maxLife);
  if (e.kind === 'hit') {
    // Burst of short lines radiating outward
    const color = e.team === 'red' ? COLORS.red : COLORS.blue;
    ctx.strokeStyle = color;
    ctx.globalAlpha = t;
    ctx.lineWidth = 2;
    const radius = (1 - t) * 14 + 4;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + (1 - t) * 0.5;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(a) * (radius - 4), e.y + Math.sin(a) * (radius - 4));
      ctx.lineTo(e.x + Math.cos(a) * radius, e.y + Math.sin(a) * radius);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else {
    // Capture: big expanding ring
    const color = e.team === 'red' ? COLORS.red : COLORS.blue;
    ctx.strokeStyle = color;
    ctx.globalAlpha = t;
    ctx.lineWidth = 3;
    const r = (1 - t) * 48 + 6;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawHud(ctx: CanvasRenderingContext2D, game: ClientGame, viewport: { width: number; height: number }, _time: number): void {
  if (!game.latest) return;
  const snap = game.latest;

  // Central scoreboard
  const scoreW = 260;
  const scoreH = 46;
  const sx = (viewport.width - scoreW) / 2;
  const sy = 12;
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(sx, sy, scoreW, scoreH);
  ctx.strokeStyle = '#4a4032';
  ctx.strokeRect(sx + 0.5, sy + 0.5, scoreW, scoreH);
  ctx.font = 'bold 28px ui-monospace, Consolas, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.red;
  ctx.fillText(String(snap.scores.red), sx + 60, sy + scoreH / 2);
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText('vs', sx + scoreW / 2, sy + scoreH / 2);
  ctx.fillStyle = COLORS.blue;
  ctx.fillText(String(snap.scores.blue), sx + scoreW - 60, sy + scoreH / 2);
  ctx.textAlign = 'start';

  // "To win" text under scoreboard
  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText(`FIRST TO ${CAPTURES_TO_WIN}`, viewport.width / 2, sy + scoreH + 12);
  ctx.textAlign = 'start';

  // Own HP + status (bottom left)
  const own = game.ownPlayer();
  if (own) {
    const hp = Math.max(0, Math.round(own.hp));
    const hudX = 14;
    const hudY = viewport.height - 66;
    ctx.fillStyle = COLORS.hudBg;
    ctx.fillRect(hudX, hudY, 220, 52);
    ctx.strokeStyle = '#4a4032';
    ctx.strokeRect(hudX + 0.5, hudY + 0.5, 220, 52);
    ctx.font = 'bold 12px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = own.team === 'red' ? COLORS.red : COLORS.blue;
    ctx.fillText(`YOU (${own.team.toUpperCase()})`, hudX + 10, hudY + 8);
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.fillStyle = COLORS.hudText;
    if (own.alive) {
      ctx.fillText(`HP ${hp}/${HERO_MAX_HP}`, hudX + 10, hudY + 24);
      // HP bar
      const barW = 180;
      const barH = 6;
      const barX = hudX + 10;
      const barY = hudY + 40;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(barX, barY, barW, barH);
      const pct = Math.max(0, own.hp / HERO_MAX_HP);
      ctx.fillStyle = pct > 0.6 ? COLORS.hpGood : pct > 0.3 ? COLORS.hpMid : COLORS.hpBad;
      ctx.fillRect(barX, barY, barW * pct, barH);
    } else {
      ctx.fillStyle = COLORS.hpBad;
      const t = own.respawnIn ?? 0;
      ctx.fillText(`RESPAWN IN ${t.toFixed(1)}s`, hudX + 10, hudY + 24);
    }
  }

  // Room code in top-right
  if (game.roomCode) {
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText(`ROOM ${game.roomCode}`, viewport.width - 14, 14);
    ctx.textAlign = 'start';
  }

  // "Waiting for opponent" overlay text if match hasn't started
  if (snap.status === 'waiting') {
    ctx.font = 'bold 20px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.hudText;
    ctx.fillText('WAITING FOR OPPONENT', viewport.width / 2, viewport.height / 2 - 30);
    ctx.textAlign = 'start';
  }
}

function drawAimReticle(ctx: CanvasRenderingContext2D, m: { x: number; y: number }): void {
  ctx.strokeStyle = 'rgba(255, 223, 95, 0.65)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(m.x - 10, m.y); ctx.lineTo(m.x - 3, m.y);
  ctx.moveTo(m.x + 10, m.y); ctx.lineTo(m.x + 3, m.y);
  ctx.moveTo(m.x, m.y - 10); ctx.lineTo(m.x, m.y - 3);
  ctx.moveTo(m.x, m.y + 10); ctx.lineTo(m.x, m.y + 3);
  ctx.stroke();
}
