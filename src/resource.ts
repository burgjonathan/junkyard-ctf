import type { ResourceKind } from './constants.ts';

export class ResourceNode {
  tileX: number;
  tileY: number;
  kind: ResourceKind;
  amount: number;
  initialAmount: number;
  depleted: boolean = false;

  constructor(tileX: number, tileY: number, kind: ResourceKind, amount: number) {
    this.tileX = tileX;
    this.tileY = tileY;
    this.kind = kind;
    this.amount = amount;
    this.initialAmount = amount;
  }

  take(requested: number): number {
    const taken = Math.min(requested, this.amount);
    this.amount -= taken;
    if (this.amount <= 0) this.depleted = true;
    return taken;
  }
}
