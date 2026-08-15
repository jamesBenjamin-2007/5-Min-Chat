import { useCallback, useEffect, useState } from "react";
import { socket } from "./socket";
import Landing from "./components/Landing.jsx";
import Waiting from "./components/Waiting.jsx";
import ChatRoom from "./components/ChatRoom.jsx";
import EndScreen from "./components/EndScreen.jsx";

const MOMENTS_KEY = "5minchat_moments_count";

function getMomentsCount() {
  const raw = localStorage.getItem(MOMENTS_KEY);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

function bumpMomentsCount() {
  const next = getMomentsCount() + 1;
  localStorage.setItem(MOMENTS_KEY, String(next));
  return next;
}

// view: "landing" | "waiting" | "chat" | "end"
export default function App() {
  const [view, setView] = useState("landing");
  const [yourName, setYourName] = useState(null);
  const [session, setSession] = useState(null);
  const [endReason, setEndReason] = useState(null);
  const [connectionError, setConnectionError] = useState(false);
  const [momentsCount, setMomentsCount] = useState(getMomentsCount());

  useEffect(() => {
    function handleConnected({ anonName }) {
      setYourName(anonName);
      setConnectionError(false);
    }
    function handleConnectError() {
      setConnectionError(true);
    }
    function handleMatchFound(payload) {
      setSession({
        roomId: payload.roomId,
        endTime: payload.endTime,
        yourName: payload.yourName,
        partnerName: payload.partnerName,
        partnerSocketId: payload.partnerSocketId,
      });
      setView("chat");
    }

    socket.on("connected", handleConnected);
    socket.on("connect_error", handleConnectError);
    socket.on("match_found", handleMatchFound);

    socket.connect();

    return () => {
      socket.off("connected", handleConnected);
      socket.off("connect_error", handleConnectError);
      socket.off("match_found", handleMatchFound);
    };
  }, []);

  const handleStart = useCallback(() => {
    if (!socket.connected) socket.connect();
    setView("waiting");
    socket.emit("find_match");
  }, []);

  const handleCancelWaiting = useCallback(() => {
    socket.emit("cancel_match");
    setView("landing");
  }, []);

  const handleSessionEnd = useCallback(({ reason }) => {
    setEndReason(reason);
    if (reason === "timeout" || reason === "left" || reason === "partner_left") {
      setMomentsCount(bumpMomentsCount());
    }
    setSession(null);
    setView("end");
  }, []);

  const handleRestart = useCallback(() => {
    setView("landing");
  }, []);

  return (
    <>
      {view === "landing" && (
        <Landing onStart={handleStart} connectionError={connectionError} />
      )}
      {view === "waiting" && (
        <Waiting onCancel={handleCancelWaiting} yourName={yourName} />
      )}
      {view === "chat" && session && (
        <ChatRoom session={session} onSessionEnd={handleSessionEnd} />
      )}
      {view === "end" && (
        <EndScreen
          endReason={endReason}
          onRestart={handleRestart}
          momentsCount={momentsCount}
        />
      )}
    </>
  );
}
