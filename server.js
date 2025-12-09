require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createClient } = require('redis');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024 * 1024
});

const PORT = process.env.PORT || 3000;

// === 1. Configuration & Constants ===

// Use the existing QWEN credentials
const QWEN_API_KEY = process.env.QWEN_API_KEY; 

// FIXED: Correct Endpoint for Wanx (Tongyi Wanxiang)
const DASHSCOPE_IMAGE_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';
const DASHSCOPE_TASK_URL = 'https://dashscope.aliyuncs.com/api/v1/tasks';

const CHINESE_LOCATIONS = [
    "The Great Wall of China winding through mountains",
    "The Karst mountains of Guilin along the Li River",
    "The Forbidden City in Beijing",
    "The Bund in Shanghai with futuristic skyline",
    "West Lake in Hangzhou with the Leifeng Pagoda",
    "Ancient Fenghuang (Phoenix) City with stilt houses",
    "The Yellow Mountains (Huangshan) with sea of clouds",
    "Zhangjiajie National Forest Park (Avatar mountains)",
    "Suzhou classical gardens with water canals"
];

const ROOM_TIMEOUT_PRESETS = {
  '3hr': 3 * 60 * 60 * 1000,
  '1day': 24 * 60 * 60 * 1000,
  'never': null
};
const ROOM_TIMEOUT = ROOM_TIMEOUT_PRESETS[process.env.ROOM_TIMEOUT || '1day'];

// === 2. Helper: Wanx Image Generation (Submit -> Poll) ===

async function generateWanxImage(prompt) {
    if (!QWEN_API_KEY) throw new Error("QWEN_API_KEY is missing");

    // Step 1: Submit the Task
    console.log("🎨 Submitting Wanx generation task...");
    const submitRes = await fetch(DASHSCOPE_IMAGE_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${QWEN_API_KEY}`,
            'Content-Type': 'application/json',
            'X-DashScope-Async': 'enable'
        },
        body: JSON.stringify({
            model: "wanx-v1",
            input: {
                prompt: prompt
            },
            parameters: {
                style: "<auto>",
                size: "1024*1024",
                n: 1
            }
        })
    });

    if (!submitRes.ok) {
        const err = await submitRes.text();
        throw new Error(`Wanx Submission Failed: ${err}`);
    }

    const submitData = await submitRes.json();
    
    // Check if task_id exists
    if (!submitData.output || !submitData.output.task_id) {
         throw new Error(`Invalid Response from Wanx: ${JSON.stringify(submitData)}`);
    }

    const taskId = submitData.output.task_id;
    console.log(`⏳ Task ID: ${taskId}. Polling for results...`);

    // Step 2: Poll for status (Wait max 60 seconds)
    const maxRetries = 30; // 30 * 2s = 60s
    for (let i = 0; i < maxRetries; i++) {
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s

        const checkRes = await fetch(`${DASHSCOPE_TASK_URL}/${taskId}`, {
            headers: { 'Authorization': `Bearer ${QWEN_API_KEY}` }
        });
        
        const checkData = await checkRes.json();
        
        if (checkData.output && checkData.output.task_status === 'SUCCEEDED') {
            // Task done! Return the image URL
            if (checkData.output.results && checkData.output.results[0]) {
                return checkData.output.results[0].url;
            }
        } else if (checkData.output && checkData.output.task_status === 'FAILED') {
            throw new Error(`Wanx Task Failed: ${checkData.output.message || 'Unknown error'}`);
        }
        // If 'PENDING' or 'RUNNING', loop continues
    }
    
    throw new Error("Wanx Task Timed Out");
}


// === 3. Room Management Logic ===
const rooms = new Map();
const roomActivity = new Map();
let redisClient = null;

if (process.env.REDIS_URL) {
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.connect().catch(console.error);
}

function generatePin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function updateRoomActivity(pin) {
    if (!ROOM_TIMEOUT) return;
    const act = roomActivity.get(pin);
    if (act?.timeoutId) clearTimeout(act.timeoutId);
    
    const timeoutId = setTimeout(() => {
        const r = rooms.get(pin);
        if (r) {
            io.to(pin).emit('room-closed', { message: 'Inactivity timeout' });
            rooms.delete(pin);
            roomActivity.delete(pin);
            if (redisClient) redisClient.del(`room:${pin}`);
        }
    }, ROOM_TIMEOUT);
    
    roomActivity.set(pin, { lastActivity: Date.now(), timeoutId });
}

// === 4. Express Routes ===

app.get('/create-room', async (req, res) => {
  let pin;
  do { pin = generatePin(); } while (rooms.has(pin));
  rooms.set(pin, { hostSocketId: null, players: [] });
  if (redisClient) await redisClient.hSet(`room:${pin}`, { players: '[]' });
  updateRoomActivity(pin);
  res.json({ pin });
});

app.get('/', (req, res) => res.redirect('/host.html'));
app.get('/check-room/:pin', (req, res) => res.json({ exists: rooms.has(req.params.pin) }));
app.get('/join', (req, res) => res.sendFile(path.join(__dirname, 'public', 'join.html')));
app.get('/join/:pin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'join.html')));
app.use(express.static(path.join(__dirname, 'public')));


// === 5. Qwen-VL Logic (Existing) ===
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';

async function analyzeWithQWEN({ faces, shape, name }) {
  if (!QWEN_API_KEY || !faces?.length) return null;
  
  try {
    const content = faces.map(f => ({ type: 'image_url', image_url: { url: f } }));
    content.push({ 
        type: 'text', 
        text: "Analyze these lantern drawings. Write a short, poetic story (80-100 words) about the lantern's meaning, themes of family/wishes, and Chinese culture." 
    });

    const res = await fetch(`${QWEN_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${QWEN_API_KEY}` },
      body: JSON.stringify({
        model: 'qwen3-vl-plus',
        messages: [{ role: 'user', content }],
        max_tokens: 400
      })
    });

    const json = await res.json();
    return json.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.error("Qwen VL Error:", e);
    return null;
  }
}

// === 6. Socket Logic ===

io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    // Host Join
    socket.on('host-join', ({ pin }) => {
        if (!rooms.has(pin)) return socket.emit('error-msg', { message: 'Room not found' });
        const room = rooms.get(pin);
        room.hostSocketId = socket.id;
        socket.join(pin);
        socket.pin = pin;
        updateRoomActivity(pin);
        socket.emit('room-state', { players: room.players });
    });

    // Player Join
    socket.on('join-room', async ({ pin, name }) => {
        if (!rooms.has(pin)) return socket.emit('join-failed', { message: 'Room not found' });
        const room = rooms.get(pin);
        socket.join(pin);
        socket.pin = pin;
        socket.playerName = name || 'Guest';
        const p = { id: socket.id, name: socket.playerName };
        room.players.push(p);
        if (redisClient) await redisClient.hSet(`room:${pin}`, { players: JSON.stringify(room.players) });
        updateRoomActivity(pin);
        io.to(pin).emit('player-joined', p);
    });

    // Submit Lantern
    socket.on('submit-lantern', (data) => {
        if (!data.pin) return;
        updateRoomActivity(data.pin);
        io.to(data.pin).emit('new-lantern', {
            id: socket.id,
            name: socket.playerName,
            ...data,
            autoNarrate: data.autoNarrate !== false
        });
    });

    // Generate Story (Qwen VL)
    socket.on('generate-story', async (data, callback) => {
        const story = await analyzeWithQWEN({ ...data, name: socket.playerName });
        if (callback) callback(story);
    });

    // === AI Background via Wanx (Alibaba) ===
    socket.on('requestRandomAiBackground', async () => {
        try {
            const loc = CHINESE_LOCATIONS[Math.floor(Math.random() * CHINESE_LOCATIONS.length)];
            const prompt = `Atmospheric night scene of ${loc} during Lantern Festival, glowing lanterns in sky, cinematic, digital art, 8k resolution`;
            
            console.log(`Generating Wanx background for: ${loc}`);
            
            // Call the polling helper
            const imageUrl = await generateWanxImage(prompt);
            
            socket.emit('aiBackgroundGenerated', { imageUrl, locationName: loc });
            console.log("✅ Wanx Image sent to host.");

        } catch (err) {
            console.error("❌ Wanx Gen Error:", err.message);
            socket.emit('aiBackgroundError', { message: "Failed to generate image." });
        }
    });

    // Disconnect
    socket.on('disconnect', async () => {
        if (socket.pin && rooms.has(socket.pin)) {
            const r = rooms.get(socket.pin);
            if (r.hostSocketId === socket.id) {
                r.hostSocketId = null;
                io.to(socket.pin).emit('host-disconnect');
            } else {
                r.players = r.players.filter(p => p.id !== socket.id);
                if (redisClient) await redisClient.hSet(`room:${socket.pin}`, { players: JSON.stringify(r.players) });
                io.to(socket.pin).emit('player-left', { id: socket.id });
            }
        }
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));