// Lightweight, account-free identity shared across the whole app (chat,
// friends, and the feed). A random ID generated once per browser and
// stored in localStorage - not a real login. See README for the
// trade-offs of this approach (no password, but also no way to prove a
// username "belongs" to someone, and it resets if site data is cleared).
export const PERSISTENT_ID_KEY = "5minchat_persistent_id";
export const USERNAME_KEY = "5minchat_username";

export function getOrCreatePersistentId() {
  let id = localStorage.getItem(PERSISTENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PERSISTENT_ID_KEY, id);
  }
  return id;
}

export function getUsername() {
  return localStorage.getItem(USERNAME_KEY) || "";
}

export function getDisplayName() {
  return getUsername().trim() || "Anonymous";
}
