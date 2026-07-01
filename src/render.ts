import {
  TILE_SIZE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  UNIT_RADIUS,
  UNIT_MAX_HP,
  ATTACK_RANGE,
  RED_BASE,
  BLUE_BASE,
  RED_BASE_TILE,
  BLUE_BASE_TILE,
  RED_HQ,
  BLUE_HQ,
  BASE_HALF,
  FLAG_CAPTURE_RADIUS,
  CAPTURES_TO_WIN,
  UNITS_PER_TEAM,
  type Team,
} from '../shared/constants.ts';
import type { UnitSnapshot, FlagSnapshot } from '../shared/types.ts';
import { TILE, tileAt, type MapData } from '../shared/map.ts';
import type { ClientGame, Effect } from './game.ts';

const COLORS = {
  bg:         '#14110e',
  sand:       '#3b3226',
  sandDot:    '#4a3f30',
  sandDark:   '#2b241a',
  wall:       '#4a4a52',
  wallHi:     '#7c7c88',
  wallLo:     '#25252b',
  wallRivet:  '#a8a8b4',
  red:        '#e05a5a',
  redDark:    '#7a2020',
  redPad:     '#4a1a1a',
  redAccent:  '#c33b3b',
  redPanel:   '#5a2828',
  blue:       '#5aa8ff',
  blueDark:   '#1e4e80',
  bluePad:    '#1a2c4a',
  blueAccent: '#3b7dc3',
  bluePanel:  '#233854',
  hqRoof:     '#3a3a44',
  hqRoofHi:   '#585866',
  hqDoor:     '#141014',
  hqAntenna:  '#1a1a20',
  hqLight:    '#f6d76b',
  flagPole:   '#a0947a',
  hpGood:     '#7fe094',
  hpMid:      '#f6d76b',
  hpBad:      '#e04a3a',
  selection:  '#ffdf5f',
  cmd:        '#7fe094',
  hudBg:      'rgba(20, 15, 10, 0.85)',
  hudText:    '#f0e2c1',
  hudDim:     '#7a6e5a',
};

function tileTeam(tx: number, ty: number): Team | null {
  if (
    tx >= RED_BASE_TILE.x - BASE_HALF && tx <= RED_BASE_TILE.x + BASE_HALF &&
    ty >= RED_BASE_TILE.y - BASE_HALF && ty <= RED_BASE_TILE.y + BASE_HALF
  ) return 'red';
  if (
    tx >= BLUE_BASE_TILE.x - BASE_HALF && tx <= BLUE_BASE_TILE.x + BASE_HALF &&
    ty >= BLUE_BASE_TILE.y - BASE_HALF && ty <= BLUE_BASE_TILE.y + BASE_HALF
  ) return 'blue';
  return null;
}

function isHqTile(tx: number, ty: number): boolean {
  const inRed = tx >= RED_HQ.x && tx < RED_HQ.x + RED_HQ.w
             && ty >= RED_HQ.y && ty < RED_HQ.y + RED_HQ.h;
  const inBlue = tx >= BLUE_HQ.x && tx < BLUE_HQ.x + BLUE_HQ.w
              && ty >= BLUE_HQ.y && ty < BLUE_HQ.y + BLUE_HQ.h;
  return inRed || inBlue;
}

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

  paintBasePad(ctx, RED_BASE, COLORS.redPanel);
  paintBasePad(ctx, BLUE_BASE, COLORS.bluePanel);

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (tileAt(map, tx, ty) !== TILE.ROCK) continue;
      paintWallTile(ctx, tx, ty, tileTeam(tx, ty), isHqTile(tx, ty));
    }
  }

  ctx.strokeStyle = COLORS.sandDark;
  ctx.globalAlpha = 0.22;
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

function paintBasePad(ctx: CanvasRenderingContext2D, base: { x: number; y: number }, color: string): void {
  const size = BASE_HALF * TILE_SIZE - 4;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(base.x - size, base.y - size, size * 2, size * 2);
  ctx.globalAlpha = 1;
}

function paintWallTile(
  ctx: CanvasRenderingContext2D,
  tx: number, ty: number,
  team: Team | null,
  isHq: boolean,
): void {
  const px = tx * TILE_SIZE;
  const py = ty * TILE_SIZE;
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = COLORS.wallHi;
  ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, 2);
  ctx.fillStyle = COLORS.wallLo;
  ctx.fillRect(px + 1, py + TILE_SIZE - 3, TILE_SIZE - 2, 2);
  ctx.fillStyle = COLORS.wallHi;
  ctx.fillRect(px + 1, py + 3, 1, TILE_SIZE - 6);
  ctx.fillStyle = COLORS.wallLo;
  ctx.fillRect(px + TILE_SIZE - 2, py + 3, 1, TILE_SIZE - 6);
  if (team) {
    ctx.fillStyle = team === 'red' ? COLORS.redAccent : COLORS.blueAccent;
    ctx.fillRect(px + 2, py + 4, TILE_SIZE - 4, 2);
  }
  ctx.fillStyle = COLORS.wallRivet;
  ctx.fillRect(px + 3, py + 8, 2, 2);
  ctx.fillRect(px + TILE_SIZE - 5, py + 8, 2, 2);
  ctx.fillRect(px + 3, py + TILE_SIZE - 6, 2, 2);
  ctx.fillRect(px + TILE_SIZE - 5, py + TILE_SIZE - 6, 2, 2);
  if (isHq && team) {
    ctx.fillStyle = team === 'red' ? COLORS.redPanel : COLORS.bluePanel;
    ctx.fillRect(px + 6, py + 12, TILE_SIZE - 12, TILE_SIZE - 16);
    ctx.fillStyle = team === 'red' ? COLORS.red : COLORS.blue;
    ctx.fillRect(px + 8, py + 14, TILE_SIZE - 16, 2);
  }
}

// ----- Public entry -----

export function computeView(viewport: { width: number; height: number }): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(viewport.width / WORLD_WIDTH, viewport.height / WORLD_HEIGHT) * 0.96;
  const offsetX = (viewport.width - WORLD_WIDTH * scale) / 2;
  const offsetY = (viewport.height - WORLD_HEIGHT * scale) / 2;
  return { scale, offsetX, offsetY };
}

export function render(
  ctx: CanvasRenderingContext2D,
  game: ClientGame,
  viewport: { width: number; height: number },
  time: number,
  mouseCanvas: { x: number; y: number },
  selectionBox: { x0: number; y0: number; x1: number; y1: number } | null,
): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  if (!game.map || !game.latest) return;
  ensureTerrain(game.map);

  const view = computeView(viewport);

  ctx.save();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);

  if (terrainCache) ctx.drawImage(terrainCache, 0, 0);

  drawBase(ctx, RED_BASE, 'red', time);
  drawBase(ctx, BLUE_BASE, 'blue', time);

  drawHq(ctx, RED_HQ.x * TILE_SIZE, RED_HQ.y * TILE_SIZE, RED_HQ.w * TILE_SIZE, RED_HQ.h * TILE_SIZE, 'red', time);
  drawHq(ctx, BLUE_HQ.x * TILE_SIZE, BLUE_HQ.y * TILE_SIZE, BLUE_HQ.w * TILE_SIZE, BLUE_HQ.h * TILE_SIZE, 'blue', time);

  for (const flag of game.latest.flags) drawFlag(ctx, flag, time);

  for (const u of game.latest.units) drawUnit(ctx, u, time, game);

  for (const e of game.effects) drawEffect(ctx, e);

  ctx.restore();

  if (selectionBox) drawSelectionBox(ctx, selectionBox);
  drawHud(ctx, game, viewport, time);
  drawAimReticle(ctx, mouseCanvas);
}

function drawHq(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, w: number, h: number,
  team: Team, time: number,
): void {
  const teamColor = team === 'red' ? COLORS.red : COLORS.blue;
  const teamDark  = team === 'red' ? COLORS.redDark : COLORS.blueDark;
  const teamPanel = team === 'red' ? COLORS.redPanel : COLORS.bluePanel;

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(px + 3, py + 5, w - 4, h - 3);

  const inset = 4;
  const bodyX = px + inset;
  const bodyY = py + inset;
  const bodyW = w - inset * 2;
  const bodyH = h - inset * 2;
  ctx.fillStyle = COLORS.hqRoof;
  ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
  ctx.strokeStyle = COLORS.hqRoofHi;
  ctx.lineWidth = 2;
  ctx.strokeRect(bodyX + 0.5, bodyY + 0.5, bodyW, bodyH);

  ctx.fillStyle = teamColor;
  ctx.fillRect(bodyX + 3, bodyY + 3, bodyW - 6, 5);
  ctx.fillStyle = teamDark;
  ctx.fillRect(bodyX + 3, bodyY + 8, bodyW - 6, 1);

  const winW = bodyW - 14;
  const winH = 12;
  const winX = bodyX + (bodyW - winW) / 2;
  const winY = bodyY + bodyH / 2 - 4;
  ctx.fillStyle = teamPanel;
  ctx.fillRect(winX, winY, winW, winH);
  ctx.strokeStyle = COLORS.hqRoofHi;
  ctx.lineWidth = 1;
  ctx.strokeRect(winX + 0.5, winY + 0.5, winW, winH);
  const sweep = ((time * 25 + (team === 'red' ? 0 : 40)) % (winW - 2));
  ctx.fillStyle = teamColor;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(winX + 1 + sweep, winY + 2, 2, winH - 4);
  ctx.globalAlpha = 1;

  const doorW = Math.min(20, bodyW - 8);
  const doorH = 10;
  const doorX = bodyX + (bodyW - doorW) / 2;
  const doorY = bodyY + bodyH - doorH - 2;
  ctx.fillStyle = COLORS.hqDoor;
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.strokeStyle = COLORS.hqRoofHi;
  ctx.beginPath();
  for (let sy = doorY + 2; sy < doorY + doorH; sy += 2) {
    ctx.moveTo(doorX + 0.5, sy + 0.5);
    ctx.lineTo(doorX + doorW - 0.5, sy + 0.5);
  }
  ctx.stroke();

  const antX = bodyX + bodyW - 8;
  const antTopY = bodyY - 12;
  ctx.strokeStyle = COLORS.hqAntenna;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(antX + 0.5, bodyY);
  ctx.lineTo(antX + 0.5, antTopY);
  ctx.stroke();
  const blink = (Math.sin(time * 5 + (team === 'red' ? 0 : Math.PI)) * 0.5 + 0.5);
  ctx.fillStyle = team === 'red' ? '#ff8080' : '#80c8ff';
  ctx.globalAlpha = 0.4 + blink * 0.6;
  ctx.fillRect(antX - 1, antTopY - 2, 3, 3);
  ctx.globalAlpha = 1;

  ctx.fillStyle = COLORS.hqLight;
  ctx.fillRect(bodyX + 2, bodyY + bodyH - 6, 2, 2);
  ctx.fillRect(bodyX + bodyW - 4, bodyY + bodyH - 6, 2, 2);
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

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y + 8, 7, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.flagPole;
  ctx.fillRect(x - 1, y - 14, 2, 22);

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

function drawUnit(ctx: CanvasRenderingContext2D, u: UnitSnapshot, time: number, game: ClientGame): void {
  if (!u.alive) {
    ctx.strokeStyle = u.team === 'red' ? COLORS.redDark : COLORS.blueDark;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(u.x - 4, u.y - 4); ctx.lineTo(u.x + 4, u.y + 4);
    ctx.moveTo(u.x - 4, u.y + 4); ctx.lineTo(u.x + 4, u.y - 4);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  const isMine = game.myUnitIds.has(u.id);
  const isSelected = isMine && game.selectedUnitIds.has(u.id);

  const teamColor = u.team === 'red' ? COLORS.red : COLORS.blue;
  const darkColor = u.team === 'red' ? COLORS.redDark : COLORS.blueDark;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(u.x + 1, u.y + 3, UNIT_RADIUS, UNIT_RADIUS * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isSelected) {
    const pulse = 0.6 + 0.4 * Math.sin(time * 5);
    ctx.strokeStyle = `rgba(255, 223, 95, ${pulse.toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(u.x, u.y, UNIT_RADIUS + 3, 0, Math.PI * 2);
    ctx.stroke();
  } else if (isMine) {
    ctx.strokeStyle = `rgba(255, 223, 95, 0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(u.x, u.y, UNIT_RADIUS + 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = teamColor;
  ctx.beginPath();
  ctx.arc(u.x, u.y, UNIT_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const notchX = u.x + Math.cos(u.facing) * (UNIT_RADIUS - 1);
  const notchY = u.y + Math.sin(u.facing) * (UNIT_RADIUS - 1);
  ctx.fillStyle = '#fff2a8';
  ctx.beginPath();
  ctx.arc(notchX, notchY, 1.8, 0, Math.PI * 2);
  ctx.fill();

  if (u.attackAnimT > 0.01) {
    const swing = u.attackAnimT;
    ctx.strokeStyle = teamColor;
    ctx.globalAlpha = swing * 0.85;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(u.x, u.y, ATTACK_RANGE * (1 - swing * 0.15),
      u.facing - Math.PI * 0.4,
      u.facing + Math.PI * 0.4);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const barW = 18;
  const barH = 3;
  const barX = u.x - barW / 2;
  const barY = u.y - UNIT_RADIUS - 6;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
  const pct = Math.max(0, u.hp / UNIT_MAX_HP);
  ctx.fillStyle = pct > 0.6 ? COLORS.hpGood : pct > 0.3 ? COLORS.hpMid : COLORS.hpBad;
  ctx.fillRect(barX, barY, barW * pct, barH);

  if (u.carrying) {
    const carriedColor = u.carrying === 'red' ? COLORS.red : COLORS.blue;
    ctx.fillStyle = COLORS.flagPole;
    ctx.fillRect(u.x - 1, u.y - UNIT_RADIUS - 16, 2, 10);
    ctx.fillStyle = carriedColor;
    ctx.beginPath();
    ctx.moveTo(u.x + 1, u.y - UNIT_RADIUS - 16);
    ctx.lineTo(u.x + 6, u.y - UNIT_RADIUS - 14);
    ctx.lineTo(u.x + 6, u.y - UNIT_RADIUS - 10);
    ctx.lineTo(u.x + 1, u.y - UNIT_RADIUS - 8);
    ctx.closePath();
    ctx.fill();
  }
}

function drawEffect(ctx: CanvasRenderingContext2D, e: Effect): void {
  const t = Math.max(0, e.life / e.maxLife);
  if (e.kind === 'hit') {
    const color = e.team === 'red' ? COLORS.red : e.team === 'blue' ? COLORS.blue : COLORS.hudText;
    ctx.strokeStyle = color;
    ctx.globalAlpha = t;
    ctx.lineWidth = 2;
    const radius = (1 - t) * 12 + 4;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + (1 - t) * 0.5;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(a) * (radius - 3), e.y + Math.sin(a) * (radius - 3));
      ctx.lineTo(e.x + Math.cos(a) * radius, e.y + Math.sin(a) * radius);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (e.kind === 'capture') {
    const color = e.team === 'red' ? COLORS.red : e.team === 'blue' ? COLORS.blue : COLORS.hudText;
    ctx.strokeStyle = color;
    ctx.globalAlpha = t;
    ctx.lineWidth = 3;
    const r = (1 - t) * 48 + 6;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (e.kind === 'commandMove') {
    ctx.strokeStyle = COLORS.cmd;
    ctx.globalAlpha = t;
    ctx.lineWidth = 2;
    const r = (1 - t) * 14 + 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

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

function drawHud(ctx: CanvasRenderingContext2D, game: ClientGame, viewport: { width: number; height: number }, _time: number): void {
  if (!game.latest) return;
  const snap = game.latest;

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

  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.hudDim;
  ctx.fillText(`FIRST TO ${CAPTURES_TO_WIN}`, viewport.width / 2, sy + scoreH + 12);
  ctx.textAlign = 'start';

  // Squad status bottom-left
  const myUnits = game.myUnits();
  const alive = myUnits.filter(u => u.alive).length;
  const carrying = myUnits.find(u => u.carrying);
  const hudX = 14;
  const hudY = viewport.height - 90;
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(hudX, hudY, 260, 76);
  ctx.strokeStyle = '#4a4032';
  ctx.strokeRect(hudX + 0.5, hudY + 0.5, 260, 76);
  ctx.font = 'bold 12px ui-monospace, Consolas, monospace';
  ctx.textBaseline = 'top';
  ctx.fillStyle = game.team === 'red' ? COLORS.red : COLORS.blue;
  ctx.fillText(`SQUAD (${game.team?.toUpperCase() ?? '?'})`, hudX + 10, hudY + 8);
  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.fillStyle = COLORS.hudText;
  ctx.fillText(`Alive: ${alive}/${UNITS_PER_TEAM}`, hudX + 10, hudY + 26);
  ctx.fillText(`Selected: ${game.selectedUnitIds.size}`, hudX + 10, hudY + 42);
  if (carrying) {
    ctx.fillStyle = COLORS.hpGood;
    ctx.fillText('CARRYING FLAG', hudX + 10, hudY + 58);
  } else {
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText('R-click to move  |  drag to select', hudX + 10, hudY + 58);
  }

  // Room code top-right
  if (game.roomCode) {
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText(`ROOM ${game.roomCode}`, viewport.width - 14, 14);
    ctx.textAlign = 'start';
  }

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
  ctx.strokeStyle = 'rgba(255, 223, 95, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
  ctx.stroke();
}
