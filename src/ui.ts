import type { BuildingType } from './building.ts';

export interface BuildButton {
  type: BuildingType;
  x: number;
  y: number;
  w: number;
  h: number;
}

const BUTTON_W = 150;
const BUTTON_H = 52;

export function getBuildButtons(viewport: { width: number; height: number }): BuildButton[] {
  const y = viewport.height - 10 - BUTTON_H;
  return [
    { type: 'fabricator', x: 10,               y, w: BUTTON_W, h: BUTTON_H },
    { type: 'depot',      x: 10 + BUTTON_W + 8, y, w: BUTTON_W, h: BUTTON_H },
  ];
}

export function hitBuildButton(
  px: number,
  py: number,
  viewport: { width: number; height: number },
): BuildButton | null {
  for (const b of getBuildButtons(viewport)) {
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
  }
  return null;
}
