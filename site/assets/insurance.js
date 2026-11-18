// Card details on the coverage pages (job platform-condition-pages-0008). The HTML ships them closed, so phones paint
// closed; here they open at 768 px and up. A jump to a card opens that card. The sources list stays folded at every width
// (his words 2026-11-08 11:54 CT: "Collapse sources for sure"); a source number opens it. With no script both open on tap.
//
// Fix F (his yes, ai-hq HQ chat 2026-11-15 19:01 CT): the insurer picker. On a condition's coverage page the condition is
// known, so one box asks for the insurer and that insurer's card shows under it, open, with the says-no and questions
// links; the full list folds under "See every insurer". The address keeps the choice (#ufe-aetna), so it can be shared,
// and arriving with it shows that card. On the hub, two boxes (condition, insurer) go to that coverage page. With no
// script the pickers stay hidden and the pages read as before.
(function () {
  var folds = document.querySelectorAll("details.ins-more");
  var wide = window.matchMedia("(min-width: 768px)");
  var pick = document.getElementById("ins-pick"), who = pick && document.getElementById("ins-who");
  var answer = pick && document.getElementById("ins-answer"), all = document.getElementById("ins-all");

  function links() {
    var p = document.createElement("p");
    p.className = "ins-answer-links";
    p.innerHTML = '<a href="#if-no">What if they say no?</a><a href="#ask">Questions to ask your plan</a>';
    return p;
  }
  function show(v, keepHash) {
    answer.textContent = "";
    if (!v) return;
    if (v === "none") {
      var ask = document.getElementById("ask"), list = ask && ask.nextElementSibling;
      var box = document.createElement("div");
      box.className = "card ins-card ins-none";
      var h = document.createElement("p");
      h.innerHTML = "<strong>Ask your plan these questions:</strong>";
      box.appendChild(h);
      if (list) box.appendChild(list.cloneNode(true));
      answer.appendChild(box);
    } else {
      var src = document.getElementById(v);
      if (!src) return;
      var c = src.cloneNode(true);
      c.removeAttribute("id");
      c.classList.add("ins-chosen");
      var d = c.querySelector("details");
      if (d) { d.open = true; d.classList.add("ins-ready"); }
      answer.appendChild(c);
    }
    answer.appendChild(links());
    // "#pick-<insurer>", never the card's own id: a link to "#ufe-aetna" made the browser open the folded full list and
    // jump to the closed card there, so the hub's route ended on a different screen (his note, HQ chat 2026-11-15 21:51 CT)
    if (!keepHash && history.replaceState) history.replaceState(null, "", "#pick-" + v);
    // Walkthrough 2026-11-15 run 2 item A: the answer can land below a phone's first screen; bring it up after a pick
    if (!keepHash && answer.firstChild && answer.scrollIntoView) {
      var reduce = false; try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
      answer.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    }
  }
  function fromHash() {
    var id = location.hash.slice(1), v = id.indexOf("pick-") === 0 ? id.slice(5) : id;
    if (!pick || !v) return false;
    for (var i = 0; i < who.options.length; i++) {
      if (who.options[i].value === v) {
        who.value = v; show(v, true);
        if (all) all.open = false;   // undo the browser opening the full list for an old "#ufe-aetna" link
        if (id !== "pick-" + v && history.replaceState) history.replaceState(null, "", "#pick-" + v);
        var up = function () { answer.scrollIntoView({ block: "start" }); };
        up(); requestAnimationFrame(up); window.addEventListener("load", up, { once: true });
        return true;
      }
    }
    return false;
  }
  function openTarget() {
    if (fromHash()) return;
    var id = location.hash.slice(1), el = id && document.getElementById(id);
    if (!el) return;
    var d = el.querySelector("details.ins-more");   // a jump to a card opens that card
    if (d) d.open = true;
    for (var p = el.parentElement; p; p = p.parentElement) if (p.tagName === "DETAILS") p.open = true;   // a source number opens the folded list
  }
  function apply() {
    for (var i = 0; i < folds.length; i++) { folds[i].open = wide.matches; folds[i].classList.add("ins-ready"); }
    openTarget();
  }
  if (pick) {
    pick.hidden = false;
    var jump = document.querySelector(".ins-jump");
    if (jump) jump.hidden = true;
    if (all) all.open = false;
    who.addEventListener("change", function () { show(who.value); });
  }
  apply();
  wide.addEventListener("change", apply);
  window.addEventListener("hashchange", openTarget);
  document.addEventListener("click", function (ev) {   // a repeat tap on the same link fires no hashchange
    var a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (a) setTimeout(openTarget, 0);
  });

  var hub = document.getElementById("ins-pick-hub");
  if (hub) {
    hub.hidden = false;
    var cond = document.getElementById("ins-cond"), ins = document.getElementById("ins-who"), msg = document.getElementById("ins-pick-msg");
    cond.addEventListener("change", function () { cond.removeAttribute("aria-invalid"); msg.textContent = ""; });
    hub.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!cond.value) { msg.textContent = "Select a condition."; cond.setAttribute("aria-invalid", "true"); cond.focus(); return; }
      if (cond.value === "none") { msg.textContent = "We have not checked insurers for this condition yet."; return; }
      var key = cond.options[cond.selectedIndex].getAttribute("data-key"), w = ins.value;
      location.href = cond.value + (w === "none" ? "#pick-none" : w ? "#pick-" + key + "-" + w : "");
    });
  }
})();
