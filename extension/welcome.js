// MV3 pages can't run inline scripts, so the legend is filled in here.
const cats = document.getElementById("cats");
for (const [key, c] of Object.entries(self.SLOPPY_CATEGORIES)) {
  if (key === "other") continue;
  const el = document.createElement("div");
  el.className = "cat";
  el.style.setProperty("--c", c.color);
  el.innerHTML = `<span class="chip"></span>`;
  el.firstChild.textContent = c.label;
  cats.append(el);
}
