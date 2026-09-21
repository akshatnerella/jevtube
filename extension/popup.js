const CATS = self.SLOPPY_CATEGORIES;
const DEFAULTS = self.SLOPPY_DEFAULT_SETTINGS;
const $ = (id) => document.getElementById(id);

let settings;

async function loadSettings() {
  const { settings: s } = await chrome.storage.local.get("settings");
  settings = { ...DEFAULTS, ...s, modes: { ...DEFAULTS.modes, ...s?.modes } };
}

const save = () => chrome.storage.local.set({ settings });

const countEls = {};

function render() {
  $("enabled").checked = settings.enabled;
  $("cats").replaceChildren(
    ...Object.entries(CATS).map(([key, cat]) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span class="swatch"></span><span class="name"></span><span class="count"></span>
        <select><option value="box">box</option><option value="dim">dim</option>
        <option value="hide">hide</option><option value="off">off</option></select>`;
      row.querySelector(".swatch").style.background = cat.color;
      row.querySelector(".name").textContent = cat.label;
      countEls[key] = row.querySelector(".count");
      const sel = row.querySelector("select");
      sel.value = settings.modes[key] || "box";
      sel.onchange = () => {
        settings.modes[key] = sel.value;
        save();
      };
      return row;
    })
  );
}

async function refreshStats() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let stats = null;
  if (tab?.url?.includes("youtube.com")) {
    stats = await chrome.tabs.sendMessage(tab.id, { type: "pageStats" }).catch(() => null);
  }
  for (const [key, el] of Object.entries(countEls)) el.textContent = stats?.counts?.[key] || "";
  $("pending").textContent = stats
    ? stats.pending ? `${stats.pending} videos waiting for Jev…` : ""
    : "Open a YouTube tab to see live counts.";
  const status = await chrome.runtime.sendMessage({ type: "status" });
  $("error").textContent = stats?.error || status.lastError || "";
  $("keyStatus").textContent = status.hasKey
    ? `API key loaded (${status.keySource}).`
    : "No API key yet. Run scripts/sync-key.sh or paste one below.";
}

$("enabled").onchange = (e) => {
  settings.enabled = e.target.checked;
  save();
};
$("saveKey").onclick = async () => {
  const apiKey = $("apiKey").value.trim();
  if (apiKey) await chrome.storage.local.set({ apiKey });
  else await chrome.storage.local.remove("apiKey");
  $("apiKey").value = "";
  refreshStats();
};
$("clearCache").onclick = () => chrome.runtime.sendMessage({ type: "clearCache" }).then(refreshStats);

loadSettings().then(() => {
  render();
  refreshStats();
});
setInterval(refreshStats, 1500);
