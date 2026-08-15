import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

// autoConnect: false so App.jsx controls exactly when we connect (avoids
// opening a socket before the user has even seen the landing page, and
// makes reconnect-on-mistake easier to reason about).
export const socket = io(BACKEND_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"], // falls back to polling if a proxy blocks websockets
  reconnectionAttempts: 8,
  reconnectionDelay: 1000,
});
