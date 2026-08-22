const TABS = [
  { id: "feed", label: "Feed", icon: "▦" },
  { id: "newpost", label: "Post", icon: "+" },
  { id: "chat", label: "5-Min Chat", icon: "◔" },
];

export default function TabBar({ activeTab, onChange }) {
  return (
    <nav className="tab-bar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
