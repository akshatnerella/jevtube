const $ = (id) => document.getElementById(id);
const MODE_LABELS = { box: "Box", dim: "Dim", blur: "Blur", hide: "Hide", off: "Off" };

let settings;
const countEls = {};

function render() {
  $("enabled").checked = settings.enabled;
  document.body.classList.toggle("off", !settings.enabled);
  const rows = [...settings.categories, { ...Jev.OTHER, mode: settings.otherMode }].map((cat) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span class="swatch"></span><span class="name"></span><span class="count"></span><select></select>`;
    row.querySelector(".swatch").style.background = cat.color;
    row.querySelector(".name").textContent = cat.label;
    row.querySelector(".name").title = cat.description;
    countEls[cat.id] = row.querySelector(".count");
    const sel = row.querySelector("select");
    sel.setAttribute("aria-label", `${cat.label} display`);
    for (const m of Jev.MODES) sel.add(new Option(MODE_LABELS[m], m, false, m === cat.mode));
    sel.onchange = () => {
      if (cat.fixed) settings.otherMode = sel.value;
      else settings.categories.find((c) => c.id === cat.id).mode = sel.value;
      Jev.save(settings);
    };
    return row;
  });
  $("cats").replaceChildren(...rows);
}

async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const stats = tab ? await chrome.tabs.sendMessage(tab.id, { type: "pageStats" }).catch(() => null) : null;
  for (const [id, el] of Object.entries(countEls)) el.textContent = stats?.counts?.[id] || "";
  const status = await chrome.runtime.sendMessage({ type: "status" }).catch(() => ({}));
  const err = stats?.error || status?.lastError;
  const el = $("status");
  el.classList.toggle("err", !!err);
  if (err) el.textContent = err;
  else if (!stats) el.textContent = "Open YouTube to see live counts.";
  else if (stats.pending) el.textContent = `Labeling ${stats.pending} video${stats.pending === 1 ? "" : "s"}…`;
  else el.textContent = typeof status?.remaining === "number" && status.remaining < 100
    ? `${status.remaining} new videos left today` : "";
}

$("enabled").onchange = (e) => {
  settings.enabled = e.target.checked;
  document.body.classList.toggle("off", !settings.enabled);
  Jev.save(settings);
};
$("settings").onclick = () => chrome.runtime.openOptionsPage();
$("recheck").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "clearCache" });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Only reload tabs where JevTube is running (i.e. YouTube).
  const onYouTube = tab && (await chrome.tabs.sendMessage(tab.id, { type: "pageStats" }).catch(() => null));
  if (onYouTube) chrome.tabs.reload(tab.id);
  window.close();
};

Jev.load().then((s) => {
  settings = s;
  render();
  refresh();
  setInterval(refresh, 1500);
});
