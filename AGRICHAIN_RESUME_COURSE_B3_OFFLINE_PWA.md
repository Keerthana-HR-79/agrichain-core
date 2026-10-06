# Part B3 — Offline-first / PWA (IndexedDB write-queue + service worker)

> **Group B — NOT on your résumé. 🟡 SET ASIDE.** Study after Group A. **Covers:** why offline matters here · PWA from basics · service worker + manifest · IndexedDB & Dexie · the offline **write-queue** with optimistic UI · auto-sync on reconnect · read caching · the install prompt · honest limits · Q&A.
> **Why Group B:** it's a **resilience/UX layer**, not one of the three résumé bullets. Know the **gist** so you can say *"yes, it works offline and installs like an app"* — and explain the mechanism — **without over-claiming**.

**Framing line if asked:** *"Farmers are often in fields with poor connectivity, so I made the farmer flows offline-tolerant and installable as a PWA. It's not on my résumé, but the mechanism is a classic offline write-queue — happy to explain it."*

---

## B3.0 The 30-second summary

> *"AgriChain is a **PWA** — installable to the home screen, with a **service worker** that caches the app shell so it loads offline. For data, farmers in the field might lose signal mid-update, so text mutations — stage notes and updates — are **queued in IndexedDB** instead of failing. The UI updates **optimistically**, and when the connection returns, a hook **replays the queue in order** against the API, retrying up to three times. Reads fall back to a cached copy. Photo uploads still need a connection — I'm honest about that limit."*

---

## B3.1 🔵 LEARN DEEP — what is a PWA?

**PWA = Progressive Web App:** a website that behaves like a native app — it can be **installed** to the home screen, **launched full-screen**, and **work offline**. It's still just web tech (HTML/JS/CSS); three ingredients make it a PWA:

1. **A web app manifest** — a JSON file (name, icons, colors, display mode) that tells the OS how to "install" the site. AgriChain ships `public/manifest.json`, linked from `index.html`, with `icon-192` and `icon-512`.
2. **A service worker** — a background script the browser runs *separately from the page*; it can intercept network requests and serve cached files, which is what enables offline loading.
3. **HTTPS** — required for service workers (the deployed app is HTTPS on Vercel, Part 9).

> **Say it:** *"A PWA is a web app you can install and use offline. It needs a manifest so the OS can install it, a service worker to serve cached files when there's no network, and HTTPS. AgriChain has all three."*

---

## B3.2 🔵 LEARN DEEP — the service worker (how offline *loading* works)

A **service worker** sits between the app and the network like a programmable proxy. On first visit it **pre-caches** the app's static files; afterwards it can answer requests **from cache** when the network is down, so the app still *opens* offline.

**AgriChain uses `vite-plugin-pwa` (built on Google's Workbox)** to generate the service worker (firsthand, `vite.config.js`):
- **`registerType: "autoUpdate"`** → when a new version deploys, the service worker updates itself automatically.
- **`workbox.globPatterns: ["**/*.{js,css,html,png,svg,ico}"]`** → precache the whole built app shell (all JS/CSS/HTML/icons).
- **`workbox.navigateFallback: "/index.html"`** → the critical SPA detail: AgriChain is a single-page app with client-side routing, so for *any* route the user lands on while offline, the service worker serves `index.html` (the app shell), and React Router takes over. Without this, a deep link offline would 404.
- `devOptions.enabled: false` → the service worker is off in dev (you don't want aggressive caching while coding), on in production.

> **Say it:** *"A service worker is a background proxy that serves cached files when offline. I generate it with vite-plugin-pwa / Workbox — it precaches the built app shell and, because it's an SPA, falls back to index.html for any route so client-side routing still works offline."*

---

## B3.3 🔵 LEARN DEEP — IndexedDB and Dexie (offline *data*)

Service workers cache *files*. For *data* (queued writes, cached lists) you need a client-side database: **IndexedDB** — a browser-built-in database that stores structured data on the device, surviving refreshes and offline periods. IndexedDB's raw API is clunky, so AgriChain uses **Dexie.js**, a thin, friendly wrapper.

**The schema (firsthand, `db.js`)** — one database `AgriChainOfflineDB`, version 1, four stores:
```js
db.version(1).stores({
  pendingMutations: "++id, type, url, method, createdAt, status", // the write-queue
  cachedListings:   "id, updatedAt",   // marketplace data for offline reading
  cachedStages:     "id, listing_id, updatedAt",
  cachedUser:       "id",
});
```

> **Say it:** *"Files are cached by the service worker; data lives in IndexedDB, which I access through Dexie. I have four stores — a pending-mutations queue plus cached listings, stages, and user."*

---

## B3.4 🔵 The offline write-queue + optimistic UI (the clever bit)

This is the heart of B3 — the pattern worth being able to draw.

**The flow (firsthand, `offlineApi.js`):** mutation functions (`addStageUpdate`, `updateListingNotes`) check `navigator.onLine`:
- **Online** → call the API normally (and update the cache).
- **Offline** → `queueMutation(...)` saves the request to `pendingMutations` and **returns an optimistic response** — a fake-but-believable success with a temporary `offline-<timestamp>` id, so the farmer **sees their update immediately**, as if it saved.

**What gets queued (firsthand, `offlineQueue.js`):** each row stores `type`, `url`, `method`, `data` (JSON-stringified), `headers`, `status: "pending"`, `retries: 0`, and a `createdAt` timestamp.

**🔵 "Optimistic UI"** = assume success and update the screen *before* the server confirms, reconciling later. It makes the app feel instant and is the right pattern when the write will almost certainly succeed once connectivity returns.

> **Say it:** *"For field writes I check navigator.onLine. Offline, I save the request to an IndexedDB queue and return an optimistic success so the farmer's note appears instantly. Online, it just hits the API. The queue row keeps the method, URL, body, a timestamp, and a retry count."*

---

## B3.5 🔵 The sync-on-reconnect loop (firsthand)

**Trigger — `useOnlineStatus` hook (`useOnlineStatus.js`):**
- Listens to the browser's **`online` / `offline` events** and tracks `navigator.onLine`.
- When the connection is **restored**, it waits **1.5 seconds** (to let the connection stabilize) then calls `syncQueue()` automatically.
- Also polls the pending count every 10 s and exposes `{ isOnline, isSyncing, pendingCount, syncNow }` — a `SyncStatusBar` component shows this to the user, and `syncNow` allows a manual sync.

**Replay — `syncQueue()` (`offlineQueue.js`):**
- Reads all pending mutations **sorted by `createdAt`** → replays them **in the original order** (important: a stage note must apply after the stage exists).
- For each, re-attaches the **current** JWT from localStorage (the queued token might be stale), fires the real `axios` request, and on success marks it `synced`.
- **On failure → retry, up to 3 times**; after the 3rd failure the row is marked `failed` (gives up, doesn't block the rest).
- `clearSyncedMutations()` housekeeps the synced rows afterward.

```
offline write ──▶ IndexedDB queue (status: pending, retries: 0)
      │
   [connection returns]  window 'online' event ──▶ wait 1.5s
      │
      ▼
 syncQueue(): for each pending (oldest first)
     try  → axios(real request with fresh JWT) → status: synced
     catch→ retries++  (≥3 → status: failed)
```

> **Say it (interview gold):** *"A React hook listens for the browser's online event; on reconnect it waits a moment, then replays the queue oldest-first against the real API, re-attaching the current token. Each mutation retries up to three times before it's marked failed, so one bad write doesn't block the rest. It's deterministic replay — timestamp-ordered."*

---

## B3.6 Read caching (offline *viewing*)

Beyond queuing writes, reads degrade gracefully (firsthand, `offlineApi.js` + `offlineQueue.js`):
- `fetchListings` / `fetchStages`: if offline (or the network call throws), return **cached** data from IndexedDB with a `fromCache: true` flag; if online, fetch fresh **and** refresh the cache (`cacheListings` / `cacheStages` via Dexie `bulkPut`).
- So a farmer can **open the app and read** their listings/stages even with no signal, as long as they'd loaded them once before.

> **Say it:** *"Reads cache to IndexedDB on every successful fetch, so offline the app serves the last-known listings and stages with a 'from cache' flag instead of a blank screen."*

---

## B3.7 The install prompt (firsthand, `InstallPrompt.jsx`)

- The browser fires a **`beforeinstallprompt`** event when the site is installable. AgriChain captures it, prevents the default mini-banner, and shows its **own** "Install AgriChain — add to home screen" card.
- If the user accepts, it calls the saved event's `.prompt()`; if they dismiss, it stores `pwa_install_dismissed` in localStorage so it **won't nag again**. Never shows on desktop or if already installed.

> **Say it:** *"I intercept the beforeinstallprompt event and show a custom 'add to home screen' banner, and remember a dismissal in localStorage so it doesn't nag."*

---

## B3.8 ⚠️ HONEST LIMITS (volunteer these)

- **Photos need a connection.** Only **text** mutations (stage notes/updates) are offline-capable. `File` objects can't be reliably serialized into IndexedDB across browsers, so photo uploads require internet — and the app shows a clear message saying so. *(This is firsthand and the honest headline for B3.)*
- **No conflict resolution.** The queue is **last-write-wins** on replay — it assumes the offline change is still valid when it syncs. There's no merge/conflict handling if the server state changed meanwhile.
- **"Failed" is terminal.** After 3 retries a mutation is marked `failed` and left for the user; there's no exponential backoff or dead-letter re-drive beyond that.
- **Optimistic ≠ guaranteed.** The optimistic success could later fail to sync; it's the right UX trade-off for field use, but it's not a promise the write persisted.

> **Say it:** *"The honest limits: photos still need a connection because you can't reliably store File objects in IndexedDB; replay is last-write-wins with no conflict merge; and after three failed retries a mutation is parked for the user. For field text updates it's solid; those are the edges."*

---

## B3.9 How it connects to the rest of AgriChain

- The offline writes are the **crop-stage updates** that feed GPS verification (Part 6) and, in turn, unlock **escrow milestones** (Part 7) — so offline tolerance protects the exact field actions that matter most.
- It reuses the same **JWT** (Part 3) — the queue re-attaches a fresh token on replay.
- It's **additive**: with a connection, nothing about the core flow changes; offline just prevents data loss.

---

## B3.10 Questions you might get (with answers)

**Q: What makes it a PWA?**
> *"A web app manifest so it can be installed, a service worker that serves cached files offline, and HTTPS. It installs to the home screen and opens offline."*

**Q: How does the app load with no network?**
> *"The service worker — generated by vite-plugin-pwa/Workbox — precaches the built app shell and falls back to index.html for any route, so the SPA still boots and routes client-side offline."*

**Q: How do offline writes work?**
> *"I check navigator.onLine. Offline, I save the request to an IndexedDB queue via Dexie and return an optimistic success so the UI updates instantly. On reconnect a hook replays the queue oldest-first against the API."*

**Q: What's optimistic UI?**
> *"Updating the screen as if the write succeeded, before the server confirms, then reconciling on sync. It makes the app feel instant for field use."*

**Q: What happens if a queued write fails to sync?**
> *"It retries up to three times, then it's marked failed and surfaced to the user — it doesn't block the other queued writes."*

**Q: Why IndexedDB and not localStorage?**
> *"localStorage is tiny and string-only; IndexedDB is a real structured database for larger, queryable data like a mutation queue and cached lists. Dexie makes its API pleasant."*

**Q: Can you upload a photo offline?**
> *"No — that's the honest limit. File objects don't serialize reliably into IndexedDB, so photos need a connection; the app tells the user that clearly. Text updates queue fine."*

**Q: Do you handle sync conflicts?**
> *"It's last-write-wins on replay — no merge. For the field-note use case that's acceptable; a production version would add versioning/conflict resolution."*

**Q: Is this on your résumé?**
> *"No — it's a resilience layer on top of the core. I can explain the write-queue mechanism, but I kept the résumé to the full-stack and escrow work."*

---

### ⚠️ HONEST LIMITS recap
- Photos need internet (File can't serialize to IndexedDB); text mutations queue.
- Last-write-wins, no conflict resolution.
- 3 retries then "failed"; optimistic success isn't a persistence guarantee.

---

### Next: Part B4 — Extras (notifications, disputes/admin, reviews, monitor) + consolidated Group-B Q&A and how to talk about Group B.
