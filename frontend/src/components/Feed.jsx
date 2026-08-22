import { useEffect, useState } from "react";
import { getOrCreatePersistentId } from "../identity.js";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Feed({ refreshSignal }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const persistentId = getOrCreatePersistentId();

  async function loadFeed() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/posts`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "failed");
      setPosts(data.posts || []);
    } catch (e) {
      setError(
        e.message === "feed_not_configured"
          ? "The feed isn't set up yet - see README for Supabase setup."
          : "Couldn't load the feed right now."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeed();
  }, [refreshSignal]);

  async function toggleLike(postId) {
    // optimistic update
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const already = (p.likes || []).includes(persistentId);
        const likes = already
          ? p.likes.filter((id) => id !== persistentId)
          : [...(p.likes || []), persistentId];
        return { ...p, likes };
      })
    );
    try {
      await fetch(`${BACKEND_URL}/api/posts/${postId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persistentId }),
      });
    } catch {
      // silently ignore - optimistic UI already reflects intent; a manual
      // refresh will correct any drift if the request actually failed
    }
  }

  if (loading && posts.length === 0) {
    return (
      <div className="feed-screen">
        <p className="chat-hint">Loading feed…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="feed-screen">
        <p className="error-text">{error}</p>
        <button className="btn-secondary" onClick={loadFeed}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="feed-screen">
      <div className="feed-header">
        <h2>Feed</h2>
        <button className="link-btn" onClick={loadFeed}>
          Refresh
        </button>
      </div>

      {posts.length === 0 && (
        <p className="chat-hint">No posts yet. Be the first to share something.</p>
      )}

      <div className="post-list">
        {posts.map((post) => {
          const liked = (post.likes || []).includes(persistentId);
          return (
            <div key={post.id} className="post-card">
              <div className="post-header">
                <span className="post-username">{post.username}</span>
                <span className="post-time">{timeAgo(post.created_at)}</span>
              </div>
              <img className="post-image" src={post.image_url} alt="" loading="lazy" />
              {post.caption && <p className="post-caption">{post.caption}</p>}
              <div className="post-actions">
                <button
                  className={`like-btn ${liked ? "liked" : ""}`}
                  onClick={() => toggleLike(post.id)}
                >
                  {liked ? "♥" : "♡"} {(post.likes || []).length}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
