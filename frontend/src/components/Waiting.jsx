export default function Waiting({ onCancel, yourName }) {
  return (
    <div className="screen waiting">
      <div className="waiting-inner">
        <div className="pulse-ring">
          <div className="pulse-core" />
        </div>
        <p className="you-are">
          You're <strong>{yourName || "…"}</strong>
        </p>
        <h2>Looking for a stranger…</h2>
        <p className="lede">This usually takes a few seconds.</p>
        <button className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
