export default function Waiting({ onCancel, yourName }) {
  return (
    <div className="screen waiting">
      <div className="waiting-inner">
        <div className="pulse-dot" />
        <p className="you-are">
          You're <strong>{yourName || "…"}</strong>
        </p>
        <h2>Searching for a signal…</h2>
        <p className="lede">This usually takes a few seconds.</p>
        <button className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
