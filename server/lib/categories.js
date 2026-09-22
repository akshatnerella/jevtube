// Server-side validation of the categories a client asks Jev to choose between.
// Clients send their own set (user-editable in the extension); these defaults cover old clients.
import { createHash } from "node:crypto";

export const PROMPT_VERSION = "v3";
export const MAX_CATEGORIES = 13; // 12 user categories + "other"
const ID = /^[a-z0-9_]{1,24}$/;
const MAX_DESCRIPTION = 240;

export const DEFAULT_CATEGORIES = [
  { id: "slop", description: "Low-effort, mass-produced filler made to farm views: AI-generated voiceover or imagery, faceless compilation or 'facts' channels, reuploads, content-farm listicles, fake or auto-generated kids content, rage-bait reaction spam." },
  { id: "clickbait", description: "A real creator's video whose title is engineered to bait clicks: exaggeration, ALL CAPS, shock words, withheld information ('you won't believe', 'gone wrong'), misleading curiosity gaps." },
  { id: "news", description: "Coverage of a current, time-sensitive news event (politics, disasters, world events, markets) from a news outlet, journalist or live news stream." },
  { id: "educational", description: "Teaches or explains something substantive: lectures, tutorials, how-tos, explainers, documentaries, in-depth analysis or essays." },
  { id: "entertainment", description: "Genuine creator entertainment with an honest title: vlogs, gaming, comedy, podcasts, sports, reviews, commentary." },
  { id: "music", description: "Music videos, songs, albums, live performances, DJ mixes, lofi or music playlists." },
  { id: "ad", description: "Primarily promotes a product, service or brand: sponsored or promoted placements, commercials, product launch promos." },
  { id: "other", description: "None of the other categories fit this video." },
];

const OTHER_DESCRIPTION = "None of the other categories fit this video.";

// Returns a clean category list, or null if the input is unusable.
export function sanitizeCategories(input) {
  if (input == null) return DEFAULT_CATEGORIES;
  if (!Array.isArray(input)) return null;
  const seen = new Set();
  const out = [];
  for (const c of input) {
    if (!c || !ID.test(c.id) || seen.has(c.id) || typeof c.description !== "string") return null;
    const description = c.description.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION);
    if (!description) return null;
    seen.add(c.id);
    out.push({ id: c.id, description: c.id === "other" ? OTHER_DESCRIPTION : description });
  }
  if (!seen.has("other")) out.push({ id: "other", description: OTHER_DESCRIPTION });
  if (out.length < 2 || out.length > MAX_CATEGORIES) return null;
  return out;
}

export function categorySetHash(categories) {
  return createHash("sha256").update(JSON.stringify(categories)).digest("hex").slice(0, 16);
}
