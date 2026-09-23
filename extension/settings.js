// Shared settings model. Loaded by the service worker, content script, popup, options and welcome pages.
// Settings live in chrome.storage.sync so they follow the user across their browsers.
(() => {
  const MAX_CATEGORIES = 12; // user categories, not counting the fixed "other"
  const MAX_LABEL = 24;
  const MAX_DESCRIPTION = 240;
  const MODES = ["box", "dim", "blur", "hide", "off"];

  // The description is exactly what Jev reads for that option, so it has to stand on its own.
  const DEFAULT_CATEGORIES = [
    { id: "slop", label: "Slop", color: "#e11d48", mode: "box",
      description: "Low-effort, mass-produced filler made to farm views: AI-generated voiceover or imagery, faceless compilation or 'facts' channels, reuploads, content-farm listicles, fake or auto-generated kids content, rage-bait reaction spam." },
    { id: "clickbait", label: "Clickbait", color: "#f59e0b", mode: "box",
      description: "A real creator's video whose title is engineered to bait clicks: exaggeration, ALL CAPS, shock words, withheld information ('you won't believe', 'gone wrong'), misleading curiosity gaps." },
    { id: "news", label: "News", color: "#2563eb", mode: "box",
      description: "Coverage of a current, time-sensitive news event (politics, disasters, world events, markets) from a news outlet, journalist or live news stream." },
    { id: "educational", label: "Educational", color: "#16a34a", mode: "box",
      description: "Teaches or explains something substantive: lectures, tutorials, how-tos, explainers, documentaries, in-depth analysis or essays." },
    { id: "entertainment", label: "Entertainment", color: "#8b5cf6", mode: "box",
      description: "Genuine creator entertainment with an honest title: vlogs, gaming, comedy, podcasts, sports, reviews, commentary." },
    { id: "music", label: "Music", color: "#ec4899", mode: "box",
      description: "Music videos, songs, albums, live performances, DJ mixes, lofi or music playlists." },
    { id: "ad", label: "Ad", color: "#0d9488", mode: "blur",
      description: "Primarily promotes a product, service or brand: sponsored or promoted placements, commercials, product launch promos." },
  ];

  // Always present, always last. Jev picks it when none of the user's categories fit.
  const OTHER = { id: "other", label: "Other", color: "#6b7280", mode: "off", fixed: true,
    description: "None of the other categories fit this video." };

  // One-click additions shown on the settings page.
  const SUGGESTIONS = [
    { label: "Reaction", description: "Someone watching and reacting to another creator's video, clip or stream with little original content." },
    { label: "Drama", description: "Creator drama, callouts, feuds, 'exposing' videos and gossip about internet personalities." },
    { label: "Politics", description: "Political commentary, partisan opinion, elections, politicians and culture-war debates." },
    { label: "True crime", description: "Real crimes, murders, disappearances, cold cases and criminal investigations." },
    { label: "Kids", description: "Content made for young children: nursery rhymes, toy unboxing, cartoons, kids' learning videos." },
    { label: "Finance hype", description: "Get-rich-quick, crypto pumping, 'passive income' and trading hype promising easy money." },
    { label: "Tech review", description: "Hands-on reviews, comparisons and unboxings of phones, computers, gadgets and other tech products." },
    { label: "Podcast", description: "Long-form podcast episodes, interviews and conversation shows, or clips cut from them." },
    { label: "Gaming", description: "Video game gameplay, let's plays, speedruns, game reviews and gaming news." },
    { label: "Sports", description: "Sports highlights, matches, athletes, analysis and sports news." },
    { label: "Cooking", description: "Recipes, cooking tutorials, food reviews and restaurant videos." },
    { label: "Fitness", description: "Workouts, exercise routines, gym content, nutrition and body transformation." },
  ];

  const PALETTE = ["#e11d48", "#f59e0b", "#2563eb", "#16a34a", "#8b5cf6", "#ec4899", "#0d9488",
                   "#ea580c", "#0891b2", "#65a30d", "#c026d3", "#4f46e5", "#b45309"];

  const DEFAULT_SETTINGS = {
    version: 2,
    enabled: true,
    showConfidence: true,
    showBait: true,
    // Blur content the page itself marks as paid (YouTube ad slots, LinkedIn "Promoted" posts)
    // until the user clicks it, whatever category it lands in.
    blurSponsored: true,
    lowConfidence: 0.55,
    categories: DEFAULT_CATEGORIES,
    otherMode: "off",
  };

  const clone = (x) => JSON.parse(JSON.stringify(x));

  function slug(label) {
    return (label || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "category";
  }

  function uniqueId(label, taken) {
    const base = slug(label);
    let id = base === "other" ? "other_" : base;
    for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
    return id;
  }

  // Coerce anything (old versions, hand-edited storage) into a valid settings object.
  function normalize(raw) {
    const s = { ...clone(DEFAULT_SETTINGS), ...(raw || {}) };
    if (!MODES.includes(s.otherMode)) s.otherMode = "off";
    s.blurSponsored = s.blurSponsored !== false;
    s.lowConfidence = Math.min(0.95, Math.max(0, Number(s.lowConfidence) || 0));
    const taken = new Set(["other"]);
    const cats = Array.isArray(s.categories) ? s.categories : clone(DEFAULT_CATEGORIES);
    s.categories = cats
      .filter((c) => c && typeof c.label === "string" && c.label.trim())
      .slice(0, MAX_CATEGORIES)
      .map((c, i) => {
        const id = c.id && /^[a-z0-9_]{1,24}$/.test(c.id) && !taken.has(c.id) ? c.id : uniqueId(c.label, taken);
        taken.add(id);
        return {
          id,
          label: c.label.trim().slice(0, MAX_LABEL),
          description: String(c.description || c.label).trim().slice(0, MAX_DESCRIPTION),
          color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : PALETTE[i % PALETTE.length],
          mode: MODES.includes(c.mode) ? c.mode : "box",
        };
      });
    return s;
  }

  // v1 kept per-category modes in settings.modes (in storage.local) with fixed categories.
  function migrateV1(old) {
    const s = clone(DEFAULT_SETTINGS);
    s.enabled = old.enabled !== false;
    const modes = old.modes || {};
    s.categories.forEach((c) => {
      const oldKey = c.id === "news" ? "breaking_news" : c.id;
      if (MODES.includes(modes[oldKey])) c.mode = modes[oldKey];
    });
    if (MODES.includes(modes.other)) s.otherMode = modes.other;
    return s;
  }

  async function load() {
    const { settings } = await chrome.storage.sync.get("settings");
    if (settings) return normalize(settings);
    const { settings: old } = await chrome.storage.local.get("settings");
    if (old) {
      const migrated = migrateV1(old);
      await chrome.storage.sync.set({ settings: migrated });
      await chrome.storage.local.remove("settings");
      return migrated;
    }
    return normalize(null);
  }

  async function save(settings) {
    const s = normalize(settings);
    await chrome.storage.sync.set({ settings: s });
    return s;
  }

  function onChange(cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.settings) cb(normalize(changes.settings.newValue));
    });
  }

  // Everything the classifier sees, in a stable order. Changing any of it means re-labeling.
  function classifierCategories(settings) {
    return [...settings.categories.map(({ id, description }) => ({ id, description })), { id: OTHER.id, description: OTHER.description }];
  }

  function categorySetKey(settings) {
    const str = JSON.stringify(classifierCategories(settings));
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // Display info for a category id, including the fixed "other" and stale ids.
  function lookup(settings, id) {
    const c = settings.categories.find((x) => x.id === id);
    if (c) return c;
    return { ...OTHER, mode: settings.otherMode };
  }

  self.Jev = {
    MAX_CATEGORIES, MAX_LABEL, MAX_DESCRIPTION, MODES, DEFAULT_CATEGORIES, OTHER, SUGGESTIONS, PALETTE,
    DEFAULT_SETTINGS, clone, slug, uniqueId, normalize, load, save, onChange,
    classifierCategories, categorySetKey, lookup,
  };
})();
