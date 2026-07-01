import { TILE_SIZE } from './constants.ts';

export type BuildingType = 'fabricator' | 'depot';

export interface BuildingSpec {
  type: BuildingType;
  displayName: string;
  width: number;
  height: number;
  cost: { scrap: number; oil: number };
  buildTime: number;                          // seconds of 1-bot work
  productionCost?: { scrap: number; oil: number };
  productionTime?: number;                    // seconds per unit produced
}

export const BUILDING_SPECS: Record<BuildingType, BuildingSpec> = {
  fabricator: {
    type: 'fabricator',
    displayName: 'Fabricator',
    width: 3,
    height: 3,
    cost: { scrap: 60, oil: 25 },
    buildTime: 14,
    productionCost: { scrap: 15, oil: 5 },
    productionTime: 8,
  },
  depot: {
    type: 'depot',
    displayName: 'Depot',
    width: 2,
    height: 2,
    cost: { scrap: 30, oil: 5 },
    buildTime: 6,
  },
};

export class Building {
  type: BuildingType;
  tileX: number;
  tileY: number;
  spec: BuildingSpec;
  built: boolean = false;
  progress: number = 0;
  productionProgress: number = 0;

  constructor(type: BuildingType, tileX: number, tileY: number) {
    this.type = type;
    this.tileX = tileX;
    this.tileY = tileY;
    this.spec = BUILDING_SPECS[type];
  }

  get width(): number { return this.spec.width; }
  get height(): number { return this.spec.height; }

  occupies(x: number, y: number): boolean {
    return x >= this.tileX && x < this.tileX + this.spec.width
        && y >= this.tileY && y < this.tileY + this.spec.height;
  }

  centerPixel(): { x: number; y: number } {
    return {
      x: (this.tileX + this.spec.width / 2) * TILE_SIZE,
      y: (this.tileY + this.spec.height / 2) * TILE_SIZE,
    };
  }
}
