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
  const sfxVolumeInput = document.getElementById('sfxVolume');
  const sfxVolumeValue = document.getElementById('sfxVolumeValue');
  const autoPlayStoriesCheckbox = document.getElementById('autoPlayStories');
  const bgThumbnails = document.querySelectorAll('.bg-thumbnail');



  // Host page elements
  const pinArea = document.getElementById('pinArea');
  const pinText = document.getElementById('pinText');
  const qrcodeEl = document.getElementById('qrcode');
  const playersSpan = document.getElementById('players');
  const stageEl = document.getElementById('stage');

  let pin = null;
  // Track the currently shown story overlay (created by showLanternStory)
  let storyOverlay = null;

  // Prevent duplicate spawn handling for the same submission id
  const _recentLanternSpawns = new Set();
  function _markLanternSpawned(id) {
    if (!id) return;
    _recentLanternSpawns.add(id);
    // remove after short window to avoid permanently blocking legitimate resends
    setTimeout(() => _recentLanternSpawns.delete(id), 5000);
  }
  function _wasLanternSpawned(id) {
    return id && _recentLanternSpawns.has(id);
  }

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
    bgVolume: 20,
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

  // Reset settings to defaults (used when creating a fresh new room)
  function resetSettingsToDefaults() {
    settings.maxLanterns = 10;
    settings.respawnCount = 3;
    settings.muteNarrator = false;
    settings.bgVolume = 20;
    settings.autoPlayStories = true;
    settings.bgImage = 'bg1.jpg';
    saveSettings();
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
    // volume slider reflects background music level (0-100)
    if (sfxVolumeInput) sfxVolumeInput.value = settings.bgVolume;
    if (sfxVolumeValue) sfxVolumeValue.textContent = settings.bgVolume;
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

    // Apply audio volume setting
    try {
      if (window.LanternAudio) {
        const vol = (settings.bgVolume || 0) / 100;
        if (vol === 0) {
          window.LanternAudio.pauseBackgroundMusic();
        } else {
          window.LanternAudio.setBackgroundVolume(vol);
          window.LanternAudio.playBackgroundMusic();
        }
      }
    } catch (e) {
      console.warn('Failed to apply background volume', e);
    }

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

  // Background music volume slider
  if (sfxVolumeInput) {
    sfxVolumeInput.addEventListener('input', (e) => {
      settings.bgVolume = parseInt(e.target.value) || 0;
      if (sfxVolumeValue) sfxVolumeValue.textContent = settings.bgVolume;
      updateSliderFill(sfxVolumeInput);
      saveSettings();

      if (window.LanternAudio) {
        const vol = settings.bgVolume / 100;
        if (vol === 0) {
          window.LanternAudio.pauseBackgroundMusic();
        } else {
          window.LanternAudio.setBackgroundVolume(vol);
          window.LanternAudio.playBackgroundMusic();
        }
      }

      socket.emit('settings-updated', settings);
    });
    sfxVolumeInput.addEventListener('change', () => updateSliderFill(sfxVolumeInput));
  }

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
  // Placeholder hook for AI background generation. Your colleague can provide
  // `window.requestAIGeneratedBackground()` which should return a Promise
  // resolving to the generated filename (e.g. 'bgAI.jpg') or null on failure.
  async function generateAIBackground(thumb) {
    if (!thumb) return;
    try {
      thumb.classList.add('loading');
      if (typeof window.requestAIGeneratedBackground === 'function') {
        const result = await window.requestAIGeneratedBackground();
        thumb.classList.remove('loading');
        if (result) {
          settings.bgImage = result;
          saveSettings();
          updateSettingsUI();
        } else {
          console.warn('AI background generator returned no result');
        }
      } else {
        // Fallback stub: simulate a short generation delay and then select the
        // placeholder image 'bgAI.jpg'. Colleague can replace this behavior.
        await new Promise(r => setTimeout(r, 800));
        thumb.classList.remove('loading');
        settings.bgImage = thumb.dataset.bg || 'bgAI.jpg';
        saveSettings();
        updateSettingsUI();
        console.log('AI background placeholder selected (stub)');
      }
    } catch (err) {
      thumb.classList.remove('loading');
      console.error('AI background generation failed', err);
    }
  }

  bgThumbnails.forEach(thumb => {
    thumb.addEventListener('click', () => {
      // For the AI thumbnail, call the placeholder/generator instead of
      // immediately applying the image.
      const isAI = thumb.classList.contains('ai') || thumb.dataset.bg === 'bgAI.jpg';
      if (isAI) {
        generateAIBackground(thumb);
        return;
      }

      settings.bgImage = thumb.dataset.bg;
      saveSettings();
      updateSettingsUI();
    });
  });

  // Load settings on page load
  loadSettings();

  // Add event listener to play background music on first click
  document.addEventListener('click', () => {
    if (window.LanternAudio) {
      window.LanternAudio.playBackgroundMusic();
    }
  }, { once: true });

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
    // Reset host settings to defaults for a fresh room (do not reset on reconnect)
    resetSettingsToDefaults();
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

  // translation state for host UI
  let hostStoryLang = 'en'; // 'en' or 'zh'
  const translateToggle = document.getElementById('translateToggle');
  if (translateToggle) {
    translateToggle.addEventListener('click', () => {
      hostStoryLang = hostStoryLang === 'en' ? 'zh' : 'en';
      translateToggle.textContent = hostStoryLang === 'en' ? 'EN / 中' : '中 / EN';
      // If an overlay is visible, switch it immediately
      if (storyOverlay && storyOverlay.dataset) {
        const contentEl = storyOverlay.querySelector('.lantern-story-content');
        if (contentEl) {
          const en = storyOverlay.dataset.en || '';
          const zh = storyOverlay.dataset.zh || '';
          contentEl.textContent = (hostStoryLang === 'zh' && zh) ? zh : en;
        }
      }
    });
  }

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

    // Guard against duplicate spawns for the same submission (some clients may
    // re-send or the same event might be emitted twice). Build a more robust
    // fingerprint using any available id or the image/faces payload so identical
    // lanterns aren't spawned twice.
    const spawnKey = data.id || data.socketId || data._cid || data.imageDataUrl || (data.faces ? data.faces.join('|') : null);
    if (_wasLanternSpawned(spawnKey)) {
      console.warn('Duplicate lantern event ignored for key:', spawnKey);
      return;
    }
    _markLanternSpawned(spawnKey);

    // spawn on THREE.js stage if available
    if (window.spawnLanternOnStage) {
      // ensure bilingual payload is present so stage can store it on the mesh
      if (!data.customMessageBilingual && data.customMessage) {
        data.customMessageBilingual = { en: data.customMessage, zh: null };
      }
      window.spawnLanternOnStage(data);
    }

    // Attach bilingual story to mesh/userData so host can toggle quickly
    // const storyPayload = data.customMessageBilingual || (data.customMessage ? { en: data.customMessage, zh: null } : null);
    //
    // // If the MCP produced a story and autoplay is enabled, show it
    // if (storyPayload && settings.autoPlayStories) {
    //   showLanternStory(storyPayload, data.name);
    // }
  });

  // Replace existing showLanternStory with bilingual-aware version
  function showLanternStory(textOrPair, author) {
    try {
      // Cancel if message is empty/whitespace
      if (typeof textOrPair === 'string') {
        if (!textOrPair || String(textOrPair).trim().length === 0) return;
      } else if (textOrPair && typeof textOrPair === 'object') {
        const en = (textOrPair.en || '').toString().trim();
        const zh = (textOrPair.zh || '').toString().trim();
        if (!en && !zh) return;
      } else {
        return;
      }
      // remove existing
      if (storyOverlay && storyOverlay.parentNode) storyOverlay.remove();

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

      // header
      const header = document.createElement('div');
      header.style.fontWeight = '700';
      header.textContent = `${author || 'Someone'}'s story:`;

      const content = document.createElement('div');
      content.className = 'lantern-story-content';
      content.style.marginTop = '8px';

      // Accept either a plain string or an object {en, zh}
      if (typeof textOrPair === 'string') {
        overlay.dataset.en = textOrPair;
        overlay.dataset.zh = '';
        content.textContent = textOrPair;
      } else if (textOrPair && typeof textOrPair === 'object') {
        overlay.dataset.en = textOrPair.en || (textOrPair.zh || '');
        overlay.dataset.zh = textOrPair.zh || '';
        // default show according to host preference (if available)
        content.textContent = (hostStoryLang === 'zh' && overlay.dataset.zh) ? overlay.dataset.zh : overlay.dataset.en;
      } else {
        overlay.dataset.en = '';
        overlay.dataset.zh = '';
        content.textContent = '';
      }

      overlay.appendChild(header);
      overlay.appendChild(content);
      document.body.appendChild(overlay);
      storyOverlay = overlay;

      // auto-hide after 7s with fade
      setTimeout(() => {
        try {
          overlay.style.transition = 'opacity 0.6s';
          overlay.style.opacity = '0';
          setTimeout(() => overlay.remove(), 600);
        } catch (e) {
          overlay.remove();
        }
      }, 7000);
    } catch (e) {
      console.warn('Failed to show lantern story overlay', e);
    }
  }

  // Expose host overlay API immediately so three-stage delegates to host UI
  // (three-stage's onPointerClick will call window.showLanternStory(...))
  window.showLanternStory = showLanternStory;

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
