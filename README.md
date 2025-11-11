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

   http://localhost:3000/public/host.html

   (or just http://localhost:3000/ and open host.html)

When you click Create Room, the host will get a PIN and QR code. Open the QR link on a phone or visit /join/<PIN> to access the mobile UI.

New features added in this update:

- Multi-face drawing on mobile for cube lanterns (4 square canvases).
- Cylinder wrap canvas for cylindrical lanterns (landscape rectangle).
- Client-side folding preview animation before submission (CSS3D overlay).
- Server-side Redis persistence option for rooms and players (enabled if REDIS_URL is set).
- Host reconnection logic: host disconnection no longer deletes the room immediately.
- A simple three.js-based host stage that spawns floating lanterns using the submitted textures.

Run notes:

- Install new dependency:

   npm install

- If you want Redis persistence, set the environment variable REDIS_URL before starting, for example:

   set REDIS_URL=redis://localhost:6379
   npm start


Notes / next steps:

- This is an intentionally small, self-contained starting point. It uses in-memory rooms (not persisted). For production, add auth and persistence.
- The folding/3D animations are only placeholder; you can replace the mobile submission flow with a richer folding animation and send not only a PNG but vector data or multi-face patterns.
- Consider using a CDN or bundler for production assets.
