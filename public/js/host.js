// Optional: Override QR code URL for LAN testing
// Set this in browser console if needed: window.__QR_HOST_OVERRIDE__ = 'http://YOUR_IP:3000'
// window.__QR_HOST_OVERRIDE__ = 'http://10.195.41.191:3000';

(() => {
  const socket = io();

  const pinArea = document.getElementById('pinArea');
  const pinText = document.getElementById('pinText');
  const qrcodeEl = document.getElementById('qrcode');
  const playersSpan = document.getElementById('players');
  const stageEl = document.getElementById('stage');

  let pin = null;

  // Create room automatically when host opens the page
  (async function createRoom() {
    const res = await fetch('/create-room');
    const json = await res.json();
    pin = json.pin;
    pinText.textContent = pin;
    pinArea.style.display = 'block';
    const hostOverride = window.__QR_HOST_OVERRIDE__ || location.origin;
    const joinUrl = `${hostOverride}/join/${pin}`;
    qrcodeEl.innerHTML = '';
    // Generate QR as image using QRCode.toDataURL for better compatibility
    if (window.QRCode && QRCode.toDataURL) {
      QRCode.toDataURL(joinUrl, { width: 200 }).then((dataUrl) => {
        const img = new Image();
        img.src = dataUrl;
        qrcodeEl.appendChild(img);
      }).catch((err) => {
        console.error('QR error', err);
        qrcodeEl.textContent = joinUrl;
      });
    } else {
      // fallback: show the URL
      qrcodeEl.textContent = joinUrl;
    }
    // tell server we're host
    socket.emit('host-join', { pin });
  })();

  // maintain a simple list of player names shown inline (playersSpan may be absent)
  const players = new Map();
  function refreshPlayersLine() {
    if (!playersSpan) return;
    if (players.size === 0) playersSpan.textContent = '(none)';
    else playersSpan.textContent = Array.from(players.values()).join(', ');
  }

  socket.on('player-joined', (data) => {
    players.set(data.id, data.name || 'Guest');
    refreshPlayersLine();
  });

  socket.on('player-left', (data) => {
    players.delete(data.id);
    refreshPlayersLine();
  });

  // Handle new lantern submission
  socket.on('new-lantern', (data) => {
    console.log('New lantern received:', {
      ...data,
      faces: data.faces ? `${data.faces.length} faces` : 'no faces',
      sampleFace: data.faces?.[0]?.substring(0, 50)
    });
    if (!data.faces && !data.imageDataUrl) {
      console.error('No lantern image data received:', data);
      return;
    }
    // spawn on THREE.js stage if available
    if (window.spawnLanternOnStage) {
      window.spawnLanternOnStage(data);
    }
  });

  // Initialize THREE.js stage when available
  function initStage() {
    if (window.initLanternStage) {
      window.initLanternStage();
      console.log('✅ THREE.js lantern stage initialized');
    } else {
      console.warn('⚠️ initLanternStage not available, retrying...');
      setTimeout(initStage, 100);
    }
  }
  initStage();

  // if the server sends an initial room state, populate players
  socket.on('room-state', (s) => {
    if (s && s.players) {
      s.players.forEach(p => players.set(p.id, p.name));
      refreshPlayersLine();
    }
  });
})();
