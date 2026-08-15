import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../socket";

const REPORT_CATEGORIES = [
  { value: "harassment", label: "Harassment" },
  { value: "hate", label: "Hate / abuse" },
  { value: "sexual", label: "Sexual content" },
  { value: "threats", label: "Threats" },
  { value: "spam", label: "Spam / scam" },
  { value: "personal_info", label: "Asked for personal info" },
  { value: "other", label: "Other" },
];

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ChatRoom({ session, onSessionEnd }) {
  const { roomId, endTime, yourName, partnerName, partnerSocketId } = session;

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [remainingMs, setRemainingMs] = useState(endTime - Date.now());
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [moderationNotice, setModerationNotice] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("harassment");
  const [reportSent, setReportSent] = useState(false);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Server-authoritative countdown - purely cosmetic re-render every 250ms,
  // the backend is the one that actually closes the room at endTime.
  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingMs(Math.max(0, endTime - Date.now()));
    }, 250);
    return () => clearInterval(interval);
  }, [endTime]);

  useEffect(() => {
    function handleMessage(msg) {
      setMessages((prev) => [...prev, msg]);
    }
    function handlePartnerTyping({ isTyping }) {
      setPartnerTyping(isTyping);
    }
    function handleModerationBlocked({ reason }) {
      setModerationNotice(
        reason === "personal_info"
          ? "That message looked like it contained contact info, so it wasn't sent. For safety, don't exchange personal details here."
          : "That message wasn't sent — it didn't meet the chat's content guidelines."
      );
      setTimeout(() => setModerationNotice(null), 4000);
    }
    function handlePartnerLeft() {
      onSessionEnd({ reason: "partner_left" });
    }
    function handleSessionExpired({ reason }) {
      onSessionEnd({ reason: reason || "timeout" });
    }

    socket.on("message_received", handleMessage);
    socket.on("partner_typing", handlePartnerTyping);
    socket.on("moderation_blocked", handleModerationBlocked);
    socket.on("partner_left", handlePartnerLeft);
    socket.on("session_expired", handleSessionExpired);

    return () => {
      socket.off("message_received", handleMessage);
      socket.off("partner_typing", handlePartnerTyping);
      socket.off("moderation_blocked", handleModerationBlocked);
      socket.off("partner_left", handlePartnerLeft);
      socket.off("session_expired", handleSessionExpired);
    };
  }, [onSessionEnd]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, partnerTyping]);

  const isExpired = remainingMs <= 0;
  const timeLabel = useMemo(() => formatTime(remainingMs), [remainingMs]);
  const isUrgent = remainingMs < 30_000;

  function sendMessage(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isExpired) return;

    socket.emit("send_message", { text }, (res) => {
      if (!res?.ok && res?.error === "rate_limited") {
        setModerationNotice("You're sending messages a little too fast — slow down for a moment.");
        setTimeout(() => setModerationNotice(null), 4000);
      }
    });
    setDraft("");
    socket.emit("typing", false);
  }

  function handleDraftChange(e) {
    setDraft(e.target.value);
    socket.emit("typing", true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => socket.emit("typing", false), 1500);
  }

  function handleLeave() {
    socket.emit("leave_chat");
    onSessionEnd({ reason: "left" });
  }

  function handleBlock() {
    socket.emit("block", { targetSocketId: partnerSocketId });
    onSessionEnd({ reason: "blocked" });
  }

  function submitReport() {
    socket.emit("report", { targetSocketId: partnerSocketId, category: reportCategory });
    setReportSent(true);
    setTimeout(() => {
      setReportOpen(false);
      setReportSent(false);
    }, 1200);
  }

  return (
    <div className="screen chat-room">
      <div className="chat-header">
        <div className="partner-label">
          Chatting with <strong>{partnerName}</strong>
        </div>
        <div className={`timer ${isUrgent ? "urgent" : ""}`}>{timeLabel}</div>
      </div>

      <div className="chat-actions">
        <button className="link-btn" onClick={() => setReportOpen(true)}>
          Report
        </button>
        <button className="link-btn" onClick={handleBlock}>
          Block
        </button>
        <button className="link-btn danger" onClick={handleLeave}>
          Leave
        </button>
      </div>

      <div className="messages">
        {messages.length === 0 && (
          <p className="chat-hint">Say hi to {partnerName}. You've got five minutes.</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`bubble ${m.senderName === yourName ? "mine" : "theirs"}`}
          >
            {m.text}
          </div>
        ))}
        {partnerTyping && <div className="typing-indicator">{partnerName} is typing…</div>}
        <div ref={messagesEndRef} />
      </div>

      {moderationNotice && <div className="moderation-toast">{moderationNotice}</div>}

      <form className="composer" onSubmit={sendMessage}>
        <input
          type="text"
          value={draft}
          onChange={handleDraftChange}
          placeholder={isExpired ? "Time's up" : "Type a message…"}
          maxLength={500}
          disabled={isExpired}
          autoFocus
        />
        <button type="submit" className="btn-primary small" disabled={isExpired || !draft.trim()}>
          Send
        </button>
      </form>

      {reportOpen && (
        <div className="modal-backdrop" onClick={() => setReportOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {reportSent ? (
              <p>Thanks — your report has been sent.</p>
            ) : (
              <>
                <h3>Report this conversation</h3>
                <p className="modal-sub">What happened?</p>
                <div className="report-options">
                  {REPORT_CATEGORIES.map((c) => (
                    <label key={c.value} className="report-option">
                      <input
                        type="radio"
                        name="category"
                        value={c.value}
                        checked={reportCategory === c.value}
                        onChange={() => setReportCategory(c.value)}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
                <div className="modal-buttons">
                  <button className="btn-secondary" onClick={() => setReportOpen(false)}>
                    Cancel
                  </button>
                  <button className="btn-primary small" onClick={submitReport}>
                    Submit report
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
