# Lantern Festival — Minimal demo

This is a minimal demo app that implements the requested lobby and join flow:

- Host page displays a generated 4-digit PIN and a QR code. Mobile devices can join using the QR or the PIN.
- Mobile page provides a small drawing canvas to draw a lantern face and submit it. Submitted lanterns are forwarded to the host in real-time.

Run locally:

1. Install dependencies:

   npm install

2. Start the server:

   npm start

3. Open the host page in your browser:

  ### Lantern Festival — Real-time lantern drawing & stage

  Lantern Festival is a small real-time Node + Socket.IO app that lets a host open a room (4‑digit PIN + QR), and participants join from phones to draw lantern faces and submit them. Submitted lanterns appear on the host's three.js stage as textured, floating lanterns.

  This repository contains the server, host UI, and mobile UI used during demo/testing.

  ## Quick local run (Windows CMD)

  1. Install dependencies

     ```cmd
     npm install
     ```

  2. Start server

     ```cmd
     npm start
     ```

  3. Open the host page in a browser

     - http://localhost:3000/ — click Create Room

  4. On a phone scan the QR shown by the host screen, or open the URL `/join/<PIN>` (host QR links now redirect to the index page and open the join modal automatically).

  ## Features (what's included)
  - Real-time lobby: host can create a room and see connected players.
  - QR + PIN join flow: mobile users can scan a QR or enter a 4-digit PIN to join.
  - Mobile drawing UI: cube (4 faces) and cylinder (wrap) canvases for drawing lantern faces.
  - Folding preview animation on mobile before submission; whoosh SFX when floating begins.
  - Server-side Socket.IO routing: `submit-lantern`, `new-lantern`, `join-room`, `host-join`, `player-joined`, etc.
  - Background AI features (optional): QWEN-based story generation and Wanx/DashScope background generation (requires API key).
  - Host controls: background thumbnails (including AI generation), max lanterns, respawn count, music volume slider, and player kick.
  - Asynchronous auto-translation: server can translate submitted messages into English + Chinese and emit `lantern-translation` to the host.
  - Room activity timeout and optional Redis persistence (set `REDIS_URL` to enable persistent room state).

  ## Deployment: free & low-cost options (summary)

  Short answer (fastest):
  - Temporary sharing while testing: use ngrok to expose your local port to the internet.
  - Free hosted options that run a Node server and keep WebSocket (Socket.IO) connections:
    - Replit: easiest for small demos — create a Repl from your GitHub repo and set the run command to `node server.js`.
    - Fly.io: small free allocation suitable for apps using sockets (VM-style apps). You’ll install `flyctl`, `fly launch`, and deploy; good for persistent sockets.
    - Railway / Render / similar: they sometimes provide free credits or tiers; policies change — read their docs and pick the one that supports long-lived WebSocket or TCP connections.

  Notes and cautions
  - Static-only hosts (GitHub Pages, Netlify static sites, Vercel static hosting) cannot host a long-lived Socket.IO server. You need a host that runs your Node server or provides a VM/container.
  - Free tiers change frequently. If you need a stable public demo for many users, consider a paid small instance or cloud credits.

  ## Quick options and step-by-step

  ### 1) Quick temporary sharing (recommended for testing, no deployment)

  - Install and run your server locally:

    ```cmd
    npm install
    npm start
    ```

  - Start ngrok (quick tunnel)

    1. Sign up at https://ngrok.com and install the ngrok CLI.
    2. Authenticate: `ngrok authtoken YOUR_AUTHTOKEN` (one-time)
    3. Run:

       ```cmd
       ngrok http 3000
       ```

    4. Share the forwarding URL (https://xxxx.ngrok.io). The host and mobile clients will use that public URL and maintain WebSocket connections.

  Pros: instant, good for demos. Cons: temporary, connection may stop when ngrok session ends; free tunnels sleep/rotate.

  ### 2) Replit (fastest free-ish deploy that runs Node)

  - Create a Repl from your GitHub repository or import the repo.
  - Set the Run command to `node server.js` and add necessary environment variables in the Replit Secrets panel (e.g., `QWEN_API_KEY`, `REDIS_URL`).
  - Replit exposes a public URL; share that URL.

  Pros: easy GUI, quick. Cons: free repls may sleep, limited CPU & bandwidth.

  ### 3) Fly.io (recommended for small, persistent socket apps)

  - Install `flyctl` (https://fly.io/docs/). Create an account.
  - From the project root:

    ```bash
    flyctl launch
    # follow prompts (choose app name, region)
    flyctl deploy
    ```

  - Set environment variables:

    ```bash
    flyctl secrets set QWEN_API_KEY="your_key"
    flyctl secrets set REDIS_URL="redis://..."
    ```

  Pros: runs as a small VM with persistent connections, supports websockets well. Cons: learning curve; free allocations exist but may require signup and provide limited credits.

  ### 4) Railway / Render / other PaaS

  - Railway and Render historically offered free tiers or credits and can run a Node server; steps are similar: connect GitHub repo, configure `node server.js` as start command, set environment variables/secrets.
  - Check current provider docs for Socket.IO support and free limitations.

  ## Production notes
  - Use HTTPS and a valid domain for production (obtain certs via Let's Encrypt or provider-managed SSL).
  - Use a proper Redis instance for room persistence when hosting multiple replicas.
  - Configure process management (PM2, systemd) or use container-based deploy with health checks.

  ## Repository structure (high level)
  - `server.js` — Express + Socket.IO server, room management, AI helpers.
  - `public/host.html` — Host UI (three.js stage + host controls).
  - `public/mobile.html` — Mobile drawing UI and submit flow.
  - `public/js/` — client JS: `host.js`, `mobile.js`, `three-stage.js`, `audio.js`, etc.
  - `public/css/` — styles (`style.css`, `mobile.css`, index CSS).

  ## Environment variables
  - `QWEN_API_KEY` — (optional) API key for QWEN / DashScope image and story generation.
  - `REDIS_URL` — (optional) Redis connection string for room persistence.
  - `PORT` — (optional) port for the server (defaults to `3000`).

  ## How others can join your deployed app
  - Deploy the server to a public host (ngrok, Replit, Fly.io, etc.).
  - The host screen will show a QR with a `/join/<PIN>` URL; scanning it opens the publicly accessible join modal on the index page and pre-fills the PIN.

  ## Troubleshooting & tips
  - If sockets fail to connect after deployment, check that your provider allows WebSocket connections and that your process is running on the expected port.
  - If AI features fail, verify `QWEN_API_KEY` is set and that your host can reach the QWEN/DashScope endpoints.

  ## Contributing / Next improvements
  - Add authentication for hosts and players.
  - Add persistent storage for lantern submissions (S3 + DB), moderation tools, and administrative controls.
  - Add unit/integration tests and a CI deploy pipeline.

  ## License & Security
  - This project is a demo. If you publish a public instance, do not ship private API keys in the repository and keep an eye on abuse and content moderation for user-submitted text/images.
