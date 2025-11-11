// Simplified three.js stage for floating lanterns with configurable respawns
(() => {
  console.log('Three-stage.js loaded. THREE:', typeof THREE);

  if (typeof THREE === 'undefined') {
    console.error('❌ THREE.js not found. Please ensure it is loaded before this script.');
    return;
  }

  window.LANTERN_CONFIG = {
    respawnCount: 3,
    spawnRange: { x: [-6, 6], y: [-10, 15] },
    speedRange: { y: [0.02, 0.04], rot: [0.01, 0.02] },
    size: { width: 1, height: 1.4 },
    maxLanterns: 500
  };

  let scene, camera, renderer;
  const lanterns = new Set();
  let lastTime = 0;

  function init() {
    const canvas = document.getElementById('threeStage');
    if (!canvas) {
      console.error('❌ Canvas element with id="threeStage" not found.');
      return;
    }

    function resizeCanvas() {
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

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(75, canvas.width / canvas.height, 0.1, 1000);
    camera.position.z = 8;

    const light = new THREE.DirectionalLight(0xffd7a8, 1.2);
    light.position.set(1, 2, 2);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    animate();
  }

  function createLanternMesh(textures) {
    const { width, height } = window.LANTERN_CONFIG.size;
    const geometry = new THREE.BoxGeometry(width, height, width);

    // BoxGeometry faces order: [right, left, top, bottom, front, back]
    // We have 4 face textures for cube sides: [front, right, back, left]
    // Map them correctly and add simple materials for top/bottom
    const baseMaterial = new THREE.MeshPhongMaterial({
      color: 0xffd7a8,
      transparent: true,
      opacity: 0.9,
      shininess: 30,
      emissive: 0xff6b1a,
      emissiveIntensity: 0.6
    });

    const materials = [
      // Right face (index 0) - use texture[1]
      textures[1] ? new THREE.MeshPhongMaterial({
        map: textures[1],
        transparent: true,
        opacity: 0.95,
        shininess: 30,
        emissive: 0xff6b1a,
        emissiveIntensity: 0.5
      }) : baseMaterial.clone(),
      // Left face (index 1) - use texture[3]
      textures[3] ? new THREE.MeshPhongMaterial({
        map: textures[3],
        transparent: true,
        opacity: 0.95,
        shininess: 30,
        emissive: 0xff6b1a,
        emissiveIntensity: 0.5
      }) : baseMaterial.clone(),
      // Top face (index 2) - plain color
      baseMaterial.clone(),
      // Bottom face (index 3) - plain color
      baseMaterial.clone(),
      // Front face (index 4) - use texture[0]
      textures[0] ? new THREE.MeshPhongMaterial({
        map: textures[0],
        transparent: true,
        opacity: 0.95,
        shininess: 30,
        emissive: 0xff6b1a,
        emissiveIntensity: 0.5
      }) : baseMaterial.clone(),
      // Back face (index 5) - use texture[2]
      textures[2] ? new THREE.MeshPhongMaterial({
        map: textures[2],
        transparent: true,
        opacity: 0.95,
        shininess: 30,
        emissive: 0xff6b1a,
        emissiveIntensity: 0.5
      }) : baseMaterial.clone()
    ];

    const mesh = new THREE.Mesh(geometry, materials);

    // Add internal fire light - warm orange glow
    const fireLight = new THREE.PointLight(0xff6b1a, 2, 3);
    fireLight.position.set(0, 0, 0);
    mesh.add(fireLight);

    // Store light reference for animation
    mesh.userData.fireLight = fireLight;
    mesh.userData.lightPhase = Math.random() * Math.PI * 2;

    return mesh;
  }

  function spawnFromData(data) {
    if (!scene || lanterns.size >= window.LANTERN_CONFIG.maxLanterns) {
      console.warn('⚠️ Scene not ready or lantern limit reached');
      return;
    }

    const texUrls = data.faces || [data.imageDataUrl];
    if (!texUrls || !texUrls[0]) {
      console.error('❌ Invalid texture URLs in data:', data);
      return;
    }

    const loader = new THREE.TextureLoader();

    Promise.all(
      texUrls.map(
        url =>
          new Promise(resolve => {
            loader.load(
              url,
              resolve,
              undefined,
              () => {
                console.warn('⚠️ Texture failed to load, using blank texture:', url);
                const fallback = new THREE.Texture();
                resolve(fallback);
              }
            );
          })
      )
    ).then(textures => {
      const mesh = createLanternMesh(textures);
      const { x, y } = window.LANTERN_CONFIG.spawnRange;
      mesh.position.set(x[0] + Math.random() * (x[1] - x[0]), y[0], (Math.random() - 0.5) * 2);

      const { y: ySpeed, rot: rotSpeed } = window.LANTERN_CONFIG.speedRange;
      mesh.userData = {
        vy: ySpeed[0] + Math.random() * (ySpeed[1] - ySpeed[0]),
        vr: rotSpeed[0] + Math.random() * (rotSpeed[1] - rotSpeed[0]),
        spawnCount: 0
      };

      scene.add(mesh);
      lanterns.add(mesh);
    });
  }

  function animate(time) {
    requestAnimationFrame(animate);

    const delta = lastTime ? (time - lastTime) / 16.7 : 1;
    lastTime = time;

    lanterns.forEach(lantern => {
      lantern.position.y += lantern.userData.vy * delta;
      lantern.rotation.y += lantern.userData.vr * delta;

      // Animate fire light - flickering effect
      if (lantern.userData.fireLight) {
        lantern.userData.lightPhase += 0.05 * delta;
        const flicker = Math.sin(lantern.userData.lightPhase) * 0.3 + Math.sin(lantern.userData.lightPhase * 2.3) * 0.2;
        lantern.userData.fireLight.intensity = 2 + flicker;
      }

      if (lantern.position.y > window.LANTERN_CONFIG.spawnRange.y[1]) {
        const { respawnCount } = window.LANTERN_CONFIG;

        if (respawnCount === 0 || lantern.userData.spawnCount < respawnCount) {
          const { x, y } = window.LANTERN_CONFIG.spawnRange;
          lantern.position.set(x[0] + Math.random() * (x[1] - x[0]), y[0], (Math.random() - 0.5) * 2);
          lantern.userData.spawnCount++;
        } else {
          scene.remove(lantern);
          lanterns.delete(lantern);

          if (lantern.geometry) lantern.geometry.dispose();
          if (Array.isArray(lantern.material)) {
            lantern.material.forEach(m => m.dispose());
          } else if (lantern.material) {
            lantern.material.dispose();
          }
        }
      }
    });

    renderer.render(scene, camera);
  }

  window.spawnLanternOnStage = spawnFromData;
  window.initLanternStage = init;
})();
