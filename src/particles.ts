export type ParticleKind = 'spark' | 'puff' | 'ring';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;      // seconds remaining
  maxLife: number;   // seconds at spawn
  kind: ParticleKind;
  color: string;
  size: number;
}

export function updateParticle(p: Particle, dt: number): void {
  p.life -= dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.kind === 'spark') {
    p.vy += 200 * dt;             // gravity
    p.vx *= Math.max(0, 1 - 3 * dt); // air drag
  } else if (p.kind === 'puff') {
    p.vx *= Math.max(0, 1 - 4 * dt);
    p.vy *= Math.max(0, 1 - 4 * dt);
    p.size += 5 * dt;
  } else if (p.kind === 'ring') {
    p.size += 55 * dt;
  }
}

export function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  const t = Math.max(0, p.life / p.maxLife);
  if (p.kind === 'spark') {
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.globalAlpha = 1;
  } else if (p.kind === 'puff') {
    ctx.globalAlpha = t * 0.6;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (p.kind === 'ring') {
    ctx.globalAlpha = t;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
