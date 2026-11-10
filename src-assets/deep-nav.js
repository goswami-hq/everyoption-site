// Deep "every option" pages: the contents list stays reachable while reading (job platform-main-0023; his words
// 2026-11-07: "work on the deep page in terms of readability and navigability on the page").
// The page prints its contents list (nav.toc) near the top, so it works with no script. Once that list scrolls away,
// this pins a copy: a side rail from 1180 px, a one-line bar at the top on narrower screens that opens the list. Both
// mark the section being read and end with "Back to top".
(() => {
  const toc = document.getElementById("toc");
  if (!toc) return;
  const dock = document.createElement("div");
  dock.className = "toc-dock";
  dock.innerHTML = '<button type="button" class="toc-bar" aria-expanded="false" aria-controls="toc-panel">' +
    '<span class="toc-bar-k">Contents</span><span class="toc-now" aria-hidden="true"></span>' +
    '<svg class="toc-chev" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
    '<nav class="toc-panel" id="toc-panel" aria-label="Contents, pinned"><p class="toc-title">On this page</p></nav>';
  const panel = dock.querySelector(".toc-panel"), bar = dock.querySelector(".toc-bar"), now = dock.querySelector(".toc-now");
  panel.appendChild(toc.querySelector("ol").cloneNode(true));
  const top = document.createElement("a");
  top.className = "to-top"; top.href = "#top"; top.textContent = "Back to top";
  panel.appendChild(top);
  document.body.appendChild(dock);

  const open = (yes) => { dock.classList.toggle("is-open", yes); bar.setAttribute("aria-expanded", String(yes)); };
  bar.addEventListener("click", () => open(!dock.classList.contains("is-open")));
  panel.addEventListener("click", (ev) => { if (ev.target.closest("a")) open(false); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && dock.classList.contains("is-open")) { open(false); bar.focus(); } });
  document.addEventListener("click", (ev) => { if (!dock.contains(ev.target)) open(false); });
  top.addEventListener("click", (ev) => {
    ev.preventDefault(); open(false);
    window.scrollTo(0, 0);
    const h1 = document.querySelector("main h1");
    if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
    history.replaceState(null, "", location.pathname + location.search);
  });

  // Show the pinned copy only once the printed list is above the screen (checked on every frame of scroll: a jump from
  // below the list to far past it crosses no observer threshold).
  const grid = document.querySelector(".table-scroll"), wide = window.matchMedia("(min-width: 1180px)");
  const pin = () => {
    let past = toc.getBoundingClientRect().bottom < 0;
    if (past && grid && wide.matches) {   // the wide grid would run under the side rail
      const r = grid.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) past = false;
    }
    if (past !== dock.classList.contains("is-on")) { dock.classList.toggle("is-on", past); if (!past) open(false); }
  };

  // Mark the section being read: the last target whose top has passed a line a third of the way down the screen.
  const links = [...document.querySelectorAll(".toc a[href^='#'], .toc-panel a[href^='#']")].filter((a) => a !== top);
  const ids = [...new Set(links.map((a) => a.getAttribute("href").slice(1)))];
  const targets = ids.map((id) => document.getElementById(id)).filter(Boolean);
  let frame = 0, current = null;
  const mark = () => {
    frame = 0;
    pin();
    const line = window.innerHeight / 3;
    let hit = null;
    for (const el of targets) { if (el.getBoundingClientRect().top <= line) hit = el; else break; }
    // In the long at-a-glance grid (twelve cards on a phone), name the treatment card being read, so the bar moves
    // with the reader (his words 2026-11-10 06:11 CT: "the table of contents header doesn't change").
    let row = null;
    if (hit && hit.id === "glance") {
      const box = hit.closest("section") || hit.parentElement;   // the id sits on the heading; the grid follows it
      for (const tr of box.querySelectorAll(".table-scroll tbody tr")) { if (tr.getBoundingClientRect().top <= line) row = tr; else break; }
    }
    const key = hit ? hit.id + (row ? "|" + row.rowIndex : "") : "";
    if (key === current) return;
    current = key;
    const id = hit ? hit.id : "";
    const parent = hit && hit.matches(".deep-option") ? hit.closest("section") : null;
    for (const a of links) {
      const h = a.getAttribute("href").slice(1);
      if (h === id) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
      a.classList.toggle("is-parent", !!parent && h === parent.id);
    }
    const a = links.find((x) => x.getAttribute("href") === "#" + id);
    const rowName = row && row.querySelector("th") ? row.querySelector("th").textContent.trim() : "";
    now.textContent = a ? a.textContent + (rowName ? ": " + rowName : "") : "";
    const pinned = panel.querySelector('[aria-current="location"]');
    if (pinned && dock.classList.contains("is-on") && wide.matches) {
      const r = pinned.getBoundingClientRect(), p = panel.getBoundingClientRect();
      if (r.top < p.top || r.bottom > p.bottom) pinned.scrollIntoView({ block: "nearest" });
    }
  };
  addEventListener("scroll", () => { if (!frame) frame = requestAnimationFrame(mark); }, { passive: true });
  addEventListener("resize", () => { current = null; mark(); });
  mark();
})();
