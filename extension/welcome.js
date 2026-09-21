// MV3 pages can't run inline scripts, so the legend is filled in here.
const cats = document.getElementById("cats");
for (const c of Sloppy.DEFAULT_CATEGORIES) {
  const el = document.createElement("div");
  el.className = "cat";
  el.style.setProperty("--c", c.color);
  el.innerHTML = `<span class="chip"></span>`;
  el.firstChild.textContent = c.label;
  cats.append(el);
}

document.getElementById("customize").onclick = (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
};
