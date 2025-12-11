const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createClient } = require('redis');

const app = express();
// Increase payload size for Express
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const server = http.createServer(app);
// Increase payload size for Socket.IO
const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024 * 1024 // 10MB
});

const PORT = process.env.PORT || 3000;

// Room timeout configuration (in milliseconds)
// Options: 3hr, 6hr, 1day, 3day, 1week, 1month, or 'never'
const ROOM_TIMEOUT_PRESETS = {
  '3hr': 3 * 60 * 60 * 1000,
  '6hr': 6 * 60 * 60 * 1000,
  '1day': 24 * 60 * 60 * 1000,
  '3day': 3 * 24 * 60 * 60 * 1000,
  '1week': 7 * 24 * 60 * 60 * 1000,
  '1month': 30 * 24 * 60 * 60 * 1000,
  'never': null
};

const ROOM_TIMEOUT_SETTING = process.env.ROOM_TIMEOUT || '1day';
const ROOM_TIMEOUT = ROOM_TIMEOUT_PRESETS[ROOM_TIMEOUT_SETTING] || ROOM_TIMEOUT_PRESETS['1day'];

console.log(`Room timeout setting: ${ROOM_TIMEOUT_SETTING} (${ROOM_TIMEOUT ? ROOM_TIMEOUT / 1000 / 60 + ' minutes' : 'never'})`);

// Track room activity
const roomActivity = new Map(); // pin -> { lastActivity: timestamp, timeoutId: timeoutId }

// Redis client for rooms persistence (optional). If REDIS_URL not set, we'll keep in-memory.
let redisClient = null;
const useRedis = !!process.env.REDIS_URL;
if (useRedis) {
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on('error', (err) => console.error('Redis Client Error', err));
  redisClient.connect().then(() => console.log('Connected to Redis'));
}

// In-memory store as fallback
const rooms = new Map();

function generatePin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Function to clean up inactive room
function cleanupRoom(pin) {
  console.log(`Cleaning up inactive room: ${pin}`);
  const room = rooms.get(pin);
  if (room) {
    // Notify all connected clients
    io.to(pin).emit('room-closed', { message: 'Room closed due to inactivity' });

    // Remove from memory
    rooms.delete(pin);
    roomActivity.delete(pin);

    // Remove from Redis if applicable
    if (redisClient) {
      redisClient.del(`room:${pin}`).catch(err => console.error('Redis delete error:', err));
    }
  }
}

// Function to update room activity and reset timeout
function updateRoomActivity(pin) {
  if (!ROOM_TIMEOUT) return; // No timeout if set to 'never'

  const activity = roomActivity.get(pin);

  // Clear existing timeout if any
  if (activity && activity.timeoutId) {
    clearTimeout(activity.timeoutId);
  }

  // Set new timeout
  const timeoutId = setTimeout(() => {
    cleanupRoom(pin);
  }, ROOM_TIMEOUT);

  roomActivity.set(pin, {
    lastActivity: Date.now(),
    timeoutId: timeoutId
  });
}

app.get('/create-room', async (req, res) => {
  let pin;
  do {
    pin = generatePin();
  } while (rooms.has(pin));
  const room = { hostSocketId: null, players: [] };
  rooms.set(pin, room);
  if (redisClient) {
    await redisClient.hSet(`room:${pin}`, { hostSocketId: '', players: JSON.stringify([]) });
  }

  // Initialize room activity tracking
  updateRoomActivity(pin);

  res.json({ pin });
});

// Redirect root to host page
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

// Check if room exists (for host reconnection)
app.get('/check-room/:pin', (req, res) => {
  const { pin } = req.params;
  const exists = rooms.has(pin);
  let message = ""
  let status = 200

  if (!exists) {
    status = 404
    message = 'Room not found. Please check the PIN and try again.'
  }
  
  return res.status(status).json({ exists, pin, message });
});

// Serve join landing page
app.get('/join', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve join page at /join/:pin (mobile)
app.get('/join/:pin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

// Serve static UI - must be AFTER API routes to avoid conflicts
app.use(express.static(path.join(__dirname, 'public')));

// Helper to persist player list
async function addPlayerToRoom(pin, player) {
  const room = rooms.get(pin);
  if (!room) return;
  room.players.push(player);
  if (redisClient) {
    await redisClient.hSet(`room:${pin}`, { players: JSON.stringify(room.players) });
  }
}

async function removePlayerFromRoom(pin, socketId) {
  const room = rooms.get(pin);
  if (!room) return;
  room.players = room.players.filter(p => p.id !== socketId);
  if (redisClient) {
    await redisClient.hSet(`room:${pin}`, { players: JSON.stringify(room.players) });
  }
}

// === QWEN / Visual LLM configuration ===
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const QWEN_API_KEY = process.env.QWEN_API_KEY || null;

// Call the Qwen3-VL model directly with images and a user prompt.
// Expects 'faces' to be an array of data URLs (data:image/png;base64,...).
async function analyzeWithQWEN({ faces, shape, name }) {
  if (!QWEN_API_KEY) {
    console.log('QWEN_API_KEY not set — skipping visual analysis.');
    return null;
  }
  if (!faces || !faces.length) return null;
  if (typeof fetch === 'undefined') {
    console.warn('Global fetch not available. Install node 18+ or provide a fetch polyfill.');
    return null;
  }

  try {
    // Build message content: one image_url item per face followed by the task prompt.
    const content = [];
    for (const f of faces) {
      content.push({ type: 'image_url', image_url: { url: f } });
    }

    // Prompt the model to return a JSON object with English and Chinese fields.
    content.push({
      type: 'text',
      text: `You are a masterful Lantern Festival storyteller. Analyze the provided images as a set and produce a short poetic story inspired by them.
Return ONLY a JSON object with exactly two keys: "en" (English story) and "zh" (Chinese story).
Example: {"en":"English text...","zh":"中文文本..."}
Make each version ~80-120 words, warm traditional tone, and do not include any extra commentary or markup.`
    });

    const payload = {
      model: 'qwen3-vl-plus',
      messages: [
        { role: 'user', content }
      ],
      temperature: 0.7,
      max_tokens: 700
    };

    const res = await fetch(`${QWEN_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${QWEN_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('QWEN response error', res.status, txt);
      return null;
    }

    const json = await res.json();

    // Extract raw text from common response shapes
    let raw = null;
    if (Array.isArray(json.choices) && json.choices.length) {
      const choice = json.choices[0];
      const msg = choice.message || choice;
      const content = msg.content || msg;
      if (Array.isArray(content)) {
        const seg = content.find(c => c.type === 'text' || c.type === 'output_text' || typeof c.text === 'string');
        if (seg) raw = seg.text || seg.content || seg.output_text || null;
      } else if (typeof content === 'string') {
        raw = content;
      } else if (choice.text) {
        raw = choice.text;
      }
    }
    if (!raw && json.output) raw = typeof json.output === 'string' ? json.output : (json.output?.text || null);
    if (!raw && json.story) raw = json.story;

    if (!raw) return null;

    // Try to parse JSON the model returned
    try {
      const parsed = JSON.parse(raw.trim());
      return {
        en: parsed.en || parsed.english || null,
        zh: parsed.zh || parsed.cn || parsed.chinese || null
      };
    } catch (e) {
      // If cannot parse, return English as raw text and leave Chinese null
      return { en: raw.trim(), zh: null };
    }
  } catch (err) {
    console.error('QWEN call failed:', err);
    return null;
  }
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('host-join', async (data) => {
    const { pin } = data;
    if (!rooms.has(pin)) {
      socket.emit('error-msg', { message: 'Room not found' });
      return;
    }
    const room = rooms.get(pin);
    room.hostSocketId = socket.id;
    socket.join(pin);
    socket.pin = pin;
    console.log(`Host ${socket.id} joined room ${pin}`);

    // Update room activity
    updateRoomActivity(pin);

    // send current players if any
    socket.emit('room-state', { players: room.players });
  });

  socket.on('join-room', async (data) => {
    const { pin, name } = data;

    // Check if room exists
    if (!rooms.has(pin)) {
      socket.emit('join-failed', { message: 'Room not found. Please check the PIN and try again.' });
      return;
    }

    // Check if host is active in the room
    const room = rooms.get(pin);
    if (!room.hostSocketId) {
      socket.emit('join-failed', { message: 'Host is not currently active. Please try again later.' });
      return;
    }

    socket.join(pin);
    socket.pin = pin;
    socket.playerName = name || 'Guest';
    const player = { id: socket.id, name: socket.playerName };
    await addPlayerToRoom(pin, player);

    // Update room activity
    updateRoomActivity(pin);

    // notify host
    io.to(pin).emit('player-joined', player);
    console.log(`Player ${socket.id} (${socket.playerName}) joined ${pin}`);
  });

  // Handle story generation request (on-demand from mobile client)
  socket.on('generate-story', async (data, callback) => {
    const { pin, shape, faces } = data;
    if (!pin || !faces || !faces.length) {
      if (callback) callback(null);
      return;
    }

    try {
      const story = await analyzeWithQWEN({ faces, shape, name: socket.playerName });
      if (callback) callback(story || null);
    } catch (err) {
      console.error('Error during QWEN analysis:', err);
      if (callback) callback(null);
    }
  });

  // Make the submit handler async so we can process the submission
  socket.on('submit-lantern', async (data) => {
    console.log('Socket data size:', JSON.stringify(data).length);
    const { pin, shape, faces, customMessage, autoNarrate } = data;
    if (!pin) return;

    if (!faces || !Array.isArray(faces)) {
      console.error('Missing faces array in submission');
      return;
    }

    updateRoomActivity(pin);

    const lanternData = {
      id: socket.id,
      name: socket.playerName,
      shape,
      faces: faces,
      bgColor: data.bgColor || null,
      customMessage: customMessage || '',
      // Forward bilingual pair if present (mobile may include it)
      customMessageBilingual: data.customMessageBilingual || null,
      autoNarrate: autoNarrate !== false // Default to true if not specified
    };

    io.to(pin).emit('new-lantern', lanternData);
    console.log(`Lantern from ${socket.id} forwarded to host in ${pin}`);
  });

  // Host requests to kick a player by socket id
  socket.on('kick-player', async ({ id }) => {
    try {
      const roomPin = socket.pin;
      if (!roomPin) return;
      const room = rooms.get(roomPin);
      if (!room) return;

      // Only allow the host to kick
      if (room.hostSocketId !== socket.id) {
        console.warn('Non-host attempted to kick:', socket.id);
        return;
      }

      // Remove player from internal room state
      await removePlayerFromRoom(roomPin, id);

      // Notify the kicked socket directly and attempt to disconnect
      try {
        const targetSocket = io.sockets.sockets && io.sockets.sockets.get ? io.sockets.sockets.get(id) : (io.sockets.connected && io.sockets.connected[id]);
        if (targetSocket && targetSocket.emit) {
          targetSocket.emit('kicked', { reason: 'You were kicked by the host.' });
          try { targetSocket.disconnect(true); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        console.warn('Failed to notify/disconnect kicked socket', e);
      }

      // Broadcast updated player-left to room so host UI updates
      io.to(roomPin).emit('player-left', { id });
    } catch (err) {
      console.error('kick-player error', err);
    }
  });

  socket.on('disconnect', async () => {
    // If host disconnected, clear room
    if (socket.pin && rooms.has(socket.pin)) {
      const room = rooms.get(socket.pin);
      if (room.hostSocketId === socket.id) {
        // keep players but mark host disconnected; we'll allow reconnection
        room.hostSocketId = null;
        io.to(socket.pin).emit('host-disconnect');
        console.log(`Host disconnected from room ${socket.pin}`);
      } else {
        await removePlayerFromRoom(socket.pin, socket.id);
        io.to(socket.pin).emit('player-left', { id: socket.id });
      }
    }
    console.log('socket disconnected', socket.id);
  });
});

const os = require('os');

server.listen(PORT, () => {
  const ifaces = os.networkInterfaces();
  const addrList = [];
  Object.keys(ifaces).forEach((name) => {
    ifaces[name].forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) addrList.push(iface.address);
    });
  });
  console.log(`Server listening on http://localhost:${PORT}`);
  if (addrList.length) console.log(`Also reachable on your LAN at: ${addrList.map(a => `http://${a}:${PORT}`).join(', ')}`);
});
