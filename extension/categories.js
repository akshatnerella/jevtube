// Shared category definitions. Loaded by the service worker, content script and popup.
// Display only; the criteria Jev reads live in server/lib/categories.js (keys must match).
self.SLOPPY_CATEGORIES = {
  slop: {
    label: "Slop",
    color: "#e11d48",
  },
  clickbait: {
    label: "Clickbait",
    color: "#f59e0b",
  },
  breaking_news: {
    label: "News",
    color: "#2563eb",
  },
  educational: {
    label: "Educational",
    color: "#16a34a",
  },
  entertainment: {
    label: "Entertainment",
    color: "#8b5cf6",
  },
  music: {
    label: "Music",
    color: "#ec4899",
  },
  ad: {
    label: "Ad",
    color: "#0d9488",
  },
  other: {
    label: "Other",
    color: "#6b7280",
  },
};

self.SLOPPY_DEFAULT_SETTINGS = {
  enabled: true,
  // per-category display mode: "box" | "dim" | "hide" | "off"
  modes: { slop: "box", clickbait: "box", breaking_news: "box", educational: "box",
           entertainment: "box", music: "box", ad: "box", other: "off" },
  // below this Choice confidence the box is drawn dashed
  lowConfidence: 0.55,
};
