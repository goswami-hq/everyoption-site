// Every Option finder: loads one procedure's list and the ZIP center table, sorts by distance in the browser.
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

  // Job 7: one badge only. "verified" is shown as "Interventional radiologist"; any other value is a plain specialty.
  var BADGE = { "verified": "Interventional radiologist" };
  var BADGE_TITLE = {
    "verified": "Identified as an interventional radiologist from their own or their practice's page, or from public Medicare billing records"
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
  function showPhone(p) {          // display only: bare 10-digit numbers as (xxx) xxx-xxxx; anything else as written
    var d = (p || "").replace(/\D/g, "");
    if (/^\d+$/.test((p || "").trim()) && (d.length === 10 || (d.length === 11 && d[0] === "1"))) {
      d = d.slice(-10); return "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
    }
    return p;
  }
  function telHref(p) { var d = (p || "").replace(/[^0-9+]/g, ""); return d.length >= 10 ? "tel:" + d : ""; }

  // Job 10: a confirmed doctor's card may carry a photo, a blurb, insurances, a booking link, and more offices. Each
  // shows only when supplied; an unconfirmed card looks as before.
  function safeHttps(u) { try { var x = new URL(u); return x.protocol === "https:" ? x.href : ""; } catch (e) { return ""; } }
  function card(p) {
    var kids = [];
    var photo = p.photo && /^\/photos\/[0-9]{10}-[0-9a-f]{8,32}\.(jpg|png|webp)$/.test(p.photo)
      ? el("img", { "class": "photo", src: p.photo, alt: "Photo of " + p.name, width: "64", height: "64", loading: "lazy", decoding: "async" }) : null;
    var top = el("div", { "class": "top" }, [
      photo,
      el("div", { "class": "who" }, [
        el("h3", { text: p.name }),
        p.badge ? el("span", { "class": "badge", title: BADGE_TITLE[p.badge] || "", text: BADGE[p.badge] || p.badge }) : null
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
    if (p.blurb) kids.push(el("p", { "class": "blurb", text: p.blurb }));
    var ins = (p.insurances || []).slice();
    if (p.insurance_other) ins.push(p.insurance_other);
    if (ins.length || p.insurance_confirm) kids.push(el("p", { "class": "ins" }, [
      el("span", { "class": "k", text: "Insurance: " }),
      ins.length ? ins.join(", ") + (p.insurance_confirm ? ". " : "") : "",
      p.insurance_confirm ? el("span", { "class": "confirm", text: "Confirm with the office." }) : null
    ]));
    var acts = [];
    var tel = telHref(p.phone);
    if (tel) acts.push(el("a", { "class": "call", href: tel, text: "Call " + showPhone(p.phone) }));
    var book = p.booking_url ? safeHttps(p.booking_url) : "";
    if (book) acts.push(el("a", { "class": "book", href: book, rel: "noopener nofollow", target: "_blank", text: "Book online" }));
    if (p.url) acts.push(el("a", { href: p.url, rel: "noopener nofollow", target: "_blank", text: "Doctor's page" }));
    if (acts.length) kids.push(el("div", { "class": "actions" }, acts));
    var more = (p.offices || []).slice(1);
    if (more.length) kids.push(el("div", { "class": "offices" }, [
      el("p", { "class": "k", text: more.length === 1 ? "Also sees patients at" : "Also sees patients at " + more.length + " more offices" }),
      el("ul", null, more.map(function (o) {
        var t = telHref(o.phone);
        return el("li", null, [(o.practice ? o.practice + ", " : "") + o.city + ", " + o.state,
          t ? " · " : null, t ? el("a", { href: t, text: showPhone(o.phone) }) : null]);
      }))
    ]));
    var q = "?npi=" + encodeURIComponent(p.npi) + "&procedure=" + PROC + "&name=" + encodeURIComponent(p.name);
    kids.push(el("p", { "class": "claim", style: "margin:10px 0 0" }, p.confirmed
      ? [el("a", { href: "/claim/" + q, text: "Report an error" }), " on this listing."]
      : [el("a", { href: "/account/" + q, text: "Is this you?" }), " Confirm or correct this listing."]));
    return el("li", { "class": "card" + (p.confirmed ? " confirmed" : "") }, kids);
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
        " We found no one within " + r + " miles of " + zip + " for this procedure."]),
      el("p", { text: "A blank is not a no: we may not have found them yet." })
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
      var d = res[0], center = res[1][zip];
      if (!center) { say("We don't have a location for ZIP " + zip + ". Check the number, or try a nearby ZIP.", "err"); return; }
      var near = d.people.filter(function (p) { return p.lat !== null && p.lon !== null; }).map(function (p) {
        var c = Object.assign({}, p); c.miles = miles(center, [p.lat, p.lon]); return c;
      }).filter(function (p) { return p.miles <= r; }).sort(function (a, b) { return a.miles - b.miles || (a.name < b.name ? -1 : 1); });
      var confirmed = near.filter(function (p) { return p.confirmed; }), likely = near.filter(function (p) { return !p.confirmed; });
      try { history.replaceState(null, "", "?zip=" + zip + "&r=" + r); } catch (e) {}
      if (!near.length) { say(""); out.appendChild(widen(zip, r)); return; }
      say(near.length + (near.length === 1 ? " doctor" : " doctors") + " within " + r + " miles of " + zip + ", nearest first.");
      if (confirmed.length) out.appendChild(section(confirmed, "tier-a", "Performs this procedure, confirmed by physician",
        "The doctor confirmed this with us. Nearest first."));
      else out.appendChild(el("section", { "class": "tier tier-a", "aria-label": "Performs this procedure, confirmed by physician" }, [
        el("h2", null, ["Performs this procedure, confirmed by physician", el("span", { "class": "count", text: "0 doctors" })]),
        el("p", { "class": "tier-note" }, ["No doctor near this ZIP has confirmed yet. Are you a doctor who performs this procedure? ",
          el("a", { href: "/claim/?procedure=" + encodeURIComponent(PROC), text: "Confirm your listing" }), ". It's free."])
      ]));
      if (likely.length) out.appendChild(section(likely, "tier-b", "Likely performs this procedure",
        "Based on public information online. Call the office to confirm. Nearest first."));
      out.appendChild(el("p", { "class": "small muted", style: "margin-top:18px" }, [
        "Distances are between ZIP centers, not street addresses. ",
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
