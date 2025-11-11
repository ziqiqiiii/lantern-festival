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

// Check if room exists (for host reconnection)
app.get('/check-room/:pin', (req, res) => {
  const { pin } = req.params;
  const exists = rooms.has(pin);
  res.json({ exists, pin });
});

// Serve join landing page
app.get('/join', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
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
    if (!rooms.has(pin)) {
      socket.emit('join-failed', { message: 'Room not found' });
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

  socket.on('submit-lantern', (data) => {
    console.log('Socket data size:', JSON.stringify(data).length);
    // data: { pin, imageDataUrl, shape, faces }
    const { pin, shape, faces } = data;
    if (!pin) return;

    // Verify we have the faces data
    if (!faces || !Array.isArray(faces)) {
      console.error('Missing faces array in submission');
      return;
    }

    // Update room activity on lantern submission
    updateRoomActivity(pin);

    // Send to host only
    const lanternData = {
      id: socket.id,
      name: socket.playerName,
      shape,
      faces: faces
    };

    // Log size of data being forwarded
    console.log('Forwarding lantern:', {
      id: socket.id,
      pin,
      shape,
      facesReceived: faces.length,
      dataSize: JSON.stringify(lanternData).length
    });

    io.to(pin).emit('new-lantern', lanternData);
    console.log(`Lantern from ${socket.id} forwarded to host in ${pin}`);
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
