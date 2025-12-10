// Simplified three.js stage for floating lanterns with configurable respawns
(() => {
  console.log('Three-stage.js loaded. THREE:', typeof THREE);

  if (typeof THREE === 'undefined') {
    console.error('❌ THREE.js not found. Please ensure it is loaded before this script.');
    return;
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  window.LANTERN_CONFIG = {
    respawnCount: 3,
    spawnRange: { x: [-9, 9], y: [-10, 15] },
    speedRange: { y: [0.01, 0.03], rot: [0.01, 0.015] },
    size: { width: 1, height: 1.2 },
    maxLanterns: 10,
    // Fire and lighting effects toggle
    enableFireEffects: false,  // Set to false to disable fire light and emissive glow
    fireIntensity: 4,         // Base fire light intensity
    emissiveIntensity: 0.7    // Material emissive glow intensity
  };

  // Visual constants / fallbacks (were missing and caused runtime errors)
  const FIRE_COLOR = 0xffd7a8;      // warm emissive color for lantern fire
  const SHADOW_COLOR = 0x111111;    // shadow material base color
  const SHADOW_EMISSIVE = 0x000000; // shadow emissive fallback
  const LABEL_OFFSET_Y = -0.9;      // vertical offset for name label

  // ============================================================================
  // STATE (added raycasting state)
  // ============================================================================

  let scene, camera, renderer;
  const lanterns = new Set();
  const lanternQueue = [];
  let lastTime = 0;

  // Raycaster and pointer state for hover/click interaction
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoveredMesh = null;
  let storyOverlay = null;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function init() {
    const canvas = document.getElementById('threeStage');
    if (!canvas) {
      console.error('❌ Canvas element with id="threeStage" not found.');
      return;
    }

    setupRenderer(canvas);
    setupScene();
    setupCamera(canvas);
    setupLights();
    setupResizeHandler(canvas);

    // Setup pointer events for hover/click
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('click', onPointerClick);

    animate();
  }

  function setupRenderer(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.sortObjects = true;
    resizeCanvas(canvas);
  }

  function setupScene() {
    scene = new THREE.Scene();
  }

  function setupCamera(canvas) {
    camera = new THREE.PerspectiveCamera(75, canvas.width / canvas.height, 0.1, 1000);
    camera.position.z = 8;
  }

  function setupLights() {
    const directionalLight = new THREE.DirectionalLight(0xffd7a8, 1.2);
    directionalLight.position.set(1, 2, 2);
    scene.add(directionalLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
  }

  function setupResizeHandler(canvas) {
    window.addEventListener('resize', () => resizeCanvas(canvas));
  }

  function resizeCanvas(canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    if (camera) {
      camera.aspect = canvas.width / canvas.height;
      camera.updateProjectionMatrix();
    }

    if (renderer) {
      renderer.setSize(canvas.width, canvas.height);
    }
  }

  // ============================================================================
  // MATERIAL CREATION
  // ============================================================================

  function createShadowMaterial() {
    return new THREE.MeshPhongMaterial({
      color: new THREE.Color(SHADOW_COLOR),
      transparent: true,
      opacity: 0.4,
      shininess: 30,
      emissive: SHADOW_EMISSIVE,
      emissiveIntensity: 0.4,
      depthWrite: false, // Prevent depth buffer issues with transparency
      alphaTest: 0.01    // Discard fully transparent pixels
    });
  }

  function createTextureMaterial(texture) {
    const config = window.LANTERN_CONFIG;
    return new THREE.MeshPhongMaterial({
      map: texture,
      transparent: false,
      opacity: 0.95,
      shininess: 30,
      emissive: config.enableFireEffects ? FIRE_COLOR : 0x000000,
      emissiveIntensity: config.enableFireEffects ? config.emissiveIntensity : 0,
      side: THREE.DoubleSide
    });
  }

  function createLanternMaterials(textures) {
    const shadowMaterial = createShadowMaterial();

    // BoxGeometry faces order: [right, left, top, bottom, front, back]
    // Texture mapping: [front, right, back, left]
    return [
      textures[1] ? createTextureMaterial(textures[1]) : shadowMaterial.clone(), // Right
      textures[3] ? createTextureMaterial(textures[3]) : shadowMaterial.clone(), // Left
      shadowMaterial.clone(), // Top
      shadowMaterial.clone(), // Bottom
      textures[0] ? createTextureMaterial(textures[0]) : shadowMaterial.clone(), // Front
      textures[2] ? createTextureMaterial(textures[2]) : shadowMaterial.clone()  // Back
    ];
  }

  // ============================================================================
  // LANTERN MESH CREATION
  // ============================================================================

  function createLanternMesh(textures, bgColor, shape) {
    const { width, height } = window.LANTERN_CONFIG.size;
    let geometry, materials;

    if (shape === 'cylinder') {
      // Create cylinder geometry
      const radius = width / 2;
      const radialSegments = 32; // Smooth cylinder
      geometry = new THREE.CylinderGeometry(radius, radius, height, radialSegments);

      // For cylinder: wrap texture around sides, shadow material for top/bottom
      const shadowMaterial = createShadowMaterial();
      materials = [
        createTextureMaterial(textures[0]), // Side (wrap around)
        shadowMaterial.clone(), // Top cap
        shadowMaterial.clone()  // Bottom cap
      ];
    } else {
      // Create cube geometry (default)
      geometry = new THREE.BoxGeometry(width, height, width);
      materials = createLanternMaterials(textures);
    }

    const mesh = new THREE.Mesh(geometry, materials);

    // Add fire light only if enabled
    if (window.LANTERN_CONFIG.enableFireEffects) {
      addFireLight(mesh);
    }

    return mesh;
  }

  function addFireLight(mesh) {
    const config = window.LANTERN_CONFIG;
    const fireLight = new THREE.PointLight(FIRE_COLOR, config.fireIntensity, 5);
    fireLight.position.set(0, 0, 0); // Center of the cube
    mesh.add(fireLight);

    mesh.userData.fireLight = fireLight;
    mesh.userData.lightPhase = Math.random() * Math.PI * 2;
    mesh.userData.lightPhase2 = Math.random() * Math.PI * 2; // Second phase for more randomness
  }

  // ============================================================================
  // NAME LABEL CREATION
  // ============================================================================

  function createNameLabel(name) {
    const canvas = createLabelCanvas(name);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = createLabelSprite(texture, canvas);

    return sprite;
  }

  function createLabelCanvas(name) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = 120;
    canvas.height = 40;
    context.clearRect(0, 0, canvas.width, canvas.height);

    drawRoundedRect(context, canvas.width, canvas.height);
    drawLabelText(context, name, canvas.width, canvas.height);

    return canvas;
  }

  function drawRoundedRect(context, width, height) {
    const cornerRadius = 10;
    const padding = 8;

    context.fillStyle = 'rgba(0, 0, 0, 0.6)';
    context.beginPath();
    context.moveTo(cornerRadius + padding, padding);
    context.lineTo(width - cornerRadius - padding, padding);
    context.quadraticCurveTo(width - padding, padding, width - padding, cornerRadius + padding);
    context.lineTo(width - padding, height - cornerRadius - padding);
    context.quadraticCurveTo(width - padding, height - padding, width - cornerRadius - padding, height - padding);
    context.lineTo(cornerRadius + padding, height - padding);
    context.quadraticCurveTo(padding, height - padding, padding, height - cornerRadius - padding);
    context.lineTo(padding, cornerRadius + padding);
    context.quadraticCurveTo(padding, padding, cornerRadius + padding, padding);
    context.closePath();
    context.fill();
  }

  function drawLabelText(context, name, width, height) {
    context.fillStyle = '#ffffff';
    context.font = 'bold 14px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(name || 'Guest', width / 2, height / 2);
  }

  function createLabelSprite(texture, canvas) {
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    const aspectRatio = canvas.width / canvas.height;
    const height = 0.5;
    const width = height * aspectRatio;

    sprite.scale.set(width, height, 1);

    return sprite;
  }

  // ============================================================================
  // LANTERN SPAWNING (attach story/user data and expose spawnLanternOnStage)
  // ============================================================================

  function spawnFromData(data) {
    if (!scene) {
      console.warn('⚠️ Scene not ready');
      return;
    }

    const texUrls = data.faces || [data.imageDataUrl];
    if (!isValidTextureData(texUrls)) {
      console.error('❌ Invalid texture URLs in data:', data);
      return;
    }

    // Check if we can spawn immediately
    if (lanterns.size < window.LANTERN_CONFIG.maxLanterns) {
      loadTexturesAndSpawn(texUrls, data);
    } else {
      // Add to queue if limit reached
      lanternQueue.push({ texUrls, data });
      console.log(`🔄 Lantern queued. Queue size: ${lanternQueue.length}`);
    }
  }

  function isSceneReady() {
    return scene && lanterns.size < window.LANTERN_CONFIG.maxLanterns;
  }

  function processQueue() {
    // Try to spawn queued lanterns if space is available
    while (lanternQueue.length > 0 && lanterns.size < window.LANTERN_CONFIG.maxLanterns) {
      const queued = lanternQueue.shift();
      console.log(`✨ Spawning queued lantern. Remaining in queue: ${lanternQueue.length}`);
      loadTexturesAndSpawn(queued.texUrls, queued.data);
    }
  }

  function isValidTextureData(texUrls) {
    return texUrls && texUrls[0];
  }

  function loadTexturesAndSpawn(texUrls, data) {
    const loader = new THREE.TextureLoader();
    const texturePromises = texUrls.map(url => loadSingleTexture(loader, url));

    Promise.all(texturePromises).then(textures => {
      const mesh = createLanternMesh(textures, data.bgColor, data.shape);

      // Attach bilingual story (preferred) and fallback single message
      // so clicking the lantern can instantly show either language.
      mesh.userData.customMessageBilingual = data.customMessageBilingual || (data.customMessage ? { en: data.customMessage, zh: null } : null);
      // keep legacy single-field for older code paths
      mesh.userData.customMessage = mesh.userData.customMessageBilingual ? mesh.userData.customMessageBilingual.en : (data.customMessage || null);

      mesh.userData.author = data.name || null;
      initializeLanternTransform(mesh);
      addNameLabelIfPresent(mesh, data.name);
      addLanternToScene(mesh);
    });
  }

  function loadSingleTexture(loader, url) {
    return new Promise(resolve => {
      loader.load(
        url,
        resolve,
        undefined,
        () => {
          console.warn('⚠️ Texture failed to load, using blank texture:', url);
          resolve(new THREE.Texture());
        }
      );
    });
  }

  function initializeLanternTransform(mesh) {
    const { x, y } = window.LANTERN_CONFIG.spawnRange;
    const { y: ySpeed, rot: rotSpeed } = window.LANTERN_CONFIG.speedRange;

    mesh.position.set(
      x[0] + Math.random() * (x[1] - x[0]),
      y[0],
      (Math.random() - 0.5) * 2
    );

    mesh.userData.vy = ySpeed[0] + Math.random() * (ySpeed[1] - ySpeed[0]);
    mesh.userData.vr = rotSpeed[0] + Math.random() * (rotSpeed[1] - rotSpeed[0]);
    mesh.userData.spawnCount = 0;
  }

  function addNameLabelIfPresent(mesh, name) {
    if (name) {
      const nameLabel = createNameLabel(name);
      nameLabel.position.set(0, LABEL_OFFSET_Y, 0);
      mesh.add(nameLabel);
      mesh.userData.nameLabel = nameLabel;
    }
  }

  function addLanternToScene(mesh) {
    scene.add(mesh);
    lanterns.add(mesh);
  }

  // ============================================================================
  // RAYCAST / INTERACTION HANDLERS
  // ============================================================================

  function onPointerMove(e) {
    if (!renderer || !camera) return;
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(Array.from(lanterns), true);
    if (intersects.length > 0) {
      const mesh = getParentLanternMesh(intersects[0].object);
      if (hoveredMesh !== mesh) {
        clearHover();
        applyHover(mesh);
        hoveredMesh = mesh;
      }
    } else {
      clearHover();
      hoveredMesh = null;
    }
  }

  function onPointerClick(e) {
    if (!hoveredMesh) return;
    const author = hoveredMesh.userData.author;
    // Prefer bilingual payload if present
    const bilingual = hoveredMesh.userData.customMessageBilingual || null;
    const single = hoveredMesh.userData.customMessage || (bilingual ? bilingual.en : null);

    // If host exposes a global overlay handler, delegate to it so host handles
    // bilingual toggling and UI consistency. Otherwise fall back to local overlay.
    if (typeof window.showLanternStory === 'function') {
      window.showLanternStory(bilingual || single, author);
    } else if (single) {
      showStoryOverlay(single, author);
    }
  }

  function getParentLanternMesh(obj) {
    // if clicked a label sprite or child, walk up to mesh root
    while (obj && !(obj.isMesh && obj.geometry && obj.userData !== undefined)) {
      obj = obj.parent;
    }
    return obj;
  }

  function applyHover(mesh) {
    if (!mesh) return;
    // subtle scale up highlight
    mesh.scale.set(1.08, 1.08, 1.08);
  }

  function clearHover() {
    // reset any hovered mesh scales
    lanterns.forEach(l => {
      if (l.scale && (l.scale.x !== 1 || l.scale.y !== 1 || l.scale.z !== 1)) {
        l.scale.set(1,1,1);
      }
    });
  }

  // Story overlay creation/removal
  function showStoryOverlay(text, author) {
    // remove existing
    if (storyOverlay && storyOverlay.parentNode) storyOverlay.remove();
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.left = '50%';
    overlay.style.top = '12%';
    overlay.style.transform = 'translateX(-50%)';
    overlay.style.background = 'rgba(0,0,0,0.8)';
    overlay.style.color = '#fff';
    overlay.style.padding = '14px 18px';
    overlay.style.borderRadius = '10px';
    overlay.style.zIndex = 99999;
    overlay.style.maxWidth = '70%';
    overlay.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)';
    overlay.style.fontSize = '14px';
    overlay.style.lineHeight = '1.5';
    overlay.innerHTML = `<strong>${author || 'Someone'}'s story: </strong><div style="margin-top:8px;">${escapeHtml(text)}</div>`;
    document.body.appendChild(overlay);
    storyOverlay = overlay;

    // auto-hide after 8s
    setTimeout(() => {
      if (overlay && overlay.parentNode) {
        overlay.style.transition = 'opacity 0.5s';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 500);
      }
    }, 8000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ============================================================================
  // ANIMATION & UPDATE (unchanged)
  // ============================================================================

  function animate(time) {
    requestAnimationFrame(animate);

    const delta = calculateDelta(time);
    updateAllLanterns(delta);
    renderer.render(scene, camera);
  }

  function calculateDelta(time) {
    const delta = lastTime ? (time - lastTime) / 16.7 : 1;
    lastTime = time;
    return delta;
  }

  function updateAllLanterns(delta) {
    lanterns.forEach(lantern => updateSingleLantern(lantern, delta));
  }

  function updateSingleLantern(lantern, delta) {
    updateLanternPosition(lantern, delta);
    updateLanternRotation(lantern, delta);
    updateFireLight(lantern, delta);
    handleLanternRespawn(lantern);
  }

  function updateLanternPosition(lantern, delta) {
    lantern.position.y += lantern.userData.vy * delta;
  }

  function updateLanternRotation(lantern, delta) {
    lantern.rotation.y += lantern.userData.vr * delta;
  }

  function updateFireLight(lantern, delta) {
    if (!lantern.userData.fireLight) return;

    const config = window.LANTERN_CONFIG;

    // Enhanced realistic fire flickering with multiple frequencies
    lantern.userData.lightPhase += 0.08 * delta;
    lantern.userData.lightPhase2 += 0.12 * delta;

    const flicker1 = Math.sin(lantern.userData.lightPhase) * 0.4;
    const flicker2 = Math.sin(lantern.userData.lightPhase * 2.3) * 0.3;
    const flicker3 = Math.sin(lantern.userData.lightPhase2 * 1.7) * 0.2;
    const randomFlicker = (Math.random() - 0.5) * 0.15; // Add slight randomness

    lantern.userData.fireLight.intensity = config.fireIntensity + flicker1 + flicker2 + flicker3 + randomFlicker;
  }

  function handleLanternRespawn(lantern) {
    const { y } = window.LANTERN_CONFIG.spawnRange;

    if (lantern.position.y <= y[1]) return;

    const { respawnCount } = window.LANTERN_CONFIG;
    // respawnCount 0 = no respawns; infinite respawns not supported yet
    // respawnCount > 0 = respawn that many times
    const shouldRespawn = lantern.userData.spawnCount < respawnCount;

    if (shouldRespawn) {
      respawnLantern(lantern);
    } else {
      removeLantern(lantern);
    }
  }

  function respawnLantern(lantern) {
    const { x, y } = window.LANTERN_CONFIG.spawnRange;
    lantern.position.set(
      x[0] + Math.random() * (x[1] - x[0]),
      y[0],
      (Math.random() - 0.5) * 2
    );
    lantern.userData.spawnCount++;
  }

  function removeLantern(lantern) {
    scene.remove(lantern);
    lanterns.delete(lantern);
    disposeLanternResources(lantern);

    // Process queue when a lantern is removed
    processQueue();
  }

  function disposeLanternResources(lantern) {
    if (lantern.geometry) {
      lantern.geometry.dispose();
    }

    if (Array.isArray(lantern.material)) {
      lantern.material.forEach(m => m.dispose());
    } else if (lantern.material) {
      lantern.material.dispose();
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  window.spawnLanternOnStage = spawnFromData;
  window.initLanternStage = init;
})();
