(function () {
  const socket = io();
  
  // Add event listener to play background music on first click
  document.addEventListener('click', () => {
    if (window.LanternAudio) {
      window.LanternAudio.playBackgroundMusic();
    }
  }, { once: true });
  const status = document.getElementById('status');
  const colorInput = document.getElementById('color');
  const bgColorInput = document.getElementById('bgColor');
  const clearBtn = document.getElementById('clear');
  const submitBtn = document.getElementById('submit');
  const shapeSelect = document.getElementById('shape');
  const faceLabel = document.getElementById('faceLabel');
  const prevBtn = document.getElementById('prevFace');
  const nextBtn = document.getElementById('nextFace');


  // Message panel elements
  const messageInput = document.getElementById('messageInput');
  const generateStoryBtn = document.getElementById('generateStory');
  const toggleNarrateBtn = document.getElementById('toggleNarrate');
  const storyPreview = document.getElementById('storyPreview');
  const storyPreviewText = document.getElementById('storyPreviewText');

  // State for auto-narrate
  let autoNarrate = true;

  // small helper to set multiple inline styles
  function setStyles(el, styles) {
    for (const k in styles) el.style[k] = styles[k];
  }

  // Helper to draw wood frame border
  function drawWoodFrame(ctx, width, height, isCylinder = false) {
    const borderWidth = 12;
    const woodColor = '#8B4513'; // Saddle brown wood color

    ctx.strokeStyle = woodColor;
    ctx.lineWidth = borderWidth;

    if (isCylinder) {
      // For cylinder: only draw top and bottom borders
      ctx.beginPath();
      ctx.moveTo(0, borderWidth / 2);
      ctx.lineTo(width, borderWidth / 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, height - borderWidth / 2);
      ctx.lineTo(width, height - borderWidth / 2);
      ctx.stroke();
    } else {
      // For cube: draw full rectangle
      ctx.strokeRect(borderWidth / 2, borderWidth / 2, width - borderWidth, height - borderWidth);
    }
  }

  const faceCanvases = Array.from(document.querySelectorAll('.face-canvas'));
  const cylinderCanvas = document.getElementById('cylinderCanvas');
  const cubeFacesWrap = document.getElementById('cubeFaces');
  const cylinderWrap = document.getElementById('cylinderFace');
  const dots = Array.from(document.querySelectorAll('.dot'));
  // Audio controls
  const toggleMusicBtn = document.getElementById('toggleMusicMobile');

  let currentFaceIndex = 0;
  let currentBgColor = bgColorInput.value; // Track current background color

  // Default wheat color - always reset to this on page refresh
  const DEFAULT_BG_COLOR = '#F5DEB3';

  // Track background color for each face (always start with default)
  const faceBgColors = [DEFAULT_BG_COLOR, DEFAULT_BG_COLOR, DEFAULT_BG_COLOR, DEFAULT_BG_COLOR];
  let cylinderBgColor = DEFAULT_BG_COLOR;

  // Restore saved shape selection from sessionStorage
  const savedShape = sessionStorage.getItem('lantern_shape');
  if (savedShape && (savedShape === 'cube' || savedShape === 'cylinder')) {
    shapeSelect.value = savedShape;
  }

  // Initialize the correct canvas based on saved or default shape
  function initializeShapeDisplay() {
    const shape = shapeSelect.value;
    if (shape === 'cube') {
      cubeFacesWrap.style.display = 'block';
      cylinderWrap.style.display = 'none';
      bgColorInput.value = faceBgColors[currentFaceIndex];
    } else {
      cubeFacesWrap.style.display = 'none';
      cylinderWrap.style.display = 'block';
      bgColorInput.value = cylinderBgColor;
    }
  }

  // Call initialization
  initializeShapeDisplay();

  // initialize canvases with default background color
  const faceCtxs = faceCanvases.map(c => {
    const ctx = c.getContext('2d');
    ctx.fillStyle = DEFAULT_BG_COLOR;
    ctx.fillRect(0,0,c.width,c.height);
    // Add wood frame border
    drawWoodFrame(ctx, c.width, c.height);
    return ctx;
  });
  const cylCtx = cylinderCanvas.getContext('2d');
  cylCtx.fillStyle = DEFAULT_BG_COLOR;
  cylCtx.fillRect(0,0,cylinderCanvas.width,cylinderCanvas.height);
  // Add wood frame border (cylinder mode)
  drawWoodFrame(cylCtx, cylinderCanvas.width, cylinderCanvas.height, true);

  let activeCtx = faceCtxs[0];
  let drawing = false;
  let lastX = 0;
  let lastY = 0;

  // Gallery navigation
  function showFace(index) {
    faceCanvases.forEach((c, i) => {
      c.style.display = i === index ? 'block' : 'none';
    });
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === index);
    });
    currentFaceIndex = index;
    activeCtx = faceCtxs[index];
    faceLabel.textContent = `Face ${index + 1}`;

    // Update color picker to match this face's background color
    bgColorInput.value = faceBgColors[index];
  }

  prevBtn.addEventListener('click', () => {
    const newIndex = (currentFaceIndex - 1 + 4) % 4;
    showFace(newIndex);
  });

  nextBtn.addEventListener('click', () => {
    const newIndex = (currentFaceIndex + 1) % 4;
    showFace(newIndex);
  });

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      showFace(index);
    });
  });

  function setActiveFace(index) {
    activeCtx = faceCtxs[index];
  }

  // Get coordinates from event (mouse or touch)
  function getCoords(e, canvasEl) {
    const rect = canvasEl.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvasEl.width / rect.width),
      y: (clientY - rect.top) * (canvasEl.height / rect.height)
    };
  }

  function startDrawing(e, canvasEl) {
    e.preventDefault();
    drawing = true;
    const coords = getCoords(e, canvasEl);
    lastX = coords.x;
    lastY = coords.y;
    const ctx = canvasEl === cylinderCanvas ? cylCtx : canvasEl.getContext('2d');
    ctx.fillStyle = colorInput.value;
    ctx.beginPath();
    ctx.arc(coords.x, coords.y, 6, 0, Math.PI*2);
    ctx.fill();
  }

  function draw(e, canvasEl) {
    if (!drawing) return;
    e.preventDefault();
    const coords = getCoords(e, canvasEl);
    const ctx = canvasEl === cylinderCanvas ? cylCtx : canvasEl.getContext('2d');

    // Draw line from last position to current
    ctx.strokeStyle = colorInput.value;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    lastX = coords.x;
    lastY = coords.y;
  }

  function stopDrawing() {
    drawing = false;
  }

  // Touch and mouse events for cube faces
  faceCanvases.forEach((c, idx) => {
    // Touch events
    c.addEventListener('touchstart', (e) => { startDrawing(e, c); setActiveFace(idx); });
    c.addEventListener('touchmove', (e) => { draw(e, c); });
    c.addEventListener('touchend', stopDrawing);
    c.addEventListener('touchcancel', stopDrawing);

    // Mouse events
    c.addEventListener('mousedown', (e) => { startDrawing(e, c); setActiveFace(idx); });
    c.addEventListener('mousemove', (e) => { draw(e, c); });
    c.addEventListener('mouseup', stopDrawing);
    c.addEventListener('mouseleave', stopDrawing);
  });

  // Touch and mouse events for cylinder
  cylinderCanvas.addEventListener('touchstart', (e) => { startDrawing(e, cylinderCanvas); activeCtx = cylCtx; });
  cylinderCanvas.addEventListener('touchmove', (e) => { draw(e, cylinderCanvas); });
  cylinderCanvas.addEventListener('touchend', stopDrawing);
  cylinderCanvas.addEventListener('touchcancel', stopDrawing);

  cylinderCanvas.addEventListener('mousedown', (e) => { startDrawing(e, cylinderCanvas); activeCtx = cylCtx; });
  cylinderCanvas.addEventListener('mousemove', (e) => { draw(e, cylinderCanvas); });
  cylinderCanvas.addEventListener('mouseup', stopDrawing);
  cylinderCanvas.addEventListener('mouseleave', stopDrawing);

  clearBtn.addEventListener('click', () => {
    if (shapeSelect.value === 'cube') {
      // Clear only the currently active face
      const activeCanvas = faceCanvases[currentFaceIndex];
      const ctx = faceCtxs[currentFaceIndex];
      ctx.fillStyle = bgColorInput.value;
      ctx.fillRect(0, 0, activeCanvas.width, activeCanvas.height);
      // Re-draw wood frame
      drawWoodFrame(ctx, activeCanvas.width, activeCanvas.height);
    } else {
      // Clear cylinder canvas
      cylCtx.fillStyle = bgColorInput.value;
      cylCtx.fillRect(0, 0, cylinderCanvas.width, cylinderCanvas.height);
      // Re-draw wood frame (cylinder mode)
      drawWoodFrame(cylCtx, cylinderCanvas.width, cylinderCanvas.height, true);
    }
  });

  // Update background color for all canvases when changed
  bgColorInput.addEventListener('change', () => {
    const newBgColor = bgColorInput.value;
    if (shapeSelect.value === 'cube') {
      // Only update the currently active face canvas
      const activeCanvas = faceCanvases[currentFaceIndex];
      const ctx = faceCtxs[currentFaceIndex];
      ctx.fillStyle = newBgColor;
      ctx.fillRect(0, 0, activeCanvas.width, activeCanvas.height);
      // Re-draw wood frame
      drawWoodFrame(ctx, activeCanvas.width, activeCanvas.height);

      // Remember this face's background color
      faceBgColors[currentFaceIndex] = newBgColor;
    } else {
      // Update cylinder canvas
      cylCtx.fillStyle = newBgColor;
      cylCtx.fillRect(0, 0, cylinderCanvas.width, cylinderCanvas.height);
      // Re-draw wood frame (cylinder mode)
      drawWoodFrame(cylCtx, cylinderCanvas.width, cylinderCanvas.height, true);

      // Remember cylinder's background color
      cylinderBgColor = newBgColor;
    }
  });

  shapeSelect.addEventListener('change', () => {
    const s = shapeSelect.value;
    // Save shape selection to sessionStorage
    sessionStorage.setItem('lantern_shape', s);

    if (s === 'cube') {
      cubeFacesWrap.style.display = 'block';
      cylinderWrap.style.display = 'none';
      // Update color picker to current face's color
      bgColorInput.value = faceBgColors[currentFaceIndex];
    } else {
      cubeFacesWrap.style.display = 'none';
      cylinderWrap.style.display = 'block';
      // Update color picker to cylinder's color
      bgColorInput.value = cylinderBgColor;
    }
  });

  // parse pin from url path /join/:pin or query ?pin=
  function getPin() {
    const m = location.pathname.match(/\/join\/(\d{4})/);
    if (m) return m[1];
    const qp = new URLSearchParams(location.search).get('pin');
    return qp;
  }

  // Get name from query string or sessionStorage
  function getName() {
    const qp = new URLSearchParams(location.search).get('name');
    if (qp) return qp;
    return sessionStorage.getItem('lantern_name') || 'Guest';
  }

  const pin = getPin();
  const playerName = getName();

  if (!pin) {
    status.textContent = 'No PIN provided in URL.';
  } else {
    status.textContent = `Joining room ${pin}...`;
    socket.emit('join-room', { pin, name: playerName });
    status.textContent = `Joined ${pin}. Draw your lantern and submit.`;
  }

  // Handle join failure - redirect back to join page with error
  socket.on('join-failed', (data) => {
    console.error('Join failed:', data.message);

    // Clear session storage
    sessionStorage.removeItem('lantern_pin');
    sessionStorage.removeItem('lantern_name');

    // Store error message and redirect to join page
    sessionStorage.setItem('join_error', data.message || 'Failed to join room.');
    window.location.href = '/join';
  });

  // Handle successful join
  socket.on('join-success', () => {
    status.textContent = `Joined ${pin}. Draw your lantern and submit.`;
  });

  // Handle being kicked by host: store message and redirect to join page
  socket.on('kicked', (data) => {
    console.warn('Kicked from room:', data && data.reason);
    try {
      sessionStorage.setItem('join_error', data && data.reason ? data.reason : 'You were removed from the room by the host.');
    } catch (e) { /* ignore storage errors */ }
    // Redirect to join landing so user can re-enter or create a new session
    window.location.href = '/join';
  });

  // folding preview using CSS 3D transforms
  function showFoldingPreview(shape, facesDataUrls) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'fold-overlay';
      setStyles(overlay, {
        position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)', zIndex: '9999'
      });
      document.body.appendChild(overlay);

      const container = document.createElement('div');
      setStyles(container, { position: 'relative', width: '320px', height: '240px', perspective: '1000px' });
      overlay.appendChild(container);

      if (shape === 'cube') {
        const scene = document.createElement('div');
        setStyles(scene, { width: '100%', height: '100%', position: 'absolute', top: '0', left: '0', transformStyle: 'preserve-3d', transition: 'transform 1.5s ease-in-out', opacity: '0' });
        container.appendChild(scene);

        const size = 150; // pixels
        const centerIndex = 2; // user mapping: 0=back,1=left,2=front,3=right -> center on front (index 2)

        // Create a strip container for the connected faces and center on the front face
        const strip = document.createElement('div');
        setStyles(strip, {
          position: 'absolute', left: '50%', top: '50%', width: (size * 4) + 'px', height: size + 'px', transformStyle: 'preserve-3d',
          transform: `translate(-50%, -50%) translateX(${-(centerIndex - 1.5) * size}px)`
        });
        scene.appendChild(strip);

        // We'll create normal containers for indices 0 and 1, and a paired container for indices 2+3
        const faces = [];

        // helper to create a face container
        function makeFaceContainer(url, leftPx) {
          const fc = document.createElement('div');
          setStyles(fc, { position: 'absolute', left: leftPx + 'px', width: size + 'px', height: '100%', transformStyle: 'preserve-3d', transition: 'transform 1s ease-in-out' });
          const f = document.createElement('div');
            setStyles(f, { position: 'absolute', width: '100%', height: '100%', backgroundImage: `url(${url})`, backgroundSize: 'cover', backfaceVisibility: 'visible', transform: 'translateZ(1px)', opacity: '0.98' });
          fc.appendChild(f);
          return fc;
        }

        // index 0 (back)
        faces[0] = makeFaceContainer(facesDataUrls[0], 0 * size);
        // index 1 (left)
        faces[1] = makeFaceContainer(facesDataUrls[1], 1 * size);
  strip.appendChild(faces[0]);
  strip.appendChild(faces[1]);

  // Restore/ensure correct defaults for back (faces[0]) and left (faces[1])
  faces[0].style.transformOrigin = 'center center';
  faces[0].style.transition = 'transform 1s ease-in-out';

  // faces[1] is the left face - hinge on its right edge and start unrotated
  faces[1].style.transformOrigin = 'right center';
  faces[1].style.transform = 'rotateY(0deg)';
  faces[1].style.transition = 'transform 1s ease-in-out';

        // Create paired container for front (2) + right (3)
  const pair = document.createElement('div');
  setStyles(pair, { position: 'absolute', left: (2 * size) + 'px', width: (size * 2) + 'px', height: size + 'px', transformStyle: 'preserve-3d', transformOrigin: `${size}px center`, transition: 'transform 1s ease-in-out' });

        // front inside pair
  const frontContainer = document.createElement('div');
  setStyles(frontContainer, { position: 'absolute', left: '0px', width: size + 'px', height: '100%', transformStyle: 'preserve-3d', transformOrigin: 'right center', transition: 'transform 1s ease-in-out' });
  const frontFace = document.createElement('div');
          setStyles(frontFace, { position: 'absolute', width: '100%', height: '100%', backgroundImage: `url(${facesDataUrls[2]})`, backgroundSize: 'cover', backfaceVisibility: 'visible', transform: 'translateZ(1px)', opacity: '0.98' });
  frontContainer.appendChild(frontFace);

        // right inside pair
  const rightContainer = document.createElement('div');
  setStyles(rightContainer, { position: 'absolute', left: size + 'px', width: size + 'px', height: '100%', transformStyle: 'preserve-3d', transformOrigin: 'left center', transition: 'transform 1s ease-in-out' });
  const rightFace = document.createElement('div');
          setStyles(rightFace, { position: 'absolute', width: '100%', height: '100%', backgroundImage: `url(${facesDataUrls[3]})`, backgroundSize: 'cover', backfaceVisibility: 'visible', transform: 'translateZ(1px)', opacity: '0.98' });
  rightContainer.appendChild(rightFace);

        pair.appendChild(frontContainer);
        pair.appendChild(rightContainer);
        strip.appendChild(pair);

        // store references in faces array for ease of animation control
        faces[2] = frontContainer;
        faces[3] = rightContainer;

        // Start animation after a short delay
        setTimeout(() => {
          scene.style.opacity = '1'; // Fade in scene

          // Set front-down orthogonal perspective (user-preferred view)
          // keep scene transform steady while folding
          scene.style.transform = 'translateX(80px) translateY(80px) translateZ(-160px) rotateX(-40deg) rotateY(-40deg)';

          // PHASE 1: Fold left face (index 0 in current layout)
          faces[0].style.transformOrigin = 'right center';
          faces[0].style.transform = 'rotateY(-90deg)';

          // PHASE 1: Rotate the pair (front+right) together about their shared edge
          pair.style.transformOrigin = 'left center';
          pair.style.transform = 'rotateY(90deg)';

          // PHASE 2: After pair rotation completes, fold the right face (index 3) into final position
          setTimeout(() => {
            rightContainer.style.transition = 'transform 0.8s ease-in-out';
            rightContainer.style.transform = 'rotateY(90deg)';
          }, 500);

          // Float upward and fade the preview after a short display period
          const floatDelay = 1500;
          setTimeout(() => {
            // animate overlay upward and fade - use viewport height for consistent off-screen animation
            scene.style.transition = 'transform 1.7s ease-in';
            scene.style.transform = 'translateY(-150vh) rotateX(-25deg) rotateY(-25deg)';
            // cleanup after transition
            setTimeout(() => {
              if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
              resolve();
            }, 2200);
          }, floatDelay);

        }, 100);

      } else {
        // Cylinder rolling animation - paper curling effect
        const scene = document.createElement('div');
        setStyles(scene, {
          width: '100%', height: '100%', position: 'relative',
          transformStyle: 'preserve-3d',
          transition: 'transform 1.5s ease-in-out'
        });
        container.appendChild(scene);

        const cylinderWidth = 400;  // Increased from 280 for larger cylinder
        const cylinderHeight = 200; // Increased from 140 for larger cylinder

        // Create multiple thin vertical strips for smooth rolling
        // Optimal: 60-80 strips for smooth appearance without performance issues
        const numStrips = 60;
        const stripWidth = (cylinderWidth / numStrips) * 1.01; // Slight overlap to eliminate gaps
        const stripSpacing = cylinderWidth / numStrips; // Actual spacing between strip positions
        const radius = cylinderWidth / (2 * Math.PI);

        const wrapper = document.createElement('div');
        setStyles(wrapper, {
          position: 'absolute',
          left: '50%',
          top: '0%',
          width: cylinderWidth + 'px',
          height: cylinderHeight + 'px',
          transformStyle: 'preserve-3d',
          transform: 'translate(-50%, -50%)',
          transition: 'transform 2s ease-in-out'
        });
        scene.appendChild(wrapper);

        // Create strips that will curl into a cylinder
        for (let i = 0; i < numStrips; i++) {
          const strip = document.createElement('div');
          const xPos = i * stripSpacing; // Use spacing for positioning

          setStyles(strip, {
            position: 'absolute',
            left: '0', // All start at left edge
            top: '0',
            width: stripWidth * 1.2 + 'px', // Slightly wider for overlap
            height: cylinderHeight + 'px',
            backgroundImage: `url(${facesDataUrls[0]})`,
            backgroundSize: cylinderWidth + 'px ' + cylinderHeight + 'px',
            backgroundPosition: `-${xPos}px 0`,
            transformStyle: 'preserve-3d',
            transformOrigin: 'center center',
            transform: `translateX(${xPos}px)`, // Initially laid out flat in a line
            transition: 'transform 1.5s ease-out',
            transitionDelay: `${i * 0.005}s` // Faster stagger for more strips
          });
          wrapper.appendChild(strip);
        }

        // Start animation
        setTimeout(() => {
          // Set initial 3D perspective
          scene.style.transform = 'translateX(110px) translateZ(-160px) rotateX(-25deg) rotateY(25deg)';

          // Roll each strip into position to form a cylinder (start immediately like cube)
          const startRolling = () => {
            const strips = wrapper.children;
            const halfPoint = numStrips / 2;

            // Build cylinder by connecting strips continuously like paper
            let cumulativeX = 0;
            let cumulativeZ = 0;

            for (let i = 0; i < strips.length; i++) {
              const strip = strips[i];

              // Calculate angle for this strip
              let angle;
              if (i <= halfPoint) {
                const distanceFromCenter = halfPoint - i;
                angle = (distanceFromCenter / halfPoint) * 180;
              } else {
                const distanceFromCenter = i - halfPoint;
                angle = -(distanceFromCenter / halfPoint) * 180;
              }

              // Calculate angle change from previous strip
              const prevAngle = i === 0 ? angle :
                (i <= halfPoint ?
                  ((halfPoint - (i-1)) / halfPoint) * 180 :
                  -((i-1 - halfPoint) / halfPoint) * 180);

              const angleStep = angle - prevAngle;
              const thetaStep = (angleStep * Math.PI) / 180;

              // Add the arc displacement from previous strip
              // This ensures strips stay connected like paper
              if (i > 0) {
                cumulativeX += stripSpacing * Math.cos(prevAngle * Math.PI / 180);
                cumulativeZ += stripSpacing * Math.sin(prevAngle * Math.PI / 180);
              }

              // Transform: use cumulative position to maintain connectivity
              strip.style.transform = `translate3d(${cumulativeX}px, 0, ${cumulativeZ}px) rotateY(${-angle}deg)`;
            }

            // Simple shift and float animation
            setTimeout(() => {
              // Set smooth transition
              wrapper.style.transition = 'transform 2s ease-in-out';
              scene.style.transition = 'transform 2s ease-in-out';

              // Simple rotation to show the cylinder - adjust perspective for larger cylinder
              scene.style.transform = 'translateX(120px) translateZ(-160px) rotateX(-25deg) rotateY(35deg)'; // Moved back for better view
            }, 800);

            // Float away smoothly
            setTimeout(() => {
              scene.style.transition = 'transform 2s ease-in';
              scene.style.transform = 'translateX(120px) translateY(-150vh) rotateX(15deg) rotateY(90deg)';

              setTimeout(() => {
                if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
                resolve();
              }, 1500);
            }, 2800);
          };

          // Start rolling immediately (no extra delay)
          startRolling();
        }, 100);
      }
    });
  }

  submitBtn.addEventListener('click', async () => {
    const shape = shapeSelect.value || 'cube';
    let faces = [];
    if (shape === 'cube') {
      faces = faceCanvases.map(c => c.toDataURL('image/png'));
    } else {
      faces = [cylinderCanvas.toDataURL('image/png')];
    }
    // show folding preview
    await showFoldingPreview(shape, faces);
    
    // Play air woosh sound effect
    if (window.LanternAudio) {
      window.LanternAudio.playAirWoosh();
    }
    
    // emit submit with faces payload
    // Check faces data before sending
    if (!faces || !faces.length) {
      console.error('No face data to submit');
      status.textContent = 'Error: No lantern data to submit';
      return;
    }

    // Log submission details
    console.log('Submitting lantern:', {
      pin,
      shape,
      faceCount: faces.length,
      bgColor: bgColorInput.value,
      sampleFace: faces[0]?.substring(0, 50),
      totalSize: JSON.stringify({ pin, shape, faces, bgColor: bgColorInput.value }).length
    });

    // Send the data with background color, custom message, and auto-narrate flag
    socket.emit('submit-lantern', {
      pin,
      shape,
      faces,
      bgColor: bgColorInput.value,
      customMessage: messageInput.value,
      autoNarrate: autoNarrate
    });
    status.textContent = 'Lantern submitted — it should appear on the host screen soon.';
  });
  // Toggle auto-narrate
  toggleNarrateBtn.addEventListener('click', () => {
    autoNarrate = !autoNarrate;
    if (autoNarrate) {
      toggleNarrateBtn.textContent = '🔊 Auto-Narrate: ON';
      toggleNarrateBtn.classList.remove('narrate-disabled');
      toggleNarrateBtn.classList.add('narrate-enabled');
    } else {
      toggleNarrateBtn.textContent = '🔇 Auto-Narrate: OFF';
      toggleNarrateBtn.classList.remove('narrate-enabled');
      toggleNarrateBtn.classList.add('narrate-disabled');
    }
  });


  
  // Audio control event listeners
  if (toggleMusicBtn) {
    toggleMusicBtn.addEventListener('click', () => {
      if (window.LanternAudio) {
        const isPlaying = window.LanternAudio.toggleBackgroundMusic();
        toggleMusicBtn.textContent = isPlaying ? '🎵' : '🔇';
        toggleMusicBtn.title = isPlaying ? 'Pause Music' : 'Play Music';
      }
    });
  }
  
  // Generate AI story
  let storyBilingual = null; // store { en, zh } when generated

  // Per-submission client id to help host dedupe duplicates
  function makeClientId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  generateStoryBtn.addEventListener('click', async () => {
    const shape = shapeSelect.value || 'cube';
    let faces = [];
    if (shape === 'cube') {
      faces = faceCanvases.map(c => c.toDataURL('image/png'));
    } else {
      faces = [cylinderCanvas.toDataURL('image/png')];
    }

    if (!faces || !faces.length) {
      status.textContent = 'Error: No lantern data to analyze';
      return;
    }

    // Show loading state
    generateStoryBtn.classList.add('loading');
    generateStoryBtn.disabled = true;
    messageInput.disabled = true;
    status.textContent = 'Generating story...';

    try {
      // Emit event to server to generate bilingual story
      socket.emit('generate-story', { pin, shape, faces }, (bilingual) => {
        generateStoryBtn.classList.remove('loading');
        generateStoryBtn.disabled = false;
        messageInput.disabled = false;

        if (!bilingual) {
          status.textContent = 'Failed to generate story. Please try again.';
          return;
        }

        // Save bilingual pair and show English by default
        storyBilingual = bilingual;
        messageInput.value = bilingual.en || bilingual.zh || '';
        storyPreviewText.textContent = messageInput.value;
        storyPreview.style.display = 'block';
        status.textContent = 'Story generated! You can edit it before submitting.';
      });
    } catch (err) {
      console.error('Error generating story:', err);
      generateStoryBtn.classList.remove('loading');
      generateStoryBtn.disabled = false;
      messageInput.disabled = false;
      status.textContent = 'Error generating story. Please try again.';
    }
  });

  // Submit: include bilingual story when available
  submitBtn.addEventListener('click', async () => {
    const shape = shapeSelect.value || 'cube';
    let faces = [];
    if (shape === 'cube') {
      faces = faceCanvases.map(c => c.toDataURL('image/png'));
    } else {
      faces = [cylinderCanvas.toDataURL('image/png')];
    }

    // ...existing validation...

    const payload = {
      _cid: makeClientId(),
      pin,
      shape,
      faces,
      bgColor: bgColorInput.value,
      customMessage: messageInput.value || '',
      customMessageBilingual: storyBilingual || null,
      autoNarrate: autoNarrate
    };
    socket.emit('submit-lantern', payload);
    status.textContent = 'Lantern submitted — it should appear on the host screen soon.';
    
    // Clear cached AI pair so the next submission is fresh (not tied to previous AI)
    storyBilingual = null;
    storyPreview.style.display = 'none';
  });
})();
