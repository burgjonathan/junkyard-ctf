# Junkyard CTF

Browser-based 1v1 Capture-the-Flag over WebSocket. Melee-only prototype.

## Run locally

```bash
npm install
npm run dev
```

- Client dev server: `http://localhost:5173`
- WebSocket server: `ws://localhost:3001`

Open two browser tabs against the client dev URL. First tab clicks **Create Room**, second tab types the 4-character code and joins.

Controls: **WASD** to move, **mouse** to aim, **left-click** or **space** to attack.

## Build + run prod-style locally

```bash
npm run build     # vite bundles the client into dist/
npm start         # Node serves dist/ + upgrades ws on the same port
```

Then open `http://localhost:3001` in two tabs. This mirrors the deployed setup.

## Deploy to Render

Push the repo to GitHub, then on Render:

1. **New → Web Service**, connect the repo.
2. Environment: **Node**.
3. Build command: `npm ci --include=dev && npm run build`
4. Start command: `npm start`
5. Health check path: `/healthz`
6. Set `NODE_VERSION=22` in Environment Variables (or Render picks a modern default).

Or just commit the included `render.yaml` and use **New → Blueprint** — Render will read it and set everything up.

Render provides HTTPS, so the client connects to the same origin via `wss://<your-service>.onrender.com`. No code changes are needed between local and deployed — the client picks the right ws URL based on the page protocol.

### Notes

- Free tier: cold-start delay after ~15 min idle. First request wakes the instance.
- Single instance only — matches are held in memory, so a restart drops any in-progress rooms.
- The dev-only path (Vite on 5173, ws on 3001) is only used with `npm run dev`. The deployed service is a single Node process on the Render-provided `PORT`.
