// Shared category definitions. Loaded by the service worker, content script and popup.
// `description` is sent to Jev as the Choice criterion, so it must stand on its own.
self.SLOPPY_CATEGORIES = {
  slop: {
    label: "Slop",
    color: "#e11d48",
    description:
      "Low-effort, mass-produced filler made to farm views: AI-generated voiceover or imagery, faceless compilation or 'facts' channels, reuploads, content-farm listicles, fake or auto-generated kids content, rage-bait reaction spam.",
  },
  clickbait: {
    label: "Clickbait",
    color: "#f59e0b",
    description:
      "A real creator's video whose title is engineered to bait clicks: exaggeration, ALL CAPS, shock words, withheld information ('you won't believe', 'gone wrong', 'I can't believe this happened'), misleading curiosity gaps.",
  },
  breaking_news: {
    label: "News",
    color: "#2563eb",
    description:
      "Coverage of a current, time-sensitive news event (politics, disasters, world events, markets) from a news outlet, journalist or live news stream.",
  },
  educational: {
    label: "Educational",
    color: "#16a34a",
    description:
      "Teaches or explains something substantive: lectures, tutorials, how-tos, explainers, documentaries, in-depth analysis or essays.",
  },
  entertainment: {
    label: "Entertainment",
    color: "#8b5cf6",
    description:
      "Genuine creator entertainment with an honest title: vlogs, gaming, comedy, podcasts, sports, reviews, commentary.",
  },
  music: {
    label: "Music",
    color: "#ec4899",
    description: "Music videos, songs, albums, live performances, DJ mixes, lofi or music playlists.",
  },
  ad: {
    label: "Ad",
    color: "#111827",
    description:
      "Primarily promotes a product, service or brand: sponsored or promoted placements, commercials, product launch promos.",
  },
  other: {
    label: "Other",
    color: "#6b7280",
    description: null,
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
