# 5minchat — rebuilt

A fresh, working implementation of the 5-Minute Stranger Chat app: anonymous
1:1 matchmaking, a server-enforced 5-minute timer, real-time chat over
Socket.IO, and basic safety tooling (profanity filter, rate limiting,
report/block/leave). Built to deploy exactly the way your plan described —
**backend on Render (free tier), frontend on Vercel.**

## Why the old version probably didn't connect users

Without seeing your original code I can't say for certain, but the classic
reasons a Render+Vercel+Socket.IO setup fails to match people are:

1. **CORS mismatch** — the backend's allowed origin didn't exactly match the
   Vercel URL (including `https://`, no trailing slash, and both the
   `vercel.app` URL *and* your custom domain if you use one).
2. **Wrong backend URL on the frontend** — pointing at `localhost` or an old
   Render URL after a redeploy.
3. **Render free-tier cold starts** — the backend spins down after ~15 min
   idle. The *first* person to arrive wakes it up, but their socket
   connection can time out and fail silently before the second person
   arrives, so they never see each other. (There's a note on handling this
   below.)
4. **Socket.IO version mismatch** between client and server packages.
5. A matchmaking bug where users were queued but the pairing loop never ran,
   or ran but didn't emit to both sockets.

This rebuild fixes all of the above: CORS is explicit and configurable via
one env var, the frontend reads the backend URL from an env var (no
hardcoding), client/server Socket.IO versions are pinned to match, and the
matchmaking loop is straightforward and logged.

## Project structure

```
5minchat/
  backend/     Node + Express + Socket.IO (deploy to Render)
  frontend/    React + Vite (deploy to Vercel)
```

## How matching works

- Everyone who clicks "Start" joins an in-memory waiting queue.
- The server pairs up waiting users (skipping anyone they've blocked or were
  just matched with) and opens a room.
- The **server** sets the 5-minute expiry with `setTimeout` — the countdown
  shown in the browser is just for display. Even if someone's laptop clock
  is wrong or they close dev tools and hack the client, they can't extend
  the session.
- Nothing about the conversation is written to a database or log file —
  messages are relayed socket-to-socket and forgotten once the room closes.

## Local development

**Backend:**
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```
Runs on `http://localhost:4000`.

**Frontend** (in a second terminal):
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
Runs on `http://localhost:5173`. Open two browser tabs (or one normal + one
incognito) and click "Start" in both to test matching with yourself.

## Deploying the backend to Render

1. Push the `backend/` folder to a GitHub repo (or push the whole project
   and set Render's **Root Directory** to `backend`).
2. On Render: **New → Web Service** → connect the repo.
3. Settings:
   - **Root Directory:** `backend` (if using a monorepo)
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Environment variables (Render dashboard → Environment):
   - `FRONTEND_URL` = your Vercel URL(s), comma-separated, e.g.
     `https://5minchat.online,https://www.5minchat.online,https://5minchat.vercel.app`
   - Leave `PORT` unset — Render provides it automatically.
5. Deploy. Once live, visit `https://your-service.onrender.com/health` — you
   should see `{"status":"ok",...}`. If you get a CORS error later, it's
   almost always this `FRONTEND_URL` value being slightly wrong.

**About free-tier cold starts:** Render's free web services sleep after 15
minutes of no traffic and take ~30-50s to wake up on the next request. The
UI already shows a "server may be waking up" message if the initial socket
connection fails. Two ways to reduce how often this bites people:
- A free uptime pinger (e.g. UptimeRobot or cron-job.org) hitting your
  `/health` endpoint every 10 minutes keeps the service warm during the
  hours you expect traffic.
- Or accept the occasional cold start — it's a fine trade-off for a free
  side project, and the app is coded to fail gracefully when it happens.

## Deploying the frontend to Vercel

1. Push `frontend/` to GitHub (or same repo, different root directory).
2. On Vercel: **New Project** → import the repo.
3. Settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (auto-detected)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Environment variable:
   - `VITE_BACKEND_URL` = your Render URL, e.g.
     `https://your-service.onrender.com` (no trailing slash)
5. Deploy. Then add your domain **5minchat.online** under Vercel → Settings →
   Domains, and point its DNS at Vercel per their instructions.
6. **Important:** once your custom domain is live, go back to Render and add
   `https://5minchat.online` (and `https://www.5minchat.online` if you use
   the www version) to `FRONTEND_URL`, then redeploy the backend so CORS
   allows your real domain, not just the `vercel.app` preview URL.

## Safety features included (MVP scope from your plan)

- Anonymous random display names (no accounts, no persistent identity)
- Server-enforced 5-minute session, both sides expire together
- Profanity filter with normalization (catches spacing/leetspeak tricks like
  `f u c k` or `f4ck`) — see `backend/moderation.js`
- Basic personal-info detection (blocks messages containing emails, phone
  numbers, or "add me on [social app]" patterns)
- Per-user message rate limiting (max 8 messages / 10 seconds)
- Report, Block, and Leave, all available mid-chat
- No chat transcripts stored anywhere — not in a database, not in logs

## What's intentionally left as a next step

Per your own plan's "Non-Negotiable Rules," a static word list can't safely
catch hate speech, threats, or harassment — that needs a real classifier.
`moderation.js` has a ready-made hook (`moderateWithExternalAPI`) where you
can plug in OpenAI's Moderation API or Google's Perspective API once you're
ready; it's a ~10 line change and documented inline. Reports currently log
to the server console — wiring them to a real database is the natural next
step once you're past the free-tier MVP stage.
