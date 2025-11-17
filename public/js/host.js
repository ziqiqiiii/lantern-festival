// Optional: Override QR code URL for LAN testing
// Set this in browser console if needed: window.__QR_HOST_OVERRIDE__ = 'http://YOUR_IP:3000'
// window.__QR_HOST_OVERRIDE__ = 'http://10.195.41.191:3000';
window.__QR_HOST_OVERRIDE__ = 'http://10.195.66.208:3000';

(() => {
  const socket = io();

  // Sidebar elements
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarClose = document.getElementById('sidebarClose');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const usersList = document.getElementById('usersList');
  const pinTextSidebar = document.getElementById('pinTextSidebar');
  const pinInfo = document.getElementById('pinInfo');

  // Settings elements
  const maxLanternsInput = document.getElementById('maxLanterns');
  const maxLanternsValue = document.getElementById('maxLanternsValue');
  const respawnCountInput = document.getElementById('respawnCount');
  const respawnCountValue = document.getElementById('respawnCountValue');
  const muteNarratorCheckbox = document.getElementById('muteNarrator');
  const muteSFXCheckbox = document.getElementById('muteSFX');
  const autoPlayStoriesCheckbox = document.getElementById('autoPlayStories');
  const bgThumbnails = document.querySelectorAll('.bg-thumbnail');

  // Host page elements
  const pinArea = document.getElementById('pinArea');
  const pinText = document.getElementById('pinText');
  const qrcodeEl = document.getElementById('qrcode');
  const playersSpan = document.getElementById('players');
  const stageEl = document.getElementById('stage');

  let pin = null;

  // Sidebar toggle functionality
  function openSidebar() {
    sidebar.classList.add('open');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
  }

  sidebarToggle.addEventListener('click', openSidebar);
  sidebarClose.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  // Settings Management
  const settings = {
    maxLanterns: 10,
    respawnCount: 3,
    muteNarrator: false,
    muteSFX: false,
    autoPlayStories: true,
    bgImage: 'bg1.jpg'
  };

  // Load settings from localStorage
  function loadSettings() {
    const saved = localStorage.getItem('lanternHostSettings');
    if (saved) {
      Object.assign(settings, JSON.parse(saved));
    }
    updateSettingsUI();
  }

  // Save settings to localStorage
  function saveSettings() {
    localStorage.setItem('lanternHostSettings', JSON.stringify(settings));
  }

  // Update UI to reflect current settings
  function updateSettingsUI() {
    maxLanternsInput.value = settings.maxLanterns;
    maxLanternsValue.textContent = settings.maxLanterns;
    respawnCountInput.value = settings.respawnCount;
    respawnCountValue.textContent = settings.respawnCount;
    muteNarratorCheckbox.checked = settings.muteNarrator;
    muteSFXCheckbox.checked = settings.muteSFX;
    autoPlayStoriesCheckbox.checked = settings.autoPlayStories;

    // Update background thumbnail selection
    bgThumbnails.forEach(thumb => {
      thumb.classList.remove('selected');
      if (thumb.dataset.bg === settings.bgImage) {
        thumb.classList.add('selected');
      }
    });

    // Apply background image
    const bgElement = document.querySelector('.lobby-background');
    if (bgElement) {
      bgElement.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.45),rgba(0,0,0,0.45)), url('/img/${settings.bgImage}')`;
    }

    // Apply lantern config
    applyLanternConfig();

    // Ensure slider visuals update correctly after programmatic value changes
    // Dispatch an 'input' event so any UI bindings/listeners update thumbs and styles
    try {
      maxLanternsInput.dispatchEvent(new Event('input', { bubbles: true }));
      respawnCountInput.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (e) {
      // ignore if dispatching fails in some environments
      console.warn('Failed to dispatch input events for sliders', e);
    }
  }

  // Settings event listeners
  maxLanternsInput.addEventListener('input', (e) => {
    settings.maxLanterns = parseInt(e.target.value);
    maxLanternsValue.textContent = settings.maxLanterns;
    updateSliderFill(maxLanternsInput);
    saveSettings();
    applyLanternConfig();
    socket.emit('settings-updated', settings);
  });
  maxLanternsInput.addEventListener('change', () => updateSliderFill(maxLanternsInput));

  respawnCountInput.addEventListener('input', (e) => {
    settings.respawnCount = parseInt(e.target.value);
    respawnCountValue.textContent = settings.respawnCount;
    updateSliderFill(respawnCountInput);
    saveSettings();
    applyLanternConfig();
    socket.emit('settings-updated', settings);
  });
  respawnCountInput.addEventListener('change', () => updateSliderFill(respawnCountInput));

  muteNarratorCheckbox.addEventListener('change', (e) => {
    settings.muteNarrator = e.target.checked;
    saveSettings();
    socket.emit('settings-updated', settings);
  });

  muteSFXCheckbox.addEventListener('change', (e) => {
    settings.muteSFX = e.target.checked;
    saveSettings();
    socket.emit('settings-updated', settings);
  });

  autoPlayStoriesCheckbox.addEventListener('change', (e) => {
    settings.autoPlayStories = e.target.checked;
    saveSettings();
    socket.emit('settings-updated', settings);
  });

  // Apply lantern config to three-stage.js
  function applyLanternConfig() {
    if (window.LANTERN_CONFIG) {
      window.LANTERN_CONFIG.maxLanterns = settings.maxLanterns;
      window.LANTERN_CONFIG.respawnCount = settings.respawnCount;
    }
  }

  // Visual helper to update slider track fill (cross-browser fallback)
  function updateSliderFill(input) {
    if (!input) return;
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 100;
    const val = parseFloat(input.value) || 0;
    const pct = Math.round(((val - min) / (max - min)) * 100);
    // Use background gradient to show filled portion and remaining track
    input.style.background = `linear-gradient(90deg, rgba(102,126,234,0.9) ${pct}%, rgba(255,255,255,0.12) ${pct}%)`;
  }

  // Background selection
  bgThumbnails.forEach(thumb => {
    thumb.addEventListener('click', () => {
      settings.bgImage = thumb.dataset.bg;
      saveSettings();
      updateSettingsUI();
    });
  });

  // Load settings on page load
  loadSettings();

  // Try to reconnect to existing room or create new one
  (async function initRoom() {
    // Check for existing PIN in sessionStorage
    const savedPin = sessionStorage.getItem('host_room_pin');

    if (savedPin) {
      // Try to reconnect to existing room
      console.log(`Attempting to reconnect to room ${savedPin}...`);
      const checkRes = await fetch(`/check-room/${savedPin}`);
      const checkData = await checkRes.json();

      if (checkData.exists) {
        // Room still exists, reconnect
        pin = savedPin;
        console.log(`✅ Reconnected to existing room ${pin}`);
        displayRoomInfo(pin);
        socket.emit('host-join', { pin });
        return;
      } else {
        // Room no longer exists, clear saved PIN
        console.log(`⚠️ Saved room ${savedPin} no longer exists, creating new room`);
        sessionStorage.removeItem('host_room_pin');
      }
    }

    // Create new room
    const res = await fetch('/create-room');
    const json = await res.json();
    pin = json.pin;

    // Save PIN for reconnection
    sessionStorage.setItem('host_room_pin', pin);

    console.log(`✅ Created new room ${pin}`);
    displayRoomInfo(pin);
    socket.emit('host-join', { pin });
  })();

  // Function to display room info (PIN and QR code)
  function displayRoomInfo(roomPin) {
    pinText.textContent = roomPin;
    pinTextSidebar.textContent = roomPin;
    pinArea.style.display = 'block';
    pinInfo.style.display = 'block';
    const hostOverride = window.__QR_HOST_OVERRIDE__ || location.origin;
    const joinUrl = `${hostOverride}/join/${roomPin}`;
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
  }

  // maintain a map of player names
  const players = new Map();

  // Limit visible users in sidebar and allow toggling
  const VISIBLE_USERS_LIMIT = 5; // show first 6 users by default
  let usersShowAll = false;
  const usersCountEl = document.getElementById('usersCount');
  const usersToggleWrap = document.getElementById('usersToggle');

  function updateUsersList() {
    // Update counter
    const total = players.size;
    if (usersCountEl) usersCountEl.textContent = `(${total})`;

    if (total === 0) {
      usersList.innerHTML = '<p class="empty-state">No users connected</p>';
      if (usersToggleWrap) usersToggleWrap.innerHTML = '';
      return;
    }

    // Determine slice of players to show
    const showAll = usersShowAll || total <= VISIBLE_USERS_LIMIT;
    const toRender = [];
    let idx = 0;
    for (const [id, name] of players) {
      if (!showAll && idx >= VISIBLE_USERS_LIMIT) break;
      toRender.push({ id, name });
      idx++;
    }

    // Build DOM nodes
    usersList.innerHTML = '';
    toRender.forEach(({ id, name }) => {
      const item = document.createElement('div');
      item.className = 'user-item';
      item.dataset.id = id;

      const nameSpan = document.createElement('span');
      nameSpan.textContent = name || 'Guest';
      item.appendChild(nameSpan);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kick-btn';
      btn.title = 'Kick user';
      btn.innerText = '✖';
      item.appendChild(btn);

      usersList.appendChild(item);
    });

    // Show toggle when there are more users than the limit
    if (usersToggleWrap) {
      if (total > VISIBLE_USERS_LIMIT) {
        const remaining = Math.max(0, total - VISIBLE_USERS_LIMIT);
        usersToggleWrap.innerHTML = '';
        const link = document.createElement('a');
        link.href = '#';
        link.className = 'users-toggle-link';
        link.textContent = usersShowAll ? 'Show less' : `Show ${remaining} more`;
        link.addEventListener('click', (ev) => {
          ev.preventDefault();
          usersShowAll = !usersShowAll;
          updateUsersList();
          // keep focus on sidebar after toggling
          try { sidebar.focus(); } catch (e) { /* ignore */ }
        });
        usersToggleWrap.appendChild(link);
      } else {
        usersToggleWrap.innerHTML = '';
      }
    }
  }

  // Handle kick button clicks via event delegation
  usersList.addEventListener('click', (e) => {
    const btn = e.target.closest('.kick-btn');
    if (!btn) return;
    const item = btn.closest('.user-item');
    if (!item) return;
    const targetId = item.dataset.id;
    const targetName = item.querySelector('span')?.textContent || 'Guest';

    // Confirm kick
    if (!confirm(`Kick ${targetName}? This will remove them from the room.`)) return;

    // Emit kick request to server (host only)
    socket.emit('kick-player', { id: targetId });
  });

  // Update the small inline players line (if present) and keep sidebar list in sync
  function refreshPlayersLine() {
    // Update inline header players line if the element exists
    if (playersSpan) {
      if (players.size === 0) playersSpan.textContent = '(none)';
      else playersSpan.textContent = Array.from(players.values()).join(', ');
    }
    // Always update the sidebar users list so it's populated even if header line is absent
    updateUsersList();
  }

  socket.on('player-joined', (data) => {
    players.set(data.id, data.name || 'Guest');
    updateUsersList();
  });

  socket.on('player-left', (data) => {
    players.delete(data.id);
    updateUsersList();
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

    // If the MCP produced a story, show it briefly on the host screen
    if (data.customMessage && data.autoNarrate) {
      showLanternStory(data.customMessage, data.name);
    }
  });

  // Simple ephemeral story overlay
  function showLanternStory(text, author) {
    try {
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.left = '50%';
      overlay.style.top = '10%';
      overlay.style.transform = 'translateX(-50%)';
      overlay.style.background = 'rgba(0,0,0,0.75)';
      overlay.style.color = 'white';
      overlay.style.padding = '14px 18px';
      overlay.style.borderRadius = '10px';
      overlay.style.zIndex = 9999;
      overlay.style.maxWidth = '70%';
      overlay.style.boxShadow = '0 6px 18px rgba(0,0,0,0.4)';
      overlay.style.fontSize = '14px';
      overlay.style.lineHeight = '1.4';
      overlay.innerHTML = `<strong>${author || 'Someone'}'s story: </strong><div style="margin-top:8px;">${text}</div>`;
      document.body.appendChild(overlay);
      setTimeout(() => {
        overlay.style.transition = 'opacity 0.6s';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 600);
      }, 7000); // show for 7s
    } catch (e) {
      console.warn('Failed to show lantern story overlay', e);
    }
  }

  // Initialize THREE.js stage when available
  function initStage() {
    if (window.initLanternStage) {
      window.initLanternStage();
      console.log('✅ THREE.js lantern stage initialized');
      // Apply any saved host settings to the stage config now that it exists
      try {
        applyLanternConfig();
        // Also update visual slider fills in case stage applied values changed
        updateSliderFill(maxLanternsInput);
        updateSliderFill(respawnCountInput);
      } catch (e) {
        console.warn('Failed to apply lantern config after stage init', e);
      }
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
      // update both inline and sidebar lists
      refreshPlayersLine();
    }
  });

  // Handle room closed event
  socket.on('room-closed', (data) => {
    console.warn('Room closed:', data.message);
    alert('Room closed: ' + data.message);
    sessionStorage.removeItem('host_room_pin');
  });
})();
