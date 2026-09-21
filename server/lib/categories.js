// Category definitions sent to Jev. Keys must match extension/categories.js.
// Each description is the Choice criterion Jev reads, so it must stand on its own.
export const CATEGORY_CRITERIA = {
  slop:
    "Low-effort, mass-produced filler made to farm views: AI-generated voiceover or imagery, faceless compilation or 'facts' channels, reuploads, content-farm listicles, fake or auto-generated kids content, rage-bait reaction spam.",
  clickbait:
    "A real creator's video whose title is engineered to bait clicks: exaggeration, ALL CAPS, shock words, withheld information ('you won't believe', 'gone wrong', 'I can't believe this happened'), misleading curiosity gaps.",
  breaking_news:
    "Coverage of a current, time-sensitive news event (politics, disasters, world events, markets) from a news outlet, journalist or live news stream.",
  educational:
    "Teaches or explains something substantive: lectures, tutorials, how-tos, explainers, documentaries, in-depth analysis or essays.",
  entertainment:
    "Genuine creator entertainment with an honest title: vlogs, gaming, comedy, podcasts, sports, reviews, commentary.",
  music: "Music videos, songs, albums, live performances, DJ mixes, lofi or music playlists.",
  ad: "Primarily promotes a product, service or brand: sponsored or promoted placements, commercials, product launch promos.",
  other: null,
};

// Bump when the questions or criteria change so cached answers are not reused.
export const PROMPT_VERSION = "v1";
