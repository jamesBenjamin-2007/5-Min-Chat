import { useState } from "react";

const REACTIONS = [
  { value: "smile", label: "Made me smile" },
  { value: "interesting", label: "Interesting person" },
  { value: "helpful", label: "Helpful" },
  { value: "okay", label: "Just okay" },
];

const REASON_MESSAGES = {
  timeout: "Your five minutes are up.",
  left: "You left the conversation.",
  partner_left: "The other person left the conversation.",
  blocked: "You blocked this person. They won't be matched with you again.",
  disconnected: "The connection dropped.",
};

export default function EndScreen({ endReason, onRestart, momentsCount }) {
  const [picked, setPicked] = useState(null);
  const message = REASON_MESSAGES[endReason] || REASON_MESSAGES.timeout;
  const showReaction = endReason === "timeout" || endReason === "left" || endReason === "partner_left";

  return (
    <div className="screen end-screen">
      <div className="end-inner">
        <h2>{message}</h2>
        <p className="lede fine-print">
          Some people become memories. Some moments are better forgotten.
        </p>
        <p className="lede small">No transcript was kept — the conversation is gone.</p>

        {showReaction && !picked && (
          <div className="reactions">
            <p className="reaction-prompt">Was this a good moment? (private, just for you)</p>
            <div className="reaction-options">
              {REACTIONS.map((r) => (
                <button key={r.value} className="reaction-btn" onClick={() => setPicked(r.value)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {picked && <p className="reaction-confirm">Noted — just for you.</p>}

        {typeof momentsCount === "number" && (
          <p className="moments-counter">You've shared {momentsCount} moments.</p>
        )}

        <button className="btn-primary" onClick={onRestart}>
          Start another chat
        </button>
      </div>
    </div>
  );
}
