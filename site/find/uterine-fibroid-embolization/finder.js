(function () {
  var data, zips;
  var $ = function (id) { return document.getElementById(id); };
  function miles(a, b, c, d) {
    var R = 3958.8, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
    var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) * Math.sin(y / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function card(r) {
    var li = el('li'), top = el('div', 'top');
    top.appendChild(el('span', 'name', r.name + (r.credential ? ', ' + r.credential.replace(/\./g, '') : '')));
    top.appendChild(el('span', 'dist', r.d.toFixed(1) + ' mi'));
    li.appendChild(top);
    if (r.kind !== 'practice' && r.practice) li.appendChild(el('div', 'practice', r.practice));
    li.appendChild(el('div', 'addr', r.address));
    var b = el('span', 'badge' + (r.kind === 'listed' ? ' listed' : ''), r.kind === 'listed' ? 'Listed · UFE not confirmed' : r.kind === 'practice' ? 'Sourced · UFE offered at this practice' : 'Sourced · UFE');
    li.appendChild(b);
    var act = el('div', 'actions');
    if (r.phone) { var a = el('a', '', r.phone); a.href = 'tel:' + r.phone.replace(/\D/g, ''); act.appendChild(a); }
    if (r.website) { var w = el('a', '', r.kind === 'physician' ? 'Profile' : 'Website'); w.href = r.website; w.rel = 'noopener noreferrer'; act.appendChild(w); }
    li.appendChild(act);
    (r.sources || []).forEach(function (s) {
      var p = el('div', 'src', 'Source: '); var a = el('a', '', s.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60));
      a.href = s.url; a.rel = 'noopener noreferrer'; p.appendChild(a); p.appendChild(document.createTextNode(', checked ' + s.checked)); li.appendChild(p);
    });
    li.appendChild(el('div', 'src', 'Not yet confirmed by this ' + (r.kind === 'practice' ? 'practice' : 'physician') + '.'));
    return li;
  }
  function run(e) {
    if (e) e.preventDefault();
    var z = $('zip').value.trim(), R = +$('radius').value, out = $('results');
    out.textContent = '';
    if (!/^\d{5}$/.test(z)) { $('status').textContent = 'Enter a 5-digit zip code.'; return; }
    var c = zips.zips[z];
    if (!c) { $('status').textContent = 'That zip is outside the area this preview covers (New York, New Jersey, Connecticut).'; return; }
    var rows = data.sourced.concat($('listed').checked ? data.listed : []).map(function (r) {
      return Object.assign({ d: miles(c[0], c[1], r.lat, r.lon) }, r);
    }).filter(function (r) { return r.d <= R; }).sort(function (a, b) { return a.d - b.d; });
    var n = rows.filter(function (r) { return r.kind !== 'listed'; }).length;
    $('status').textContent = n + ' sourced result' + (n === 1 ? '' : 's') + ' within ' + R + ' miles of ' + z + ($('listed').checked ? ', plus ' + (rows.length - n) + ' listed' : '') + '.';
    rows.forEach(function (r) { out.appendChild(card(r)); });
  }
  Promise.all([fetch('../../data/ufe-nyc.json').then(function (r) { return r.json(); }), fetch('../../data/zip-centroids-nyc.json').then(function (r) { return r.json(); })])
    .then(function (v) {
      data = v[0]; zips = v[1];
      $('f').addEventListener('submit', run); $('listed').addEventListener('change', function () { if ($('zip').value) run(); });
      var q = new URLSearchParams(location.search).get('zip'); if (q) { $('zip').value = q; run(); }
    })
    .catch(function () { $('status').textContent = 'The directory data could not load.'; });
})();
