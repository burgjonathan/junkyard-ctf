export class Garage {
  tileX: number;
  tileY: number;
  width: number = 2;
  height: number = 2;

  constructor(tileX: number, tileY: number) {
    this.tileX = tileX;
    this.tileY = tileY;
  }

  occupies(tx: number, ty: number): boolean {
    return tx >= this.tileX && tx < this.tileX + this.width
        && ty >= this.tileY && ty < this.tileY + this.height;
  }

  // Returns pixel-space center for rendering / bot targeting reference.
  centerPixel(tileSize: number): { x: number; y: number } {
    return {
      x: (this.tileX + this.width / 2) * tileSize,
      y: (this.tileY + this.height / 2) * tileSize,
    };
  }
}
