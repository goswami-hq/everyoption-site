// Home banner film (W13 "ride c2" v5; his "Put it on dev site", 2026-11-08 19:40 CT).
// Plays once, muted, then rests on its last frame. Wide screens get the 2340 px film.
// Reduced motion or no script: the poster (the film's last frame) stays and nothing moves.
// No replay control (his 7B "remove it", 2026-11-09, job platform-web-design-0008).
(function () {
  var v = document.getElementById("ride");
  if (!v) return;
  var wide = window.matchMedia("(min-width: 760px)").matches;
  if (wide) {
    v.poster = "/assets/media/banner-ride-v5-2340-rest.png";
    v.src = "/assets/media/banner-ride-v5-2340.mp4";
  }
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function play() {
    try { v.currentTime = 0; } catch (e) {}
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }
  if (!still) play();
})();
