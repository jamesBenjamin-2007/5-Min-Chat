import { useCallback, useState } from "react";
import Feed from "./components/Feed.jsx";
import NewPost from "./components/NewPost.jsx";
import TabBar from "./components/TabBar.jsx";
import ChatApp from "./ChatApp.jsx";

// App shell: three tabs. Chat keeps its own fully independent state
// machine (ChatApp.jsx, unchanged from the standalone version) since it
// has its own screens (landing/waiting/chat/end/friends). Feed and
// NewPost are simpler, so they're plain components here.
export default function App() {
  const [activeTab, setActiveTab] = useState("feed");
  const [feedRefreshSignal, setFeedRefreshSignal] = useState(0);

  const handlePosted = useCallback(() => {
    setFeedRefreshSignal((n) => n + 1);
    setActiveTab("feed");
  }, []);

  return (
    <div className="app-shell">
      <div className="app-content">
        {activeTab === "feed" && <Feed refreshSignal={feedRefreshSignal} />}
        {activeTab === "newpost" && <NewPost onPosted={handlePosted} />}
        {activeTab === "chat" && <ChatApp />}
      </div>
      <TabBar activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}
