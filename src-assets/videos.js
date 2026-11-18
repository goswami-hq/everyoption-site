// Tap to play (ai-hq job platform-web-design-0019; his words 2026-11-16 22:44 CT: "I like the YouTube idea"). Each film
// is our own still image inside a link to youtube.com, so nothing from YouTube loads before a tap. A tap swaps in the
// youtube-nocookie.com player in the same box (same size: no jump) and moves focus to it. Without JavaScript the link
// opens the film on YouTube. Markup: tools/videos.py film(); styles: site.css ".vid".
(function () {
  if (!("addEventListener" in document)) return;
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a.vid-play[data-yt]");
    if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var id = a.getAttribute("data-yt");
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    ev.preventDefault();
    var f = document.createElement("iframe");
    f.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0&playsinline=1";
    f.title = "Video: " + (a.getAttribute("data-title") || "Every Option film");
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    f.allowFullscreen = true;
    f.referrerPolicy = "strict-origin-when-cross-origin";
    f.className = "vid-player";
    var box = a.parentNode;
    box.replaceChild(f, a);
    box.classList.add("is-playing");
    try { f.focus(); } catch (e) {}
  });
})();
