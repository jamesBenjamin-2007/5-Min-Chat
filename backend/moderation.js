/**
 * moderation.js
 * -----------------------------------------------------------------------
 * Level 1 (profanity) + Level 2 (obfuscation detection) moderation.
 *
 * IMPORTANT per the project's own design doc (section 14 & "Non-Negotiable
 * Rules"): a static word list can NEVER safely cover hate speech, threats,
 * harassment, sexual exploitation, or doxxing attempts. Those require a
 * real semantic/classifier-based moderation service (Level 3).
 *
 * This file gives you:
 *   1. A working normalizer that defeats common bypass tricks
 *      (spacing, symbols, repeated letters, leetspeak).
 *   2. A small, editable list of common profanity (NOT slurs/hate terms -
 *      you should not ship a static slur list; use an external API instead).
 *   3. A ready-made hook (moderateWithExternalAPI) to plug in a real
 *      moderation provider (OpenAI Moderation API, Perspective API, etc.)
 *      for the serious stuff. This is a few lines to wire up - see the
 *      README for instructions.
 *   4. Basic personal-info detection (emails, phone numbers) so people
 *      can't be pressured into handing out contact details.
 * -----------------------------------------------------------------------
 */

// Edit / extend this list freely. Keep it to profanity - route hate speech,
// slurs, threats, and sexual-exploitation detection to the external API hook
// below rather than trying to enumerate them here.
const BLOCKED_WORDS = [
  "fuck", "shit", "bitch", "asshole", "bastard", "dick", "pussy",
  "cunt", "whore", "slut", "cock", "faggot", "retard", "nigger",
];
// (A short seed list is included above for out-of-the-box functionality.
// For production, swap in a maintained, configurable blocklist and/or the
// external moderation hook - see README "Moderation" section.)

const LEET_MAP = {
  "0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a",
  "5": "s", "$": "s", "7": "t", "+": "t", "8": "b", "9": "g",
};

const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_REGEX = /(\+?\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}/;
const SOCIAL_HANDLE_REGEX = /(instagram|insta|snap(chat)?|whats?app|telegram|kik|discord)\s*[:@]?\s*[\w.]{2,}/i;

/**
 * Collapse common bypass tricks into a canonical form:
 * - lowercase + unicode normalize
 * - strip diacritics (é -> e)
 * - leetspeak substitution (n1gg3r -> nigger)
 * - remove non-letter separators inserted between letters (f.u.c.k -> fuck, f u c k -> fuck)
 * - collapse 3+ repeated characters (fuuuuuck -> fuck)
 */
function normalizeText(raw) {
  let text = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, ""); // strip accents

  // leetspeak substitution
  text = text
    .split("")
    .map((ch) => LEET_MAP[ch] ?? ch)
    .join("");

  // remove characters inserted purely to break up a word (spaces, dots,
  // dashes, underscores, asterisks between single letters)
  text = text.replace(/([a-z])[\s._*\-]+(?=[a-z])/g, "$1");

  // collapse 3+ repeated letters down to 1 (soooo -> so, fuuuck -> fuck)
  text = text.replace(/([a-z])\1{2,}/g, "$1");

  return text;
}

function containsBlockedWord(normalized) {
  return BLOCKED_WORDS.some((word) => normalized.includes(word));
}

function containsPersonalInfoRequest(raw) {
  return (
    EMAIL_REGEX.test(raw) ||
    PHONE_REGEX.test(raw) ||
    SOCIAL_HANDLE_REGEX.test(raw)
  );
}

/**
 * OPTIONAL: wire up a real moderation provider here for Level 3 coverage
 * (threats, harassment, hate speech, sexual content, etc). Example using
 * OpenAI's moderation endpoint is sketched in the README. Left as a no-op
 * stub so the app works out of the box with zero extra API keys.
 */
async function moderateWithExternalAPI(_text) {
  if (!process.env.MODERATION_PROVIDER_KEY) return { flagged: false };
  // Example (uncomment + adapt once you have a key):
  //
  // const res = await fetch("https://api.openai.com/v1/moderations", {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     Authorization: `Bearer ${process.env.MODERATION_PROVIDER_KEY}`,
  //   },
  //   body: JSON.stringify({ input: _text }),
  // });
  // const json = await res.json();
  // return { flagged: json.results?.[0]?.flagged ?? false };
  return { flagged: false };
}

/**
 * Main entry point. Returns:
 *   { allowed: boolean, reason: string|null }
 */
async function moderateMessage(raw) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { allowed: false, reason: "empty" };
  }

  const normalized = normalizeText(raw);

  if (containsBlockedWord(normalized)) {
    return { allowed: false, reason: "profanity" };
  }

  if (containsPersonalInfoRequest(raw)) {
    return { allowed: false, reason: "personal_info" };
  }

  const external = await moderateWithExternalAPI(raw);
  if (external.flagged) {
    return { allowed: false, reason: "flagged" };
  }

  return { allowed: true, reason: null };
}

/**
 * Username validation - separate from message moderation since usernames
 * have different rules (no personal-info regex needed, but stricter
 * charset + length limits, since these are shown persistently and used
 * as a friend-list display name).
 * Returns { allowed: boolean, reason: string|null }
 */
function moderateUsername(raw) {
  if (typeof raw !== "string") return { allowed: false, reason: "invalid" };
  const trimmed = raw.trim();

  if (trimmed.length < 2) return { allowed: false, reason: "too_short" };
  if (trimmed.length > 20) return { allowed: false, reason: "too_long" };

  // Keep it to letters, numbers, spaces, underscores, hyphens - blocks
  // impersonation tricks using lookalike unicode characters, emoji spam,
  // and zero-width characters used to bypass filters.
  if (!/^[a-zA-Z0-9 _-]+$/.test(trimmed)) {
    return { allowed: false, reason: "invalid_characters" };
  }

  const normalized = normalizeText(trimmed);
  if (containsBlockedWord(normalized)) {
    return { allowed: false, reason: "profanity" };
  }

  // Block usernames that look like they're impersonating the app itself
  // or staff - a common social-engineering trick.
  const impersonationTerms = ["admin", "moderator", "support", "5minchat", "official"];
  if (impersonationTerms.some((term) => normalized.includes(term))) {
    return { allowed: false, reason: "impersonation" };
  }

  return { allowed: true, reason: null };
}

module.exports = { moderateMessage, moderateUsername, normalizeText };
