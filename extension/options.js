// Settings page: edit categories and display options. Autosaves whenever the draft is valid.
const $ = (id) => document.getElementById(id);
const MODE_LABELS = { box: "Box", dim: "Dim", hide: "Hide", off: "Off" };

let draft; // working copy of settings; saved to storage when valid

// ---------- saving ----------

let saveTimer = null;
let savedTimer = null;

function problems(cat) {
  if (!cat.label.trim()) return "Give this category a name.";
  if (!cat.description.trim()) return "Describe what belongs here so the model knows.";
  const dupes = draft.categories.filter((c) => c.label.trim().toLowerCase() === cat.label.trim().toLowerCase());
  if (dupes.length > 1) return "Two categories have this name.";
  if (cat.label.trim().toLowerCase() === "other") return "\"Other\" is built in; pick another name.";
  return null;
}

function validate() {
  let ok = true;
  document.querySelectorAll(".cat").forEach((li, i) => {
    const msg = problems(draft.categories[i]);
    li.classList.toggle("invalid", !!msg);
    const err = li.querySelector(".err");
    err.hidden = !msg;
    err.textContent = msg || "";
    if (msg) ok = false;
  });
  return ok;
}

function scheduleSave(delay = 400) {
  clearTimeout(saveTimer);
  if (!validate()) {
    showSaved("Fix the highlighted category to save");
    return;
  }
  saveTimer = setTimeout(saveNow, delay);
}

async function saveNow() {
  clearTimeout(saveTimer);
  if (!validate()) return false;
  const saved = await Sloppy.save(draft);
  // Keep ids the normalizer assigned, without clobbering what the user is typing.
  saved.categories.forEach((c, i) => (draft.categories[i].id = c.id));
  showSaved("Saved");
  return true;
}

function showSaved(text) {
  const el = $("saved");
  el.textContent = text;
  el.style.opacity = 1;
  clearTimeout(savedTimer);
  if (text === "Saved") savedTimer = setTimeout(() => (el.style.opacity = 0), 1500);
}

// ---------- rendering ----------

// Grow description boxes to fit their text instead of scrolling.
function fit(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

function modeControl(current, onPick) {
  const wrap = document.createElement("div");
  wrap.className = "modes";
  wrap.setAttribute("role", "group");
  for (const m of Sloppy.MODES) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = MODE_LABELS[m];
    b.setAttribute("aria-pressed", String(m === current));
    b.onclick = () => {
      wrap.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      onPick(m);
    };
    wrap.append(b);
  }
  return wrap;
}

function renderCats() {
  const list = $("cats");
  list.replaceChildren();
  draft.categories.forEach((cat, i) => {
    const li = $("catTpl").content.firstElementChild.cloneNode(true);
    li.style.setProperty("--c", cat.color);
    const color = li.querySelector(".color");
    color.value = cat.color;
    li.querySelector(".swatch").style.setProperty("--c", cat.color);
    color.oninput = () => {
      cat.color = color.value;
      li.style.setProperty("--c", cat.color);
      li.querySelector(".swatch").style.setProperty("--c", cat.color);
      scheduleSave();
    };
    const name = li.querySelector(".name");
    name.value = cat.label;
    name.oninput = () => {
      cat.label = name.value;
      renderSuggestions();
      scheduleSave(700);
    };
    const desc = li.querySelector(".desc");
    desc.value = cat.description;
    desc.oninput = () => {
      cat.description = desc.value;
      fit(desc);
      scheduleSave(900);
    };
    li.querySelector(".modes").replaceWith(modeControl(cat.mode, (m) => { cat.mode = m; scheduleSave(0); }));
    li.querySelector(".del").onclick = () => {
      draft.categories.splice(i, 1);
      renderAll();
      scheduleSave(0);
    };
    list.append(li);
    fit(desc);
  });
  $("count").textContent = `${draft.categories.length} / ${Sloppy.MAX_CATEGORIES}`;
  $("add").disabled = draft.categories.length >= Sloppy.MAX_CATEGORIES;
  validate();
}

function renderSuggestions() {
  const have = new Set(draft.categories.map((c) => c.label.trim().toLowerCase()));
  const full = draft.categories.length >= Sloppy.MAX_CATEGORIES;
  const chips = Sloppy.SUGGESTIONS.filter((s) => !have.has(s.label.toLowerCase())).map((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = `+ ${s.label}`;
    b.title = s.description;
    b.disabled = full;
    b.onclick = () => addCategory(s.label, s.description);
    return b;
  });
  $("suggest").replaceChildren(...chips);
  $("suggestWrap").hidden = !chips.length;
}

function renderAll() {
  renderCats();
  renderSuggestions();
}

function nextColor() {
  const used = new Set(draft.categories.map((c) => c.color.toLowerCase()));
  return Sloppy.PALETTE.find((c) => !used.has(c)) || Sloppy.PALETTE[draft.categories.length % Sloppy.PALETTE.length];
}

function addCategory(label = "", description = "") {
  if (draft.categories.length >= Sloppy.MAX_CATEGORIES) return;
  const taken = new Set(["other", ...draft.categories.map((c) => c.id)]);
  draft.categories.push({ id: Sloppy.uniqueId(label || "category", taken), label, description, color: nextColor(), mode: "box" });
  renderAll();
  const last = $("cats").lastElementChild;
  last.scrollIntoView({ behavior: "smooth", block: "center" });
  (label ? last.querySelector(".desc") : last.querySelector(".name")).focus();
  scheduleSave(0);
}

// ---------- test a title ----------

function randomVideoId() {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return Array.from(crypto.getRandomValues(new Uint8Array(11)), (b) => abc[b & 63]).join("");
}

async function runTest(e) {
  e.preventDefault();
  const out = $("testResult");
  out.hidden = false;
  if (!(await saveNow())) {
    out.textContent = "Fix the highlighted category first.";
    return;
  }
  out.textContent = "Asking the model…";
  const id = randomVideoId();
  const video = { id, title: $("testTitle").value.trim(), channel: $("testChannel").value.trim(), meta: "" };
  const resp = await chrome.runtime.sendMessage({ type: "classify", videos: [video] });
  const r = resp?.results?.[id];
  if (!r) {
    out.textContent = resp?.error || "No answer. Try again in a moment.";
    return;
  }
  const settings = await Sloppy.load();
  const top = Sloppy.lookup(settings, r.category);
  const verdict = document.createElement("div");
  verdict.className = "verdict";
  verdict.innerHTML = `<span class="pill"></span><span></span>`;
  verdict.firstChild.style.setProperty("--c", top.color);
  verdict.firstChild.textContent = top.label;
  verdict.lastChild.textContent = `${Math.round(r.confidence * 100)}% sure${r.bait >= 0.75 ? " · ⚡ clickbait-style title" : ""}`;
  const bars = Object.entries(r.probabilities || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, p]) => {
      const c = Sloppy.lookup(settings, k);
      const row = document.createElement("div");
      row.className = "bar";
      row.innerHTML = `<span></span><div class="track"><div class="fill"></div></div><span class="pct"></span>`;
      row.children[0].textContent = c.label;
      row.querySelector(".fill").style.cssText = `width:${Math.max(2, p * 100)}%;--c:${c.color}`;
      row.children[2].textContent = `${Math.round(p * 100)}%`;
      return row;
    });
  out.replaceChildren(verdict, ...bars);
}

// ---------- display options ----------

function renderDisplay() {
  $("enabled").checked = draft.enabled;
  $("showConfidence").checked = draft.showConfidence;
  $("showBait").checked = draft.showBait;
  $("lowConfidence").value = draft.lowConfidence;
  $("lowVal").textContent = `${Math.round(draft.lowConfidence * 100)}%`;
  $("otherModes").replaceWith(
    Object.assign(modeControl(draft.otherMode, (m) => { draft.otherMode = m; scheduleSave(0); }), { id: "otherModes" })
  );
}

function wireDisplay() {
  for (const key of ["enabled", "showConfidence", "showBait"]) {
    $(key).onchange = () => { draft[key] = $(key).checked; scheduleSave(0); };
  }
  $("lowConfidence").oninput = () => {
    draft.lowConfidence = Number($("lowConfidence").value);
    $("lowVal").textContent = `${Math.round(draft.lowConfidence * 100)}%`;
    scheduleSave(300);
  };
}

// ---------- boot ----------

$("add").onclick = () => addCategory();
$("reset").onclick = () => {
  if (!window.confirm("Replace your categories with the defaults?")) return;
  draft.categories = Sloppy.clone(Sloppy.DEFAULT_CATEGORIES);
  draft.otherMode = "off";
  renderAll();
  renderDisplay();
  scheduleSave(0);
};
$("testForm").onsubmit = runTest;
$("version").textContent = `v${chrome.runtime.getManifest().version}`;

// Another tab or the popup changed settings: pick it up unless the user is mid-edit here.
Sloppy.onChange((s) => {
  if (document.activeElement?.closest?.(".cat")) return;
  draft = s;
  renderAll();
  renderDisplay();
});

Sloppy.load().then((s) => {
  draft = s;
  renderAll();
  renderDisplay();
  wireDisplay();
});
