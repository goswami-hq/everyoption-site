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
    if (!loading) loading = Promise.all([getJSON("/data/" + PROC + ".json"), loadTest()]).then(function (x) {
      data = x[0]; if (x[1].length) data = Object.assign({}, data, { people: x[1].concat(data.people) }); return data; },
      function (e) { loading = null; throw e; });
    return loading;
  }
  // Job 18: the IR roster (site/data/ir-roster.json, ai-hq scripts/v3_job17.py): interventional radiologists on no
  // procedure list. Loaded only when a search comes up thin. Only proven IRs with a phone or doctor's page; no
  // billing-only and no neurointerventional-only doctors.
  var roster = null, rosterLoading = null;
  function loadRoster() {
    if (roster) return Promise.resolve(roster);
    if (!rosterLoading) rosterLoading = getJSON("/data/ir-roster.json").then(function (d) {
      roster = (d.people || []).filter(function (p) {
        return p.proven && !p.billing_only && !p.neuro_only && (p.phone || p.url) && p.lat != null && p.lon != null;
      }).map(function (p) {
        return { npi: p.npi, name: p.name, badge: "verified", practice: p.practice || "", city: p.city, state: p.state,
          city_label: p.city_label || "", phone: p.phone || "", url: p.url || "", lat: p.lat, lon: p.lon, confirmed: false,
          ask: true, names_it: (p.site_names || []).indexOf(PROC) >= 0 };
      });
      return roster;
    }, function () { rosterLoading = null; roster = []; return roster; });
    return rosterLoading;
  }
  var THIN = 5, FAR = 250, FAR_SHOW = 5;
  function askLine() {
    var long = (window.EO_PROCS && window.EO_PROCS.long[PROC]) || "";   // site/assets/procedures.js, the shared list
    var n = (root.getAttribute("data-procedure-name") || "").trim() || (long ? long[0].toLowerCase() + long.slice(1) : "this procedure");
    return "Ask: do you perform " + n + "?";
  }

  function miles(a, b) {
    var R = 3958.8, rad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function mi(m) { return m < 1 ? "under 1 mi" : Math.round(m) + " mi"; }
  // Job 16: every office with a point is checked against the radius. The doctor appears once, at their closest office
  // inside it (equal distances: the office the doctor listed first); a doctor with no office inside it is left out.
  // Offices with no point, and doctors with no offices, fall back to the card's own point.
  function place(p, center, r) {
    var c = Object.assign({}, p), best = null;
    if (p.offices && p.offices.some(function (o) { return o.lat != null && o.lon != null; })) {
      c.offices = p.offices.map(function (o) {
        var x = Object.assign({}, o);
        x.miles = o.lat != null && o.lon != null ? miles(center, [o.lat, o.lon]) : null;
        if (x.miles != null && x.miles <= r && (!best || x.miles < best.miles)) best = x;
        return x;
      });
      if (!best) return null;
      c.lead = best; c.miles = best.miles; return c;
    }
    if (p.lat === null || p.lon === null || p.lat === undefined) return null;
    c.miles = miles(center, [p.lat, p.lon]);
    return c.miles <= r ? c : null;
  }
  // Job 16 test profile (his words, 2026-11-02): made-up, loaded only on localhost and *.pages.dev, never live.
  var TEST_AVATAR = "/assets/test-avatar.svg";
  function testHost(h) { return h === "localhost" || /^[a-z0-9-]+\.everyoption-site\.pages\.dev$/.test(h); }   // branch previews, not the bare production alias
  function loadTest() {
    if (!testHost(location.hostname)) return Promise.resolve([]);
    return getJSON("/data/test-profile.json").then(function (t) {
      return (t.people || []).filter(function (p) { return (p.procedures || []).indexOf(PROC) >= 0; })
        .map(function (p) { var c = Object.assign({}, p, (p.blurbs || {})[PROC] ? { blurb: p.blurbs[PROC] } : {}); c.test = true; return c; });
    }, function () { return []; });
  }

  function showPhone(p) {          // every US number as (xxx) xxx-xxxx, any extension after; anything else as written
    var m = (p || "").match(/^\s*(\+?1[\s.\-]*)?\(?(\d{3})\)?[\s.\-]*(\d{3})[\s.\-]*(\d{4})\s*(?:(?:ext\.?|extension|x)\s*(\d+))?\s*(?:\([^)]*\))?\s*$/i);
    if (!m) return p;
    return "(" + m[2] + ") " + m[3] + "-" + m[4] + (m[5] ? " ext. " + m[5] : "");
  }
  function telHref(p) {            // the number only: an extension or a label never joins the dialed digits
    var m = (p || "").match(/^\s*(\+?1[\s.\-]*)?\(?(\d{3})\)?[\s.\-]*(\d{3})[\s.\-]*(\d{4})/);
    if (m) return "tel:+1" + m[2] + m[3] + m[4];
    var d = (p || "").replace(/[^0-9+]/g, ""); return d.length >= 10 ? "tel:" + d : "";
  }

  // Job 10: a confirmed doctor's card may carry a photo, a blurb, insurances, a booking link, and more offices. Each
  // shows only when supplied; an unconfirmed card looks as before.
  function safeWeb(u) { try { var x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } }
  function safeHttps(u) { try { var x = new URL(u); return x.protocol === "https:" ? x.href : ""; } catch (e) { return ""; } }
  function card(p) {
    var kids = [];
    var photo = p.photo && (/^\/photos\/[0-9]{10}-[0-9a-f]{8,32}\.(jpg|png|webp)$/.test(p.photo) || (p.test && p.photo === TEST_AVATAR))
      ? el("img", { "class": "photo", src: p.photo, alt: "Photo of " + p.name, width: "64", height: "64", loading: "lazy", decoding: "async" }) : null;
    var top = el("div", { "class": "top" }, [
      photo,
      el("div", { "class": "who" }, [
        el("h3", { text: p.name }),
        p.badge ? el("span", { "class": "badge", title: BADGE_TITLE[p.badge] || "", text: BADGE[p.badge] || p.badge }) : null
      ]),
      el("span", { "class": "dist", text: mi(p.miles) })
    ]);
    var lead = p.lead || null;            // job 16: the doctor's closest office inside the radius leads the card
    if (p.confirmed) kids.push(el("p", { "class": "confirmed-tag" }, ["\u2713 Confirmed by physician"]));
    if (p.ask) kids.push(el("p", { "class": "ask-tag" }, [askLine()]));
    kids.push(top);
    var practice = lead ? lead.practice : p.practice;
    var where = el("p", { "class": "where" }, [
      practice ? el("span", { "class": "practice", text: practice }) : null,
      practice ? el("br") : null,
      lead && lead.street ? lead.street : null,
      lead && lead.street ? el("br") : null,
      lead ? lead.city + ", " + lead.state : p.city + ", " + p.state,
      !lead && p.city_label ? el("span", { "class": "label", text: p.city_label }) : null
    ]);
    kids.push(where);
    if (lead && lead.geo === "address") kids.push(el("p", { "class": "dist-note small muted", text: "Distance is from the center of your ZIP code to this office." }));
    if (p.blurb) kids.push(el("p", { "class": "blurb", text: p.blurb }));
    var ins = (p.insurances || []).slice();
    if (p.insurance_other) ins.push(p.insurance_other);
    if (ins.length || p.insurance_confirm) kids.push(el("p", { "class": "ins" }, [
      el("span", { "class": "k", text: "Insurance: " }),
      ins.length ? ins.join(", ") + (p.insurance_confirm ? ". " : "") : "",
      p.insurance_confirm ? el("span", { "class": "confirm", text: "Confirm with the office." }) : null
    ]));
    var acts = [];
    var phone = lead && lead.phone ? lead.phone : p.phone;
    var tel = telHref(phone);
    if (tel) acts.push(el("a", { "class": "call", href: tel, text: "Call " + showPhone(phone) }));
    var book = p.booking_url ? safeHttps(p.booking_url) : "";
    if (book) acts.push(el("a", { "class": "book", href: book, rel: "noopener nofollow", target: "_blank", text: "Book online" }));
    var page = p.url ? safeWeb(p.url) : "";
    if (page) acts.push(el("a", { href: page, rel: "noopener nofollow", target: "_blank", text: "Doctor's page" }));
    if (acts.length) kids.push(el("div", { "class": "actions" }, acts));
    var all = p.offices || [];             // one office: no extra list
    if (all.length > 1) kids.push(el("div", { "class": "offices" }, [
      el("p", { "class": "k", text: "All offices (" + all.length + ")" }),
      el("ul", null, all.map(function (o) {
        var t = telHref(o.phone);
        return el("li", { "class": o === lead ? "lead" : "" }, [
          o.practice ? el("span", { "class": "practice", text: o.practice }) : null, o.practice ? el("br") : null,
          (o.street ? o.street + ", " : "") + o.city + ", " + o.state + (o.zip ? " " + o.zip : ""),
          o.miles != null ? el("span", { "class": "odist", text: "\u00a0· " + mi(o.miles) }) : null,
          t ? el("br") : null, t ? el("a", { href: t, text: showPhone(o.phone) }) : null]);
      }))
    ]));
    var q = "?npi=" + encodeURIComponent(p.npi) + "&procedure=" + PROC + "&name=" + encodeURIComponent(p.name);
    // Job 19: one quiet line. Claiming needs an account (physicians only); anyone can report an error.
    var report = el("a", { href: "/report/" + q, text: "Report an error" });
    kids.push(el("p", { "class": "claim", style: "margin:10px 0 0" }, p.confirmed ? [report]
      : [el("a", { href: "/account/" + q, text: "Is this you?" }), el("span", { "class": "sep", "aria-hidden": "true", text: "·" }), report]));
    return el("li", { "class": p.confirmed ? "card card-confirmed" : "card" }, kids);
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
      var near = d.people.map(function (p) { return place(p, center, r); }).filter(Boolean)
        .sort(function (a, b) { return a.miles - b.miles || (a.name < b.name ? -1 : 1); });
      var confirmed = near.filter(function (p) { return p.confirmed; }), likely = near.filter(function (p) { return !p.confirmed; });
      try { history.replaceState(null, "", "?zip=" + zip + "&r=" + r); } catch (e) {}
      var thin = near.length < THIN;
      return (thin ? loadRoster() : Promise.resolve([])).then(function (ros) {
        // Job 18: nobody appears in two groups. The roster holds no one on a procedure list; skip any NPI already shown.
        var listed = {}; d.people.forEach(function (p) { listed[p.npi] = 1; });
        var pool = ros.filter(function (p) { return !listed[p.npi]; });
        var irs = thin ? pool.map(function (p) { return place(p, center, r); }).filter(Boolean)
          .sort(function (a, b) { return (b.names_it - a.names_it) || a.miles - b.miles || (a.name < b.name ? -1 : 1); }) : [];
        var shown = {}; near.concat(irs).forEach(function (p) { shown[p.npi] = 1; });
        var far = [];
        if (near.length + irs.length < THIN) {        // still thin: the nearest beyond the radius, up to 250 miles
          far = d.people.concat(pool).filter(function (p) { return !shown[p.npi]; })
            .map(function (p) { return place(p, center, FAR); }).filter(function (p) { return p && p.miles > r; })
            .sort(function (a, b) { return a.miles - b.miles || (a.name < b.name ? -1 : 1); }).slice(0, FAR_SHOW);
        }
        var total = near.length + irs.length;
        if (!total && !far.length) {
          say("");
          out.appendChild(el("div", { "class": "notice referral", role: "status" }, [
            el("p", { text: "Ask your doctor to refer you to an interventional radiologist." })]));
          return;
        }
        say(total ? total + (total === 1 ? " doctor" : " doctors") + " within " + r + " miles of " + zip + ", nearest first."
          : "No doctors within " + r + " miles of " + zip + ". The nearest we know of are below.");
        if (confirmed.length) out.appendChild(section(confirmed, "tier-a", "Confirmed by physician",
          "These doctors confirmed they perform this procedure. Nearest first."));
        else out.appendChild(el("section", { "class": "tier tier-empty", "aria-label": "Confirmed by physician" }, [
          el("p", null, [el("strong", { text: "Confirmed by physician: 0 nearby." })]),
          el("p", null, ["Are you a doctor who performs this? ",
            el("a", { href: "/account/?procedure=" + encodeURIComponent(PROC), text: "Confirm your listing" }), ". It's free."])
        ]));
        if (likely.length) out.appendChild(section(likely, "tier-b", "Likely performs this procedure",
          "Based on public information online. Call the office to confirm. Nearest first."));
        if (irs.length) out.appendChild(section(irs, "tier-c", "Interventional radiologists nearby",
          "These doctors are interventional radiologists near you. We couldn't confirm they perform this procedure, so call and ask."));
        if (far.length) out.appendChild(section(far, "tier-far", "Nearest doctors farther away",
          "The nearest doctors we know of beyond " + r + " miles. Nearest first."));
        out.appendChild(el("p", { "class": "small muted", style: "margin-top:18px" }, [
          "Distances run from the center of your ZIP code: to the doctor's office when we could place its street address on the map, otherwise to the center of the doctor's ZIP code. ",
          el("a", { href: "/how-we-know/", text: "How we know" })]));
        var learn = root.getAttribute("data-learn"), sp = statusEl.querySelector("p");
        if (learn && sp && total) { sp.appendChild(document.createTextNode(" ")); sp.appendChild(el("a", { href: learn, text: "See all options." })); }
      });
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
