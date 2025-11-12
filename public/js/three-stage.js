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
    spawnRange: { x: [-6, 6], y: [-10, 15] },
    speedRange: { y: [0.02, 0.04], rot: [0.01, 0.02] },
    size: { width: 1, height: 1 },
    maxLanterns: 500
  };

  const SHADOW_COLOR = 0x5a5a5a;
  const SHADOW_EMISSIVE = 0x4a4a4a;
  const FIRE_COLOR = 0xff6b1a;
  const LABEL_OFFSET_Y = -1;

  // ============================================================================
  // STATE
  // ============================================================================

  let scene, camera, renderer;
  const lanterns = new Set();
  let lastTime = 0;

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

    animate();
  }

  function setupRenderer(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.sortObjects = true; // Enable sorting for proper transparency rendering
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
    return new THREE.MeshPhongMaterial({
      map: texture,
      transparent: false,
      opacity: 0.95,
      shininess: 30,
      emissive: FIRE_COLOR,
      emissiveIntensity: 0.5,
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

  function createLanternMesh(textures, bgColor) {
    const { width, height } = window.LANTERN_CONFIG.size;
    const geometry = new THREE.BoxGeometry(width, height, width);
    const materials = createLanternMaterials(textures);
    const mesh = new THREE.Mesh(geometry, materials);

    addFireLight(mesh);

    return mesh;
  }

  function addFireLight(mesh) {
    const fireLight = new THREE.PointLight(FIRE_COLOR, 2, 3);
    fireLight.position.set(0, 0, 0);
    mesh.add(fireLight);

    mesh.userData.fireLight = fireLight;
    mesh.userData.lightPhase = Math.random() * Math.PI * 2;
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
  // LANTERN SPAWNING
  // ============================================================================

  function spawnFromData(data) {
    if (!isSceneReady()) {
      console.warn('⚠️ Scene not ready or lantern limit reached');
      return;
    }

    const texUrls = data.faces || [data.imageDataUrl];
    if (!isValidTextureData(texUrls)) {
      console.error('❌ Invalid texture URLs in data:', data);
      return;
    }

    loadTexturesAndSpawn(texUrls, data);
  }

  function isSceneReady() {
    return scene && lanterns.size < window.LANTERN_CONFIG.maxLanterns;
  }

  function isValidTextureData(texUrls) {
    return texUrls && texUrls[0];
  }

  function loadTexturesAndSpawn(texUrls, data) {
    const loader = new THREE.TextureLoader();
    const texturePromises = texUrls.map(url => loadSingleTexture(loader, url));

    Promise.all(texturePromises).then(textures => {
      const mesh = createLanternMesh(textures, data.bgColor);
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
  // ANIMATION & UPDATE
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

    lantern.userData.lightPhase += 0.05 * delta;
    const flicker =
      Math.sin(lantern.userData.lightPhase) * 0.3 +
      Math.sin(lantern.userData.lightPhase * 2.3) * 0.2;
    lantern.userData.fireLight.intensity = 2 + flicker;
  }

  function handleLanternRespawn(lantern) {
    const { y } = window.LANTERN_CONFIG.spawnRange;

    if (lantern.position.y <= y[1]) return;

    const { respawnCount } = window.LANTERN_CONFIG;
    const shouldRespawn = respawnCount === 0 || lantern.userData.spawnCount < respawnCount;

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
