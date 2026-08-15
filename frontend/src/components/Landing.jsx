export default function Landing({ onStart, connectionError }) {
  return (
    <div className="screen landing">
      <div className="landing-inner">
        <p className="eyebrow">5MINCHAT</p>
        <h1>Five minutes with a stranger.</h1>
        <p className="lede">
          No profile. No history. No pressure to keep talking. When the timer
          hits zero, the conversation disappears — for good.
        </p>

        <button className="btn-primary" onClick={onStart}>
          Start a 5-Minute Chat
        </button>

        {connectionError && (
          <p className="error-text">
            Can't reach the server right now. It may be waking up (free-tier
            hosting can take ~30s to spin up) — try again in a moment.
          </p>
        )}

        <div className="principles">
          <div className="principle">
            <span className="dot" />
            Anonymous by default — you get a random name, nothing else
          </div>
          <div className="principle">
            <span className="dot" />
            Five minutes means five minutes — the server enforces it
          </div>
          <div className="principle">
            <span className="dot" />
            Nothing is saved once the chat ends
          </div>
          <div className="principle">
            <span className="dot" />
            Report, block, or leave at any moment
          </div>
        </div>

        <p className="fine-print">
          Some people become memories. Some moments are better forgotten.
        </p>
      </div>
    </div>
  );
}
