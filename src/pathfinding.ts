export interface TileCoord {
  x: number;
  y: number;
}

const DIRS: Array<{ dx: number; dy: number; cost: number }> = [
  { dx: 1, dy: 0, cost: 1 },
  { dx: -1, dy: 0, cost: 1 },
  { dx: 0, dy: 1, cost: 1 },
  { dx: 0, dy: -1, cost: 1 },
  { dx: 1, dy: 1, cost: Math.SQRT2 },
  { dx: 1, dy: -1, cost: Math.SQRT2 },
  { dx: -1, dy: 1, cost: Math.SQRT2 },
  { dx: -1, dy: -1, cost: Math.SQRT2 },
];

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  // Octile distance — admissible for 8-directional grid with sqrt(2) diagonals
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: Node | null;
}

export function findPath(
  start: TileCoord,
  goal: TileCoord,
  isBlocked: (x: number, y: number) => boolean,
  width: number,
  height: number,
): TileCoord[] {
  if (start.x === goal.x && start.y === goal.y) return [];
  if (isBlocked(goal.x, goal.y)) return [];

  const open: Node[] = [];
  const closed = new Uint8Array(width * height);
  const bestG = new Float32Array(width * height).fill(Infinity);

  const startNode: Node = {
    x: start.x,
    y: start.y,
    g: 0,
    f: heuristic(start.x, start.y, goal.x, goal.y),
    parent: null,
  };
  open.push(startNode);
  bestG[start.y * width + start.x] = 0;

  while (open.length > 0) {
    // Linear scan for lowest-f node (fine for our grid size)
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open[bestIdx];
    open[bestIdx] = open[open.length - 1];
    open.pop();

    if (current.x === goal.x && current.y === goal.y) {
      const path: TileCoord[] = [];
      let n: Node | null = current;
      while (n && n.parent) {
        path.push({ x: n.x, y: n.y });
        n = n.parent;
      }
      path.reverse();
      return path;
    }

    closed[current.y * width + current.x] = 1;

    for (const d of DIRS) {
      const nx = current.x + d.dx;
      const ny = current.y + d.dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (closed[ny * width + nx]) continue;
      if (isBlocked(nx, ny)) continue;

      // Prevent diagonal corner-cutting through blocked tiles
      if (d.dx !== 0 && d.dy !== 0) {
        if (isBlocked(current.x + d.dx, current.y)) continue;
        if (isBlocked(current.x, current.y + d.dy)) continue;
      }

      const tentativeG = current.g + d.cost;
      const idx = ny * width + nx;
      if (tentativeG >= bestG[idx]) continue;
      bestG[idx] = tentativeG;

      open.push({
        x: nx,
        y: ny,
        g: tentativeG,
        f: tentativeG + heuristic(nx, ny, goal.x, goal.y),
        parent: current,
      });
    }
  }

  return [];
}

// Find nearest walkable tile adjacent to (or on) the given target.
// Useful for pathing "to" a resource or building that isn't walkable itself.
export function findNearestWalkable(
  from: TileCoord,
  target: TileCoord,
  isWalkable: (x: number, y: number) => boolean,
  width: number,
  height: number,
): TileCoord | null {
  const candidates: TileCoord[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = target.x + dx;
      const ny = target.y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (isWalkable(nx, ny)) candidates.push({ x: nx, y: ny });
    }
  }
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestDist = heuristic(from.x, from.y, best.x, best.y);
  for (let i = 1; i < candidates.length; i++) {
    const d = heuristic(from.x, from.y, candidates[i].x, candidates[i].y);
    if (d < bestDist) { best = candidates[i]; bestDist = d; }
  }
  return best;
}
