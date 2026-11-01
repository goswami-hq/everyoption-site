// Every Option finder: loads one procedure's list and the ZIP centre table, sorts by distance in the browser.
// No cookies, no storage, no third-party requests. The ZIP typed stays in this page (and its address bar).
(function () {
  "use strict";
  var root = document.getElementById("finder");
  if (!root) return;
  var PROC = root.getAttribute("data-procedure");
  var PAGE = 20;                       // cards shown per section before "Show more"
  var RADII = [25, 50, 100, 250];
  var form = document.getElementById("zip-form");
  var zipIn = document.getElementById("zip");
  var radiusIn = document.getElementById("radius");
  var statusEl = document.getElementById("status");
  var out = document.getElementById("results");
  var data = null, loading = null;

  var BADGE = { "verified": "Interventional radiologist", "by procedure": "Does IR procedures", "by billing": "Bills IR procedures" };
  var BADGE_TITLE = {
    "verified": "Their own page states interventional radiology training or board certification",
    "by procedure": "Their own page says they perform catheter procedures interventional radiologists do",
    "by billing": "Public Medicare billing records show interventional radiology procedures"
  };
  var KIND = {
    "own_page": "From the doctor's own page",
    "own_page (search excerpt)": "From a search-engine excerpt of the doctor's own page",
    "search_preview": "From a search-result preview",
    "practice_page": "From the practice's page",
    "registry_copy": "From a directory listing of the doctor's profile",
    "clinicaltrials": "From ClinicalTrials.gov",
    "medicare_ps": "From public Medicare billing records"
  };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function say(msg, kind) {
    statusEl.innerHTML = "";
    if (!msg) return;
    statusEl.appendChild(typeof msg === "string" ? el("p", { "class": kind || "", text: msg }) : msg);
  }
  function getJSON(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  function loadData() {
    if (data) return Promise.resolve(data);
    if (!loading) loading = getJSON("/data/" + PROC + ".json").then(function (d) { data = d; return d; },
      function (e) { loading = null; throw e; });
    return loading;
  }
  function miles(a, b) {
    var R = 3958.8, rad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }
  function showPhone(p) {          // display only: bare 10-digit numbers as (xxx) xxx-xxxx; anything else as written
    var d = (p || "").replace(/\D/g, "");
    if (/^\d+$/.test((p || "").trim()) && (d.length === 10 || (d.length === 11 && d[0] === "1"))) {
      d = d.slice(-10); return "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
    }
    return p;
  }
  function telHref(p) { var d = (p || "").replace(/[^0-9+]/g, ""); return d.length >= 10 ? "tel:" + d : ""; }

  function card(p) {
    var kids = [];
    var top = el("div", { "class": "top" }, [
      el("div", null, [
        el("h3", { text: p.name }),
        p.badge ? el("span", { "class": "badge", title: BADGE_TITLE[p.badge] || "", text: BADGE[p.badge] || "" }) : null
      ]),
      el("span", { "class": "dist", text: p.miles < 1 ? "under 1 mi" : Math.round(p.miles) + " mi" })
    ]);
    kids.push(top);
    var where = el("p", { "class": "where" }, [
      p.practice ? el("span", { "class": "practice", text: p.practice }) : null,
      p.practice ? el("br") : null,
      p.city + ", " + p.state,
      p.city_label ? el("span", { "class": "label", text: p.city_label }) : null
    ]);
    kids.push(where);
    var acts = [];
    var tel = telHref(p.phone);
    if (tel) acts.push(el("a", { "class": "call", href: tel, text: "Call " + showPhone(p.phone) }));
    if (p.url) acts.push(el("a", { href: p.url, rel: "noopener nofollow", target: "_blank", text: "Doctor's page" }));
    if (acts.length) kids.push(el("div", { "class": "actions" }, acts));
    var e = p.evidence || {};
    var ev = el("div", { "class": "evidence" }, [
      el("span", { "class": "kind", text: KIND[e.kind] || "Evidence" }),
      !e.text ? null : e.kind === "clinicaltrials" || e.kind === "medicare_ps" ? el("span", { text: e.text }) : el("q", { text: e.text }),
      e.url ? el("a", { "class": "src", href: e.url, rel: "noopener nofollow", target: "_blank",
        text: "Source: " + (host(e.url) || e.url) }) : null
    ]);
    kids.push(ev);
    var q = "?npi=" + encodeURIComponent(p.npi) + "&procedure=" + PROC + "&name=" + encodeURIComponent(p.name);
    kids.push(el("p", { "class": "claim", style: "margin:10px 0 0" }, [
      el("a", { href: "/claim/" + q, text: "Is this you?" }), " Correct or claim this listing."
    ]));
    return el("li", { "class": "card" }, kids);
  }

  function section(list, cls, title, note) {
    var ol = el("ol", { "class": "cards" });
    var shown = 0;
    var moreBtn = el("button", { "class": "secondary more", type: "button" });
    function more() {
      list.slice(shown, shown + PAGE).forEach(function (p) { ol.appendChild(card(p)); });
      shown = Math.min(list.length, shown + PAGE);
      if (shown >= list.length) moreBtn.remove();
      else moreBtn.textContent = "Show " + Math.min(PAGE, list.length - shown) + " more (" + (list.length - shown) + " left)";
    }
    moreBtn.addEventListener("click", more);
    var s = el("section", { "class": "tier " + cls, "aria-label": title }, [
      el("h2", null, [title, el("span", { "class": "count", text: list.length + (list.length === 1 ? " doctor" : " doctors") })]),
      el("p", { "class": "tier-note", text: note }),
      ol
    ]);
    more();
    if (shown < list.length) s.appendChild(moreBtn);
    return s;
  }

  function widen(zip, r) {
    var bigger = RADII.filter(function (x) { return x > r; });
    var box = el("div", { "class": "notice", role: "status" }, [
      el("p", null, [el("strong", { text: "No doctors found near this ZIP." }),
        " We found no one within " + r + " miles of " + zip + " with evidence for this procedure."]),
      el("p", { text: "A blank is not a no: we may not have found their page yet." })
    ]);
    if (bigger.length) {
      var p = el("p");
      bigger.forEach(function (b) {
        var btn = el("button", { "class": "secondary", type: "button", style: "margin:4px 8px 0 0", text: "Search within " + b + " miles" });
        btn.addEventListener("click", function () { radiusIn.value = String(b); run(zip, b); });
        p.appendChild(btn);
      });
      box.appendChild(p);
    }
    return box;
  }

  function run(zip, r) {
    out.innerHTML = "";
    if (!/^\d{5}$/.test(zip)) { say("Enter a 5-digit ZIP code.", "err"); zipIn.focus(); return; }
    var btn = form.querySelector("button");
    btn.disabled = true; btn.textContent = "Searching…";
    say("Loading doctors near " + zip + "…");
    out.setAttribute("aria-busy", "true");
    Promise.all([loadData(), getJSON("/data/zip/" + zip.slice(0, 3) + ".json").catch(function (e) {
      if (/HTTP 404/.test(e.message)) return {}; throw e;
    })]).then(function (res) {
      var d = res[0], centre = res[1][zip];
      if (!centre) { say("We don't have a location for ZIP " + zip + ". Check the number, or try a nearby ZIP.", "err"); return; }
      var near = d.people.filter(function (p) { return p.lat !== null && p.lon !== null; }).map(function (p) {
        var c = Object.assign({}, p); c.miles = miles(centre, [p.lat, p.lon]); return c;
      }).filter(function (p) { return p.miles <= r; }).sort(function (a, b) { return a.miles - b.miles || (a.name < b.name ? -1 : 1); });
      var A = near.filter(function (p) { return p.grade === "A"; }), B = near.filter(function (p) { return p.grade === "B"; });
      try { history.replaceState(null, "", "?zip=" + zip + "&r=" + r); } catch (e) {}
      if (!near.length) { say(""); out.appendChild(widen(zip, r)); return; }
      say(near.length + (near.length === 1 ? " doctor" : " doctors") + " within " + r + " miles of " + zip + ", nearest first.");
      if (A.length) out.appendChild(section(A, "tier-a", "Performs this procedure",
        "Their own page says they perform it. The evidence is under each name."));
      else out.appendChild(el("div", { "class": "notice" }, [el("p", { text: "No one within " + r + " miles has evidence that they perform it themselves. The doctors below list it; confirm with the practice." })]));
      if (B.length) out.appendChild(section(B, "tier-b", "Lists this procedure; confirm with the practice",
        "A page lists or mentions it, but does not say this doctor performs it. Call before you book."));
      out.appendChild(el("p", { "class": "small muted", style: "margin-top:18px" }, [
        "Distances are between ZIP centres, not street addresses. ",
        el("a", { href: "/how-we-know/", text: "How we know" })]));
    }).catch(function () {
      var retry = el("button", { "class": "secondary", type: "button", text: "Try again" });
      retry.addEventListener("click", function () { run(zip, r); });
      say(el("div", { "class": "notice", role: "alert" }, [el("p", { text: "We couldn't load the list. Check your connection and try again." }), retry]));
    }).then(function () {
      btn.disabled = false; btn.textContent = "Find doctors"; out.removeAttribute("aria-busy");
    });
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    run(zipIn.value.trim(), parseInt(radiusIn.value, 10) || 50);
  });
  var qs = new URLSearchParams(location.search);
  var z = qs.get("zip"), rr = parseInt(qs.get("r"), 10);
  if (RADII.indexOf(rr) >= 0) radiusIn.value = String(rr);
  if (z && /^\d{5}$/.test(z)) { zipIn.value = z; run(z, parseInt(radiusIn.value, 10)); }
  else loadData().catch(function () {});   // warm the list while the ZIP is typed
})();
