// Tap to play (ai-hq job platform-web-design-0019; his words 2026-11-16 22:44 CT: "I like the YouTube idea"). Each film
// is our own still image inside a link to youtube.com, so nothing from YouTube loads before a tap. A tap swaps in the
// youtube-nocookie.com player in the same box (same size: no jump) and moves focus to it. Without JavaScript the link
// opens the film on YouTube. Markup: tools/videos.py film() and sheet(); styles: site.css ".vid", ".vcard", ".vsheet".
//
// The calmer Videos page (ai-hq job platform-web-design-0021, his yes 2026-11-27): a card opens its film's sheet (a
// <dialog>) and starts the film there; closing the sheet stops the film and puts the still back. The chips show one
// condition's films or all. Without JavaScript the chips stay hidden, every card is listed and links to its sheet
// (#film-<key>, shown by CSS :target), whose play button opens the film on YouTube.
(function () {
  if (!("addEventListener" in document)) return;
  var ID = /^[A-Za-z0-9_-]{11}$/;

  function play(a) {
    var id = a.getAttribute("data-yt");
    if (!ID.test(id)) return false;
    var f = document.createElement("iframe");
    f.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0&playsinline=1";
    f.title = "Video: " + (a.getAttribute("data-title") || "Every Option film");
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    f.allowFullscreen = true;
    f.referrerPolicy = "strict-origin-when-cross-origin";
    f.className = "vid-player";
    var box = a.parentNode;
    box._still = a;
    box.replaceChild(f, a);
    box.classList.add("is-playing");
    try { f.focus(); } catch (e) {}
    return true;
  }

  function stop(d) {   // put the still back, which unloads the player
    var box = d.querySelector(".vsheet-frame");
    var f = box && box.querySelector("iframe.vid-player");
    if (f && box._still) { box.replaceChild(box._still, f); box.classList.remove("is-playing"); }
  }

  function open(d, start) {
    if (!d || typeof d.showModal !== "function") return false;
    if (!d.open) d.showModal();
    if (start) {
      var a = d.querySelector("a.vid-play[data-yt]");
      if (a) play(a);
    }
    return true;
  }

  document.addEventListener("click", function (ev) {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var t = ev.target;
    var c = t.closest && t.closest("a.vcard[data-sheet]");
    if (c) {
      if (open(document.getElementById(c.getAttribute("data-sheet")), true)) ev.preventDefault();
      return;
    }
    var x = t.closest && t.closest("a.vsheet-close");
    if (x) {
      var d = x.closest("dialog");
      if (d && d.open) { ev.preventDefault(); d.close(); }
      return;
    }
    var a = t.closest && t.closest("a.vid-play[data-yt]");
    if (a && play(a)) ev.preventDefault();
  });

  // A press on the dimmed backdrop (outside the sheet's box) closes it, as Escape does.
  document.addEventListener("click", function (ev) {
    var d = ev.target;
    if (d && d.tagName === "DIALOG" && d.classList.contains("vsheet") && d.open) {
      var r = d.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) d.close();
    }
  });

  var sheets = document.querySelectorAll("dialog.vsheet");
  for (var i = 0; i < sheets.length; i++) {
    sheets[i].addEventListener("close", function () {
      stop(this);
      if (location.hash === "#" + this.id && history.replaceState) history.replaceState(null, "", location.pathname + location.search);
    });
  }
  // An address with #film-<key> opens that sheet with the still showing (nothing loads until play is pressed).
  function fromHash() {
    if (!location.hash || !/^#film-[a-z0-9-]+$/.test(location.hash)) return;
    var d0 = document.getElementById(location.hash.slice(1));
    if (d0 && d0.classList.contains("vsheet")) open(d0, false);
  }
  fromHash();
  window.addEventListener("hashchange", fromHash);

  // Chips: show one condition's films, or all.
  var group = document.querySelector(".vchips");
  if (group) {
    var chips = group.querySelectorAll(".vchip");
    var cards = document.querySelectorAll(".vcards .vcard-li");
    var status = document.getElementById("vchips-status");
    group.hidden = false;
    group.addEventListener("click", function (ev) {
      var b = ev.target.closest && ev.target.closest(".vchip");
      if (!b) return;
      var want = b.getAttribute("data-cond"), n = 0;
      for (var j = 0; j < chips.length; j++) chips[j].setAttribute("aria-pressed", chips[j] === b ? "true" : "false");
      for (var k = 0; k < cards.length; k++) {
        var on = want === "all" || cards[k].getAttribute("data-cond") === want;
        cards[k].hidden = !on;
        if (on) n++;
      }
      if (status) status.textContent = n + (n === 1 ? " film" : " films") + (want === "all" ? "" : ": " + b.textContent);
    });
  }
})();
