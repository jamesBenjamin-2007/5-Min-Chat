require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { randomUUID } = require("crypto");
const { moderateMessage } = require("./moderation");

// ---------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------
const PORT = process.env.PORT || 4000;

// Accepts a comma separated list, e.g.
// FRONTEND_URL=https://5minchat.online,https://www.5minchat.online,https://5minchat.vercel.app
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const SESSION_DURATION_MS = 5 * 60 * 1000; // 5 minutes, server-authoritative
const MAX_MESSAGE_LENGTH = 500;
const MESSAGE_RATE_WINDOW_MS = 10_000; // 10s
const MESSAGE_RATE_MAX = 8; // max messages per window
const REMATCH_COOLDOWN_MS = 2 * 60 * 1000; // don't re-pair the same 2 people for 2 min
const MAX_QUEUE_WAIT_LOG_MS = 60_000;

// ---------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------
const app = express();

const corsOptions = {
  origin: ALLOWED_ORIGINS.includes("*") ? true : ALLOWED_ORIGINS,
  methods: ["GET", "POST"],
};
app.use(cors(corsOptions));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "5minchat-backend" });
});

// Simple health/status endpoint - handy for confirming Render deploy is live
// and for an uptime pinger (see README re: free-tier cold starts).
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    waitingUsers: waitingQueue.length,
    activeRooms: rooms.size,
    uptimeSeconds: process.uptime(),
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
});

// ---------------------------------------------------------------------
// In-memory state (fine for a single free-tier instance / MVP scope).
// Nothing here is written to a database or log file - it lives only in
// process memory and disappears when a room closes or the process
// restarts, matching the "no permanent chat history" product rule.
// ---------------------------------------------------------------------
let waitingQueue = []; // [{ socketId, joinedAt }]
const rooms = new Map(); // roomId -> room object
const socketToRoom = new Map(); // socketId -> roomId
const anonNames = new Map(); // socketId -> display name
const messageTimestamps = new Map(); // socketId -> [timestamps]
const recentPairs = new Map(); // "idA|idB" -> timestamp of last match
const blockedBy = new Map(); // socketId -> Set of socketIds they've blocked

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const ADJECTIVES = [
  "Blue", "Crimson", "Silent", "Wandering", "Curious", "Gentle", "Bright",
  "Hidden", "Lucky", "Quiet", "Bold", "Amber", "Cosmic", "Lone", "Swift",
];
const ANIMALS = [
  "Fox", "Owl", "Wolf", "Falcon", "Panda", "Otter", "Raven", "Lynx",
  "Sparrow", "Tiger", "Heron", "Comet", "Badger", "Dolphin",
];

function generateAnonName() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const n = Math.floor(Math.random() * 90) + 10;
  return `${a}${b}${n}`;
}

function pairKey(idA, idB) {
  return [idA, idB].sort().join("|");
}

function wasRecentlyPaired(idA, idB) {
  const key = pairKey(idA, idB);
  const last = recentPairs.get(key);
  if (!last) return false;
  return Date.now() - last < REMATCH_COOLDOWN_MS;
}

function isBlockedPair(idA, idB) {
  return (
    blockedBy.get(idA)?.has(idB) || blockedBy.get(idB)?.has(idA)
  );
}

function removeFromQueue(socketId) {
  waitingQueue = waitingQueue.filter((entry) => entry.socketId !== socketId);
}

function checkRateLimit(socketId) {
  const now = Date.now();
  const stamps = (messageTimestamps.get(socketId) || []).filter(
    (t) => now - t < MESSAGE_RATE_WINDOW_MS
  );
  stamps.push(now);
  messageTimestamps.set(socketId, stamps);
  return stamps.length <= MESSAGE_RATE_MAX;
}

/**
 * Attempts to pair up waiting users. Called whenever someone joins the
 * queue or the queue changes. Skips pairs that were recently matched or
 * have blocked each other.
 */
function tryMatch() {
  // Simple O(n^2) scan - the queue is expected to stay small; fine for MVP.
  for (let i = 0; i < waitingQueue.length; i++) {
    for (let j = i + 1; j < waitingQueue.length; j++) {
      const a = waitingQueue[i];
      const b = waitingQueue[j];

      const socketA = io.sockets.sockets.get(a.socketId);
      const socketB = io.sockets.sockets.get(b.socketId);

      // Drop stale entries for sockets that disconnected without cleanup.
      if (!socketA) { waitingQueue.splice(i, 1); i--; continue; }
      if (!socketB) { waitingQueue.splice(j, 1); j--; continue; }

      if (isBlockedPair(a.socketId, b.socketId)) continue;
      if (wasRecentlyPaired(a.socketId, b.socketId)) continue;

      // Match found - remove both from queue and create a room.
      waitingQueue = waitingQueue.filter(
        (e) => e.socketId !== a.socketId && e.socketId !== b.socketId
      );
      createRoom(a.socketId, b.socketId);
      return tryMatch(); // keep matching remaining queue
    }
  }
}

function createRoom(idA, idB) {
  const roomId = randomUUID();
  const startTime = Date.now();
  const endTime = startTime + SESSION_DURATION_MS;

  const room = {
    id: roomId,
    users: [idA, idB],
    startTime,
    endTime,
    status: "active",
    timer: null,
  };

  rooms.set(roomId, room);
  socketToRoom.set(idA, roomId);
  socketToRoom.set(idB, roomId);
  recentPairs.set(pairKey(idA, idB), Date.now());

  [idA, idB].forEach((id) => {
    const sock = io.sockets.sockets.get(id);
    if (sock) sock.join(roomId);
  });

  const payload = {
    roomId,
    startTime,
    endTime,
    durationMs: SESSION_DURATION_MS,
  };

  io.to(idA).emit("match_found", {
    ...payload,
    yourName: anonNames.get(idA),
    partnerName: anonNames.get(idB),
    // Ephemeral, random-per-connection id - used client-side only as a
    // handle for block/report. Not a persistent identity, IP, or account id.
    partnerSocketId: idB,
  });
  io.to(idB).emit("match_found", {
    ...payload,
    yourName: anonNames.get(idB),
    partnerName: anonNames.get(idA),
    partnerSocketId: idA,
  });

  // Server-authoritative expiry - the browser's countdown is cosmetic only.
  room.timer = setTimeout(() => expireRoom(roomId, "timeout"), SESSION_DURATION_MS);
}

function expireRoom(roomId, reason) {
  const room = rooms.get(roomId);
  if (!room || room.status !== "active") return;

  room.status = "closed";
  if (room.timer) clearTimeout(room.timer);

  io.to(roomId).emit("session_expired", { roomId, reason });

  room.users.forEach((id) => socketToRoom.delete(id));
  rooms.delete(roomId); // ephemeral - transcript never touched a database
}

function leaveRoomEarly(socketId, reason) {
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room || room.status !== "active") return;

  const partnerId = room.users.find((id) => id !== socketId);
  room.status = "closed";
  if (room.timer) clearTimeout(room.timer);

  io.to(roomId).emit("session_expired", { roomId, reason });

  room.users.forEach((id) => socketToRoom.delete(id));
  rooms.delete(roomId);

  return partnerId;
}

// ---------------------------------------------------------------------
// Socket.IO events
// ---------------------------------------------------------------------
io.on("connection", (socket) => {
  const anonName = generateAnonName();
  anonNames.set(socket.id, anonName);
  socket.emit("connected", { anonName, socketId: socket.id });

  socket.on("find_match", () => {
    // Guard against duplicate queue entries / already in a room.
    if (socketToRoom.has(socket.id)) return;
    if (waitingQueue.some((e) => e.socketId === socket.id)) return;

    waitingQueue.push({ socketId: socket.id, joinedAt: Date.now() });
    socket.emit("queue_joined");
    tryMatch();
  });

  socket.on("cancel_match", () => {
    removeFromQueue(socket.id);
    socket.emit("queue_left");
  });

  socket.on("send_message", async (data, ack) => {
    const roomId = socketToRoom.get(socket.id);
    const room = roomId && rooms.get(roomId);

    if (!room || room.status !== "active") {
      return ack?.({ ok: false, error: "no_active_session" });
    }
    if (Date.now() > room.endTime) {
      return ack?.({ ok: false, error: "session_expired" });
    }
    if (!room.users.includes(socket.id)) {
      return ack?.({ ok: false, error: "not_a_member" }); // authorization check
    }

    const text = typeof data?.text === "string" ? data.text.trim() : "";
    if (!text) return ack?.({ ok: false, error: "empty" });
    if (text.length > MAX_MESSAGE_LENGTH) {
      return ack?.({ ok: false, error: "too_long" });
    }
    if (!checkRateLimit(socket.id)) {
      return ack?.({ ok: false, error: "rate_limited" });
    }

    const result = await moderateMessage(text);
    if (!result.allowed) {
      socket.emit("moderation_blocked", { reason: result.reason });
      return ack?.({ ok: false, error: "moderated", reason: result.reason });
    }

    const messageId = randomUUID();
    io.to(roomId).emit("message_received", {
      id: messageId,
      senderId: socket.id,
      senderName: anonNames.get(socket.id),
      text,
      sentAt: Date.now(),
    });
    ack?.({ ok: true, id: messageId });
    // Note: message content is relayed only - never written to a log,
    // database, or file, matching the "no message content in logs" rule.
  });

  socket.on("typing", (isTyping) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;
    socket.to(roomId).emit("partner_typing", { isTyping: !!isTyping });
  });

  socket.on("leave_chat", () => {
    const partnerId = leaveRoomEarly(socket.id, "left");
    if (partnerId) {
      io.to(partnerId).emit("partner_left");
    }
  });

  socket.on("block", ({ targetSocketId } = {}) => {
    if (!targetSocketId) return;
    if (!blockedBy.has(socket.id)) blockedBy.set(socket.id, new Set());
    blockedBy.get(socket.id).add(targetSocketId);

    const partnerId = leaveRoomEarly(socket.id, "blocked");
    if (partnerId) io.to(partnerId).emit("partner_left");
  });

  socket.on("report", ({ targetSocketId, category, reason } = {}) => {
    // MVP: log to server console only (operator visibility), never to a
    // transcript store. Wire this to a real Report table (see plan
    // section 9 "Report") once you add a database.
    console.log(
      `[report] from=${socket.id} target=${targetSocketId || "unknown"} category=${category || "other"} reasonProvided=${!!reason}`
    );
    socket.emit("report_received");
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    const partnerId = leaveRoomEarly(socket.id, "disconnected");
    if (partnerId) io.to(partnerId).emit("partner_left");

    anonNames.delete(socket.id);
    messageTimestamps.delete(socket.id);
    blockedBy.delete(socket.id);
  });
});

// Periodic safety-net sweep: closes any room whose endTime has passed but
// whose setTimeout somehow didn't fire (e.g. process was briefly under
// heavy load). Cheap insurance on top of the per-room timer.
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (room.status === "active" && now > room.endTime) {
      expireRoom(roomId, "timeout");
    }
  }
  // Drop queue entries with dead sockets.
  waitingQueue = waitingQueue.filter((e) => io.sockets.sockets.has(e.socketId));
}, 15_000);

server.listen(PORT, () => {
  console.log(`5minchat backend listening on port ${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
