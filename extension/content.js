// Content script: finds video tiles on YouTube, asks the service worker to classify them,
// and paints a colored box + label on each tile.
(() => {
  const BATCH_SIZE = 12;
  const MAX_IN_FLIGHT = 3;
  const NEAR_VIEWPORT_PX = 1200; // only spend quota on tiles the user is about to see

  // Tile containers across the home grid, watch-page sidebar, search results and shelves.
  const TILE_SELECTOR = [
    "ytd-rich-item-renderer",
    "ytd-compact-video-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "yt-lockup-view-model",
    "ytm-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model-v2",
    "ytd-ad-slot-renderer",
    "#player-ads",
  ].join(",");
  const AD_SELECTOR =
    "ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, ytd-promoted-video-renderer, [class*='ad-badge'], badge-shape[aria-label='Sponsored']";
  const DOM_AD = { category: "ad", confidence: 1, source: "dom" };
  const FALLBACK_AD_STYLE = { label: "Ad", color: "#0d9488", mode: "box" };

  let settings = Sloppy.normalize(null);
  let results = new Map(); // videoId -> result, for the current category set
  const queue = new Map(); // videoId -> video payload
  let generation = 0; // bumped when categories change; stale responses are dropped
  let inFlight = 0;
  let retryDelay = 0;
  let retryAt = 0;
  let lastError = null;
  let dead = false;

  // After the extension is reloaded or updated, this old copy can no longer talk to it.
  const alive = () => !dead && !!chrome.runtime?.id;

  // ---------- extraction ----------

  function videoIdFrom(href) {
    if (!href) return null;
    const m = href.match(/[?&]v=([\w-]{11})/) || href.match(/\/shorts\/([\w-]{11})/);
    return m ? m[1] : null;
  }

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const linkOf = (tile) => tile.querySelector("a[href*='/watch?v='], a[href*='/shorts/']");

  function extract(tile, id, link) {
    const titleEl = tile.querySelector(
      "#video-title, [class*='lockup-metadata-view-model'][class*='__title'], [class*='LockupMetadataViewModelTitle'], h3 a, h3, [class*='shortsLockupViewModelHostMetadataTitle']"
    );
    const title = clean(titleEl?.getAttribute("title") || titleEl?.textContent || link.getAttribute("title"));
    if (!title) return null; // not rendered yet

    const channelEl = tile.querySelector("ytd-channel-name #text, ytd-channel-name a, a[href^='/@']");
    const lines = [...new Set((tile.innerText || "").split("\n").map(clean).filter(Boolean))]
      .filter((l) => l !== title)
      .slice(0, 8);
    const channel = clean(channelEl?.textContent) || lines[0] || "";
    return { id, title, channel, meta: lines.filter((l) => l !== channel).join(" | ") };
  }

  // ---------- painting ----------

  function styleFor(category) {
    if (category === "ad" && !settings.categories.some((c) => c.id === "ad")) return FALLBACK_AD_STYLE;
    return Sloppy.lookup(settings, category);
  }

  function paint(tile, r) {
    const cat = styleFor(r.category);
    tile.dataset.sloppyState = "done";
    tile.dataset.sloppyCat = r.category;
    tile.dataset.sloppyMode = settings.enabled ? cat.mode : "off";
    tile.dataset.sloppyLow = r.source !== "dom" && r.confidence < settings.lowConfidence ? "1" : "0";
    tile.style.setProperty("--sloppy-color", cat.color);
    const pct = settings.showConfidence && r.source !== "dom" ? ` ${Math.round(r.confidence * 100)}%` : "";
    const bait = settings.showBait && r.category !== "clickbait" && r.clickbait >= 0.75 ? " ⚡bait" : "";
    tile.dataset.sloppyLabel = `${cat.label}${pct}${bait}`;
    if (r.probabilities) {
      const top = Object.entries(r.probabilities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, p]) => `${styleFor(k).label} ${Math.round(p * 100)}%`)
        .join(" · ");
      tile.dataset.sloppyTip = top + (r.clickbait != null ? ` · bait title ${Math.round(r.clickbait * 100)}%` : "");
    } else {
      delete tile.dataset.sloppyTip;
    }
  }

  function markPending(tile) {
    tile.dataset.sloppyState = "pending";
    tile.dataset.sloppyMode = settings.enabled ? "box" : "off";
  }

  function clearTile(tile) {
    for (const k of ["sloppyState", "sloppyCat", "sloppyMode", "sloppyLow", "sloppyLabel", "sloppyTip", "sloppyVid"])
      delete tile.dataset[k];
    tile.style.removeProperty("--sloppy-color");
  }

  function repaintAll() {
    document.querySelectorAll("[data-sloppy-vid]").forEach((tile) => {
      const vid = tile.dataset.sloppyVid;
      const r = vid === "ad" ? DOM_AD : results.get(vid);
      if (r) paint(tile, r);
      else if (tile.dataset.sloppyState !== "waiting") markPending(tile);
    });
  }

  // ---------- scanning ----------

  function nearViewport(tile) {
    const r = tile.getBoundingClientRect();
    return r.bottom > -NEAR_VIEWPORT_PX && r.top < innerHeight + NEAR_VIEWPORT_PX;
  }

  function scan() {
    if (!alive()) return shutdown();
    for (const tile of document.querySelectorAll(TILE_SELECTOR)) {
      // A lockup nested inside a rich-item is the same video; paint the outer tile only.
      if (tile.parentElement?.closest(TILE_SELECTOR)) continue;

      if (tile.id === "player-ads" || tile.matches(AD_SELECTOR) || tile.querySelector(AD_SELECTOR)) {
        // Ad wrappers are often display:contents or zero-height; box the first element with a size.
        let target = tile;
        while (target && !target.getBoundingClientRect().height) target = target.firstElementChild;
        if (target && target.dataset.sloppyVid !== "ad") {
          target.dataset.sloppyVid = "ad";
          paint(target, DOM_AD);
        }
        continue;
      }

      const link = linkOf(tile);
      const id = videoIdFrom(link?.getAttribute("href"));
      if (!id) continue;
      if (tile.dataset.sloppyVid === id) continue; // already handled; YouTube didn't recycle it

      const known = results.get(id);
      if (known) {
        clearTile(tile);
        tile.dataset.sloppyVid = id;
        paint(tile, known);
        continue;
      }
      if (!nearViewport(tile)) continue; // picked up by a later scan as the user scrolls

      // New tile, or YouTube recycled this element for a different video.
      clearTile(tile);
      const video = extract(tile, id, link);
      if (!video) continue;
      tile.dataset.sloppyVid = id;
      markPending(tile);
      queue.set(id, video);
    }
    pump();
  }

  function backoff() {
    retryDelay = Math.min(retryDelay ? retryDelay * 2 : 2000, 60000);
    retryAt = Date.now() + retryDelay;
  }

  function pump() {
    if (Date.now() < retryAt || !settings.enabled) return;
    while (queue.size && inFlight < MAX_IN_FLIGHT) {
      const batch = [...queue.values()].slice(0, BATCH_SIZE);
      batch.forEach((v) => queue.delete(v.id));
      const gen = generation;
      inFlight++;
      chrome.runtime
        .sendMessage({ type: "classify", videos: batch })
        .then((resp) => {
          if (gen !== generation) return; // categories changed while this was in flight
          lastError = resp?.error || null;
          for (const [id, r] of Object.entries(resp?.results || {})) {
            results.set(id, r);
            document.querySelectorAll(`[data-sloppy-vid="${id}"]`).forEach((t) => paint(t, r));
          }
          // Failed videos stay pending and are retried with backoff, so an outage
          // doesn't make every tile flash on and off.
          const failed = batch.filter((v) => !results.has(v.id));
          if (failed.length) {
            failed.forEach((v) => {
              queue.set(v.id, v);
              // Drop the dashed "pending" box while we wait; the tile looks normal until labeled.
              document.querySelectorAll(`[data-sloppy-vid="${v.id}"]`).forEach((t) => (t.dataset.sloppyState = "waiting"));
            });
            backoff();
          } else {
            retryDelay = 0;
          }
        })
        .catch((e) => {
          if (!alive()) return shutdown();
          lastError = String(e?.message || e);
          if (gen === generation) batch.forEach((v) => queue.set(v.id, v));
          document.querySelectorAll("[data-sloppy-state='pending']").forEach((t) => (t.dataset.sloppyState = "waiting"));
          backoff();
        })
        .finally(() => {
          inFlight--;
          if (alive()) pump();
        });
    }
  }

  let scanTimer = null;
  function scheduleScan(delay = 250) {
    if (scanTimer || dead) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, delay);
  }

  // ---------- lifecycle ----------

  let observer = null;
  let interval = null;
  const onScroll = () => scheduleScan(150);

  function shutdown() {
    if (dead) return;
    dead = true;
    observer?.disconnect();
    clearInterval(interval);
    removeEventListener("scroll", onScroll);
    // Leave a clean page; the updated extension paints it again on the next load.
    document.querySelectorAll("[data-sloppy-vid]").forEach(clearTile);
  }

  function applySettings(next) {
    const categoriesChanged = Sloppy.categorySetKey(next) !== Sloppy.categorySetKey(settings);
    settings = next;
    if (categoriesChanged) {
      generation++;
      results = new Map();
      queue.clear();
      retryAt = 0;
      document.querySelectorAll("[data-sloppy-vid]").forEach((t) => {
        if (t.dataset.sloppyVid !== "ad") clearTile(t);
      });
      scheduleScan(0);
    }
    repaintAll();
    if (settings.enabled) pump();
  }

  Sloppy.load().then((s) => {
    settings = s;
    observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    addEventListener("yt-navigate-finish", () => scheduleScan(50));
    addEventListener("scroll", onScroll, { passive: true });
    interval = setInterval(() => scheduleScan(0), 3000); // safety net, and retries after errors
    scan();
  });

  Sloppy.onChange((s) => alive() && applySettings(s));

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "pageStats") {
      const counts = {};
      document.querySelectorAll("[data-sloppy-state='done']").forEach((t) => {
        counts[t.dataset.sloppyCat] = (counts[t.dataset.sloppyCat] || 0) + 1;
      });
      sendResponse({
        counts,
        pending: document.querySelectorAll("[data-sloppy-state='pending']").length,
        error: lastError,
      });
    }
  });
})();
