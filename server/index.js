import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3001;
// Bounds memory on a small instance, and stops one client spinning up endless rooms.
// Well under the 9000 possible codes, so allocation never has to search hard.
const MAX_ROOMS = 500;
const CODE_MIN = 1000;
const CODE_SPAN = 9000;

const app = express();
app.disable('x-powered-by');
const httpServer = createServer(app);
// No CORS config: the client is served from this same origin (see the static block below), so
// Socket.IO's same-origin default is what we want. The old wildcard would have let any site on
// the internet open a socket and drive somebody's game.
const io = new Server(httpServer);

// roomCode -> { desktopId, phoneId }
const rooms = new Map();

function roomName(code) {
  return `room-${code}`;
}

// Codes must be unique. They used to be picked at random on the client with no check, which is
// the birthday problem: at 100 concurrent games there was a ~42% chance two players shared a
// code, and the loser got a stranger's phone swinging their racket. Allocating here, against
// the live room map, makes a collision impossible.
function allocateRoomCode() {
  if (rooms.size >= MAX_ROOMS) return null;
  for (let i = 0; i < 50; i++) {
    const code = String(CODE_MIN + Math.floor(Math.random() * CODE_SPAN));
    if (!rooms.has(code)) return code;
  }
  // Random probing got unlucky — fall back to a scan so we never fail while codes remain.
  for (let c = CODE_MIN; c < CODE_MIN + CODE_SPAN; c++) {
    const code = String(c);
    if (!rooms.has(code)) return code;
  }
  return null;
}

io.on('connection', (socket) => {
  // A desktop asks for a room; the server names it. The room lives as long as the socket does.
  socket.on('create-room', () => {
    if (socket.data.room) return; // already has one
    const code = allocateRoomCode();
    if (!code) {
      socket.emit('room-error', { reason: 'busy' });
      return;
    }
    rooms.set(code, { desktopId: socket.id });
    socket.join(roomName(code));
    socket.data.room = code;
    socket.data.role = 'desktop';
    socket.emit('room-created', { room: code });
  });

  // A phone joins an existing room by code (from the QR link).
  socket.on('join-room', ({ room, role } = {}) => {
    if (!room || role !== 'phone') return;
    const code = String(room);
    const entry = rooms.get(code);
    if (!entry || !entry.desktopId) {
      socket.emit('room-error', { reason: 'not-found' }); // no game waiting on that code
      return;
    }
    if (entry.phoneId && entry.phoneId !== socket.id) {
      socket.emit('room-error', { reason: 'full' }); // one racket per game
      return;
    }

    entry.phoneId = socket.id;
    socket.join(roomName(code));
    socket.data.room = code;
    socket.data.role = 'phone';

    io.to(entry.desktopId).emit('phone-connected');
    socket.emit('desktop-found');
  });

  // Phone -> Desktop relays. Each only ever reaches the desktop that owns the phone's own room.
  const relay = (event) => (payload) => {
    const room = socket.data.room;
    if (!room || socket.data.role !== 'phone') return;
    const entry = rooms.get(room);
    if (entry?.desktopId) io.to(entry.desktopId).emit(event, payload);
  };
  socket.on('swing', relay('swing')); // a detected racket swing
  socket.on('tilt', relay('tilt')); // continuous orientation, for racket aiming
  socket.on('calibrate', relay('calibrate')); // snap the racket to its neutral pose

  socket.on('disconnect', () => {
    const room = socket.data.room;
    const role = socket.data.role;
    if (!room) return;
    const entry = rooms.get(room);
    if (!entry) return;

    if (role === 'desktop' && entry.desktopId === socket.id) {
      delete entry.desktopId;
      if (entry.phoneId) io.to(entry.phoneId).emit('desktop-disconnected');
    }
    if (role === 'phone' && entry.phoneId === socket.id) {
      delete entry.phoneId;
      if (entry.desktopId) io.to(entry.desktopId).emit('phone-disconnected');
    }
    // Free the code once nobody is left, so it can be handed out again.
    if (!entry.desktopId && !entry.phoneId) rooms.delete(room);
  });
});

app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

// Serve the built game, so the page and the socket share one origin: one URL, one certificate,
// no CORS. In dev this directory doesn't exist — Vite serves the client and proxies the socket
// here, so this block is skipped and local development is unaffected.
const clientDist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  // index:false — index.html goes through the handler below so its meta tags can be filled in.
  app.use(express.static(clientDist, { index: false }));

  // Open Graph requires absolute URLs, and we don't know the domain at build time (free
  // subdomain now, custom domain maybe later). So the page ships a __ORIGIN__ placeholder and
  // the real origin is substituted per request, from the host the visitor actually used.
  const indexTemplate = fs.readFileSync(path.join(clientDist, 'index.html'), 'utf8');
  const pageFor = (req) => {
    // Behind Render's proxy the TLS terminates upstream, so trust the forwarded protocol.
    const proto = req.get('x-forwarded-proto') || req.protocol;
    const origin = `${proto}://${req.get('host')}`;
    return indexTemplate.replaceAll('__ORIGIN__', origin);
  };
  // The phone pairs via /?room=1234, but serve the page for any path so a stray refresh or a
  // mistyped URL still lands on the game rather than a 404.
  app.get('*', (req, res) => res.type('html').send(pageFor(req)));
} else {
  app.get('/', (_req, res) => res.send('Swing Tennis signaling server OK (client not built)'));
}

httpServer.listen(PORT, () => {
  console.log(`Swing Tennis listening on :${PORT}`);
});
