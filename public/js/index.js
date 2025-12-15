import * as THREE from 'three';

// 1. SETUP
const canvas = document.querySelector('#bg-canvas');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050505, 0.03); // Distance fog

// 2. CAMERA SETUP (Critical for the "Top" look)
const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 150);

// Position: Low to the ground (-10), pushed back (+25)
camera.position.set(0, 0, 13); 

// Where camera looking: Far ahead and slightly down
camera.lookAt(0, -10, -20);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// 3. LANTERN CREATION
const geometry = new THREE.CylinderGeometry(0.4, 0.2, 0.7, 4, 1, true);

// TOP LID
const lidGeometry = new THREE.SphereGeometry(0.4, 4, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const material = new THREE.MeshBasicMaterial({ 
    color: 0xc44d1b, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
    depthWrite: true
});

//OUTLINE OF LANTERN + COLOUR
const edges = new THREE.EdgesGeometry(geometry);
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x6d2f15, transparent: true, opacity: 0.8 });

// NEW: FLAME SETUP
// 1. The Core (Keep this a capsule for the wick)
const flameGeometry = new THREE.CapsuleGeometry(0.05, 0.15, 4, 8);
const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
// 2. The Glow (NOW A SOFT SPRITE)
const glowTexture = createGlowTexture(); // <--- Generate the texture
const glowMaterial = new THREE.SpriteMaterial({ 
    map: glowTexture, 
    color: 0xffaa00,
    transparent: true, 
    opacity: 0.95,
    blending: THREE.AdditiveBlending, // Makes it look like light
    depthWrite: false // Prevents sorting glitches
});

const lanterns = [];
const lanternCount = 150;

// TUNNEL SETTINGS
const tunnelLength = 120; 
const tunnelWidth = 80;   // Start very wide

for (let i = 0; i < lanternCount; i++) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, material));
    group.add(new THREE.LineSegments(edges, lineMaterial));
    
    // 2. Add the Top Lid
    const lid = new THREE.Mesh(lidGeometry, material);
    lid.position.y = 0.35; 
    group.add(lid);

    // 3. Add the Flame (At the bottom opening)
    const flame = new THREE.Mesh(flameGeometry, flameMaterial);
    flame.position.y = -0.18; // Bottom of cylinder
    group.add(flame);

    // 4. Add the Soft Glow Sprite
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.set(1.7, 2, -0.1); // sprites (Width, Height, Depth)
    glow.position.y = 0; // Center of the flame
    group.add(glow);
    
    // 5. Setup Animation Data
    group.userData = {
        // ... (Keep all your existing offsets: offsetZ, offsetX, etc.) ...
        offsetZ: Math.random() * tunnelLength, 
        offsetX: (Math.random() - 0.5) * tunnelWidth,
        offsetY: -20 + Math.random() * 10,
        swaySpeed: Math.random() * 0.002,
        swayOffset: Math.random() * Math.PI,
        
        // Flame Flicker Data
        flameMesh: flame,
        glowMesh: glow
    };
    
    scene.add(group);
    lanterns.push(group);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 4. ANIMATION LOOP
function animate() {
    requestAnimationFrame(animate);
    const scrollPos = window.scrollY * 0.01; 

    lanterns.forEach(l => {
        const data = l.userData;

        // A. CALCULATE DEPTH (Z)
        let rawZ = data.offsetZ + scrollPos;
        let currentZ = ((rawZ % tunnelLength) + tunnelLength) % tunnelLength;
        
        // Z Range: From 25 (Close) to -95 (Far)
        let finalZ = 25 - currentZ; 

        // B. CALCULATE PROGRESS (0.0 = Close, 1.0 = Far)
        let progress = (25 - finalZ) / tunnelLength; 
        
        // C. FUNNEL: SQUEEZE X TOWARDS CENTER
        // At progress 1 (far), width is only 5% (0.05) of original
        let funnelFactor = 1 - (progress * 0.95); 
        l.position.x = data.offsetX * funnelFactor; 
        
        // D. RISE: PUSH Y TOWARDS TOP
        // This is the key change. We add (progress * 80).
        // This creates a steep upward slope.
        l.position.y = data.offsetY + (progress * 80); 

        l.position.z = finalZ;

        // E. SCALE
        let scale = 1.5 - (progress * 1.3);
        if (scale < 0.1) scale = 0.1;
        l.scale.set(scale, scale, scale);

        // F. SWAY
        const time = Date.now();
        l.rotation.y = Math.sin(time * data.swaySpeed + data.swayOffset) * 0.2;
        l.rotation.z = Math.cos(time * data.swaySpeed) * 0.05;
        // G. SMOOTH FIRE FLICKER
        if (data.flameMesh && data.glowMesh) {
            
            // 1. Get the current time
            const time = Date.now();
            
            // 2. Calculate smooth flicker using Sine Waves
            // 0.005 is the SPEED. Change to 0.002 to make it even slower.
            const smoothWave = Math.sin(time * 0.005 + data.swayOffset); 
            const jitter = Math.random() * 0.05; // Tiny random shake
            
            // Base scale (1.0) + Wave variation (0.15) + Jitter
            const flicker = 1 + (smoothWave * 0.15) + jitter; 

            // 3. Apply to Flame (The White Core)
            data.flameMesh.scale.set(flicker, flicker, flicker);

            // 4. Apply to Glow (The Orange Halo)
            const glowScale = flicker * 1.6;
            data.glowMesh.scale.set(glowScale, glowScale, glowScale);
            
            // 5. Pulse Opacity
            data.glowMesh.material.opacity = 0.5 + (smoothWave * 0.1);
        }
    });

    renderer.render(scene, camera);
}

animate();
// HELPER: Generates a soft glow texture programmatically
function createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d');
    
    // Draw a radial gradient (White center -> Orange mid -> Transparent edge)
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');   // Hot Center
    gradient.addColorStop(0.2, 'rgba(255, 160, 0, 0.8)'); // Fire Orange
    gradient.addColorStop(0.5, 'rgba(255, 60, 0, 0.3)');  // Fading Red
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');         // Transparent Edge

    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    
    return new THREE.CanvasTexture(canvas);
}

/* --- GLOBAL VARIABLES --- */
const joinModal = document.getElementById('joinModal');
const nameInput = document.getElementById('nameInput');
const codeInput = document.getElementById('roomCodeInput');
const submitBtn = document.getElementById('submitBtn');
const errorMsg = document.getElementById('errorMessage');

// Auto-open modal on redirect with flag or stored error
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const shouldOpen = params.get('openJoin') === '1';
    const storedError = sessionStorage.getItem('join_error');

    if (shouldOpen || storedError) {
        if (storedError) {
            showError(storedError);
            // Clear after showing once
            sessionStorage.removeItem('join_error');
        }
        openJoinModal();
    }
});

/* --- 1. MODAL CONTROLS --- */
function openJoinModal() {
    joinModal.style.display = 'flex';
    nameInput.focus(); // Automatically put cursor in the name box
}

function closeJoinModal() {
    joinModal.style.display = 'none';
    errorMsg.classList.remove('show'); // Hide errors when closing
}

// Close if clicking outside the box
window.onclick = function(event) {
    if (event.target === joinModal) {
        closeJoinModal();
    }
}

/* --- 2. INPUT FORMATTING --- */
codeInput.addEventListener('input', function(e) {
    // Remove anything that is NOT a number (0-9)
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
});

/* --- 3. SUBMIT LOGIC --- */
function submitInfo() {
    const nameValue = nameInput.value.trim();
    const codeValue = codeInput.value.trim();

    // A. VALIDATION: Check if empty
    if (!nameValue) {
        showError("Please enter your name.");
        return;
    }
    if (codeValue.length !== 4) {
        showError("Please enter a 4-digit Room Code.");
        return;
    }

    // B. UI FEEDBACK: Disable button immediately
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking...'; // Changed to "Checking"

    // C. THE CHECK (Assume server check)
    fetch(`/check-room/${codeValue}`)
        .then(async res => {
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                // Use server-provided message if available
                const msg = (data && data.message) ? data.message : 'Room not active.';
                sessionStorage.setItem('join_error', msg);
                throw new Error('room-not-active');
            }
            return data;
        })
        .then(roomInfo => {
            // --- SUCCESS! ROOM EXISTS ---                    
            submitBtn.textContent = 'Joining...';
            
            // 1. Store Data
            sessionStorage.setItem('lantern_pin', codeValue);
            sessionStorage.setItem('lantern_name', nameValue);

            // 2. Build URL
            const params = new URLSearchParams();
            params.append('pin', codeValue);
            params.append('username', nameValue);

            // 3. Redirect
            window.location.href = `mobile.html?${params.toString()}`;
        })
        .catch(err => {
            // --- FAILURE! ROOM ISSUE ---                    
            // Re-enable the button so they can try again
            submitBtn.disabled = false;
            submitBtn.textContent = 'Enter Lantern Festival';
            
            if (err.message === 'room-not-active') {
                showRoomNotActiveMessage();
            } else {
                console.error('Room check failed', err);
                // Fallback: If you don't have a backend yet, 
                // you might want to allow it anyway for testing:
                // window.location.href = `mobile.html?pin=${codeValue}...`;
                showError("Could not connect to room server.");
            }
        });
}

/* --- 4. HELPER FUNCTIONS --- */
function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.add('show');
    
    // Shake the box slightly (fun effect)
    submitBtn.style.transform = "translateX(5px)";
    setTimeout(() => submitBtn.style.transform = "translateX(0)", 100);
}

function showRoomNotActiveMessage() {
    const storedError = sessionStorage.getItem('join_error');
    showError(storedError || 'Please enter a correct Room Code.');
    return;
}

// Reset button if they hit the "Back" button to return here
window.addEventListener('pageshow', () => {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enter Lantern Festival';
});

// Expose handlers to global scope so inline onclick attributes work
window.openJoinModal = openJoinModal;
window.closeJoinModal = closeJoinModal;
window.submitInfo = submitInfo;