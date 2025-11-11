(function () {
  const socket = io();
  const status = document.getElementById('status');
  const colorInput = document.getElementById('color');
  const clearBtn = document.getElementById('clear');
  const submitBtn = document.getElementById('submit');
  const shapeSelect = document.getElementById('shape');
  // small helper to set multiple inline styles
  function setStyles(el, styles) {
    for (const k in styles) el.style[k] = styles[k];
  }

  const faceCanvases = Array.from(document.querySelectorAll('.face-canvas'));
  const cylinderCanvas = document.getElementById('cylinderCanvas');
  const cubeFacesWrap = document.getElementById('cubeFaces');
  const cylinderWrap = document.getElementById('cylinderFace');

  // initialize canvases with white background
  const faceCtxs = faceCanvases.map(c => {
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#F5DEB3';
    ctx.fillRect(0,0,c.width,c.height);
    return ctx;
  });
  const cylCtx = cylinderCanvas.getContext('2d');
  cylCtx.fillStyle = '#F5DEB3';
  cylCtx.fillRect(0,0,cylinderCanvas.width,cylinderCanvas.height);

  let activeCtx = faceCtxs[0];
  let drawing = false;

  function setActiveFace(index) {
    activeCtx = faceCtxs[index];
    // highlight UI maybe
  }

  // pointer events for each face canvas
  faceCanvases.forEach((c, idx) => {
    c.addEventListener('pointerdown', (e) => { drawing = true; drawOn(e, c); setActiveFace(idx); });
    c.addEventListener('pointermove', (e) => { if (drawing) drawOn(e, c); });
    c.addEventListener('pointerup', () => drawing = false);
    c.addEventListener('pointerleave', () => drawing = false);
  });
  // cylinder
  cylinderCanvas.addEventListener('pointerdown', (e) => { drawing = true; drawOn(e, cylinderCanvas); activeCtx = cylCtx; });
  cylinderCanvas.addEventListener('pointermove', (e) => { if (drawing) drawOn(e, cylinderCanvas); });
  cylinderCanvas.addEventListener('pointerup', () => drawing = false);
  cylinderCanvas.addEventListener('pointerleave', () => drawing = false);

  function drawOn(e, canvasEl) {
    const rect = canvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvasEl === cylinderCanvas ? cylCtx : canvasEl.getContext('2d');
    ctx.fillStyle = colorInput.value;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI*2);
    ctx.fill();
  }

  clearBtn.addEventListener('click', () => {
    faceCanvases.forEach((c, i) => {
      faceCtxs[i].fillStyle = '#F5DEB3';  // Match initial background color
      faceCtxs[i].fillRect(0,0,c.width,c.height);
    });
    cylCtx.fillStyle = '#F5DEB3';  // Match initial background color
    cylCtx.fillRect(0,0,cylinderCanvas.width,cylinderCanvas.height);
  });

  shapeSelect.addEventListener('change', () => {
    const s = shapeSelect.value;
    if (s === 'cube') {
      cubeFacesWrap.style.display = 'block';
      cylinderWrap.style.display = 'none';
    } else {
      cubeFacesWrap.style.display = 'none';
      cylinderWrap.style.display = 'block';
    }
  });

  // parse pin from url path /join/:pin or query ?pin=
  function getPin() {
    const m = location.pathname.match(/\/join\/(\d{4})/);
    if (m) return m[1];
    const qp = new URLSearchParams(location.search).get('pin');
    return qp;
  }

  const pin = getPin();
  if (!pin) {
    status.textContent = 'No PIN provided in URL.';
  } else {
    status.textContent = `Joining room ${pin}...`;
    socket.emit('join-room', { pin, name: 'Phone' });
    status.textContent = `Joined ${pin}. Draw your lantern and submit.`;
  }

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

      const msg = document.createElement('div');
      msg.textContent = 'Preparing preview...';
      setStyles(msg, {
        color: '#fff', fontFamily: 'sans-serif', fontSize: '16px', position: 'absolute',
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', transition: 'opacity 0.3s'
      });
      container.appendChild(msg);

      if (shape === 'cube') {
  const scene = document.createElement('div');
  setStyles(scene, { width: '100%', height: '100%', position: 'relative', transformStyle: 'preserve-3d', transition: 'transform 1.5s ease-in-out' });
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
          msg.style.opacity = '0';

          // Set front-down orthogonal perspective (user-preferred view)
          // keep scene transform steady while folding
          scene.style.transform = 'translateZ(-160px) rotateX(-40deg) rotateY(-40deg)';

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
            // animate overlay upward and fade
            scene.style.transition = 'transform 1.7s ease-in';
            scene.style.transform = 'translateY(-200%) rotateX(-30deg) rotateY(-30deg)';
            // cleanup after transition
            setTimeout(() => {
              if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
              resolve();
            }, 2200);
          }, floatDelay);

        }, 100);

      } else {
        // Simple fade out for cylinder
        setTimeout(() => {
          msg.style.opacity = '0';
          setTimeout(() => {
            overlay.remove();
            resolve();
          }, 500);
        }, 500);
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
      sampleFace: faces[0]?.substring(0, 50),
      totalSize: JSON.stringify({ pin, shape, faces }).length
    });

    // Send the data
    socket.emit('submit-lantern', { pin, shape, faces });
    status.textContent = 'Lantern submitted — it should appear on the host screen soon.';
  });
})();
