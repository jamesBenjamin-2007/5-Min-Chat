export default function Landing({
  onStart,
  connectionError,
  usernameDraft,
  onUsernameChange,
  usernameError,
  onOpenFriends,
}) {
  return (
    <div className="screen landing">
      <div className="landing-inner">
        <p className="eyebrow">5MINCHAT</p>
        <h1>Five minutes with a stranger.</h1>
        <p className="lede">
          No profile. No history. No pressure to keep talking. When the timer
          hits zero, the conversation disappears — for good.
        </p>

        <div className="username-field">
          <label htmlFor="username-input">Your display name (optional)</label>
          <input
            id="username-input"
            type="text"
            value={usernameDraft}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder="Leave blank for a random name"
            maxLength={20}
          />
          {usernameError && <p className="error-text small">{usernameError}</p>}
        </div>

        <button className="btn-primary" onClick={onStart}>
          Start a 5-Minute Chat
        </button>

        <button className="link-btn friends-link" onClick={onOpenFriends}>
          My Friends
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
            Anonymous by default — pick a name or get a random one
          </div>
          <div className="principle">
            <span className="dot" />
            Five minutes means five minutes — the server enforces it
          </div>
          <div className="principle">
            <span className="dot" />
            Nothing is saved on our end once the chat ends
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
