// W32 (ai-hq job platform-launch-0005; his words 2026-11-13 18:53 CT: "Let's build the site pop up thing and footer"):
// the first-visit notice bar. Bottom of the screen, never blocking. OK is remembered in this browser only
// (localStorage "eo-notice-ok" = the date); no cookie, no network call, no tracking. If storage is blocked the bar
// simply shows again. Without JavaScript nothing shows; the footer's "Education, not medical advice" line and its Terms
// link carry the notice then. Styles: src-assets/site.css (".eo-notice").
(function () {
  var KEY = "eo-notice-ok", root = document.documentElement;
  try { if (window.localStorage.getItem(KEY)) return; } catch (e) { /* storage blocked: show the bar */ }

  function show() {
    var bar = document.createElement("section");
    bar.className = "eo-notice";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Site notice");
    var p = document.createElement("p");
    p.appendChild(document.createTextNode("Education only, not medical advice. By using this site you agree to our "));
    var a = document.createElement("a");
    a.href = "/terms/";
    a.textContent = "Terms";
    p.appendChild(a);
    p.appendChild(document.createTextNode("."));
    var ok = document.createElement("button");
    ok.type = "button";
    ok.className = "eo-notice-ok";
    ok.textContent = "OK";
    bar.appendChild(p);
    bar.appendChild(ok);

    // Room at the page bottom while the bar shows, so it never sits over the last of the page or the "Find a doctor" bar.
    function fit() { root.style.setProperty("--notice-h", bar.offsetHeight + "px"); }
    ok.addEventListener("click", function () {
      try { window.localStorage.setItem(KEY, new Date().toISOString().slice(0, 10)); } catch (e) { /* not remembered */ }
      window.removeEventListener("resize", fit);
      if (bar.parentNode) bar.parentNode.removeChild(bar);
      root.classList.remove("eo-notice-on");
      root.style.removeProperty("--notice-h");
    });
    document.body.appendChild(bar);
    root.classList.add("eo-notice-on");
    fit();
    window.addEventListener("resize", fit);
  }

  if (document.body) show(); else document.addEventListener("DOMContentLoaded", show);
})();
