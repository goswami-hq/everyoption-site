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
    var li = el('li', r.kind === 'practice' ? 'prac' : ''), top = el('div', 'top');
    // A practice with no name its source page supports gets a neutral title from its address; never an invented name.
    var title = r.name || (r.kind === 'practice' ? 'Practice at ' + r.address.split(',').slice(0, 2).join(',') : 'Name not available');
    top.appendChild(el('span', 'name', title + (r.credential ? ', ' + r.credential.replace(/\./g, '') : '')));
    top.appendChild(el('span', 'dist', r.d.toFixed(1) + ' mi'));
    li.appendChild(top);
    if (r.kind !== 'practice' && r.practice) li.appendChild(el('div', 'practice', r.practice));
    li.appendChild(el('div', 'addr', r.address));
    var b = el('span', 'badge' + (r.kind === 'listed' ? ' listed' : ''), r.kind === 'listed' ? 'Listed · UFE not confirmed' : r.kind === 'practice' ? 'Practice-level source · UFE offered here' : (r.tier_label || 'Sourced') + ' · UFE');
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
    var z = $('zip').value.trim(), R = +$('radius').value, showListed = $('listed').checked;
    ['phys', 'prac', 'listed'].forEach(function (k) { $('res-' + k).textContent = ''; $('sec-' + k).hidden = true; });
    if (!/^\d{5}$/.test(z)) { $('status').textContent = 'Enter a 5-digit zip code.'; return; }
    var c = zips.zips[z];
    if (!c) { $('status').textContent = 'That zip is outside the area this preview covers (New York, New Jersey, Connecticut).'; return; }
    // Each section is sorted by distance only; the order of the sections follows evidence strength.
    function near(list) {
      return list.map(function (r) { return Object.assign({ d: miles(c[0], c[1], r.lat, r.lon) }, r); })
        .filter(function (r) { return r.d <= R; }).sort(function (a, b) { return a.d - b.d; });
    }
    var sec = { phys: near(data.physicians), prac: near(data.practices), listed: showListed ? near(data.listed) : [] };
    var np = sec.phys.length, nq = sec.prac.length;
    $('status').textContent = 'Within ' + R + ' miles of ' + z + ': ' + np + ' physician' + (np === 1 ? '' : 's') + ', ' + nq + ' practice' + (nq === 1 ? '' : 's') +
      (showListed ? ', ' + sec.listed.length + ' not yet confirmed' : '') + '.';
    ['phys', 'prac', 'listed'].forEach(function (k) {
      if (k === 'listed' && !showListed) return;
      $('sec-' + k).hidden = false;
      if (!sec[k].length) { $('res-' + k).appendChild(el('li', 'empty', 'None within ' + R + ' miles.')); return; }
      sec[k].forEach(function (r) { $('res-' + k).appendChild(card(r)); });
    });
  }
  Promise.all([fetch('../../data/ufe-nyc.json').then(function (r) { return r.json(); }), fetch('../../data/zip-centroids-nyc.json').then(function (r) { return r.json(); })])
    .then(function (v) {
      data = v[0]; zips = v[1];
      $('f').addEventListener('submit', run); $('listed').addEventListener('change', function () { if ($('zip').value) run(); });
      var q = new URLSearchParams(location.search).get('zip'); if (q) { $('zip').value = q; run(); }
    })
    .catch(function () { $('status').textContent = 'The directory data could not load.'; });
})();
