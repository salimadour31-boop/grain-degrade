/*
 * app.js — Interface de Grain Dégradé : points déplaçables, réglages, préréglages,
 * formats, exports (PNG, CSS, JSON), import JSON, lien partageable et langues.
 * Le rendu lui-même est dans gradient.js. Licence MIT.
 */
(function () {
  'use strict';
  var GD = window.GD, I18N = window.I18N;
  var $ = function (id) { return document.getElementById(id); };
  var LS_LANG = 'grain-degrade-lang';

  /* ---------- Curseurs des panneaux (clé, min, max, pas) ---------- */
  var GROUPS = [
    { id: 'g_blend', items: [
      ['softness', 0.3, 2.5, 0.01], ['base', 'color'], ['baseWeight', 0, 100, 1],
      ['warp', 0, 100, 1], ['mix', 'select', ['oklab', 'mixLab'], ['rgb', 'mixRgb']]] },
    { id: 'g_grain', items: [['grain', 0, 100, 1], ['grainSize', 1, 8, 0.5]] },
    { id: 'g_adjust', items: [
      ['contrast', -50, 50, 1], ['saturation', -100, 100, 1], ['brightness', -50, 50, 1], ['vignette', 0, 100, 1]] }
  ];

  /* ---------- Préréglages originaux (noms et palettes créés pour ce projet) ---------- */
  function P(base, bw, soft, warp, grain, pts, extra) {
    var o = { base: base, baseWeight: bw, softness: soft, warp: warp, grain: grain,
      points: pts.map(function (p) { return { x: p[0], y: p[1], c: p[2], r: +(p[3] * 0.85).toFixed(3) }; }) };
    return Object.assign(o, extra || {});
  }
  var PRESETS = {
    p_aube: P('#2a1430', 10, 0.85, 35, 20, [[0.15, 0.2, '#ffb36b', 0.45], [0.8, 0.15, '#ff7a59', 0.4], [0.5, 0.6, '#f2d39a', 0.4], [0.2, 0.9, '#c2577a', 0.4], [0.85, 0.85, '#6b3b7a', 0.45]]),
    p_nuit: P('#050816', 22, 0.85, 40, 22, [[0.25, 0.3, '#1d3fbf', 0.45], [0.75, 0.25, '#3a1c8c', 0.4], [0.6, 0.75, '#0fa3d6', 0.35], [0.15, 0.8, '#0b1f5c', 0.4]], { vignette: 30 }),
    p_neon: P('#0a0612', 20, 0.85, 25, 16, [[0.2, 0.25, '#ff2fb3', 0.35], [0.8, 0.3, '#22f0ff', 0.35], [0.45, 0.75, '#8a2bff', 0.4], [0.85, 0.85, '#39ff88', 0.28]], { saturation: 15, contrast: 8 }),
    p_pastel: P('#fff4ef', 14, 0.95, 30, 10, [[0.2, 0.2, '#ffc9de', 0.45], [0.8, 0.25, '#c8d8ff', 0.45], [0.5, 0.65, '#d7f7e4', 0.45], [0.15, 0.85, '#fff0b8', 0.4], [0.85, 0.85, '#e5d0ff', 0.4]]),
    p_atlas: P('#1d2a22', 10, 0.85, 45, 24, [[0.2, 0.2, '#d9a066', 0.45], [0.75, 0.2, '#8fa86a', 0.4], [0.55, 0.65, '#c8643c', 0.4], [0.15, 0.85, '#4e6b4f', 0.4], [0.85, 0.85, '#f0d8a8', 0.35]]),
    p_oasis: P('#06281f', 12, 0.85, 30, 18, [[0.25, 0.25, '#1ec99a', 0.45], [0.8, 0.2, '#f4e285', 0.35], [0.6, 0.7, '#118ab2', 0.45], [0.15, 0.8, '#7ae582', 0.35]]),
    p_lavande: P('#2b1f45', 8, 0.9, 35, 14, [[0.2, 0.3, '#b9a3ff', 0.45], [0.75, 0.2, '#f4b6d8', 0.4], [0.6, 0.75, '#7f6bd6', 0.45], [0.2, 0.85, '#e8e1ff', 0.3]]),
    p_braise: P('#120604', 25, 0.85, 50, 28, [[0.3, 0.7, '#ff4d1a', 0.4], [0.7, 0.75, '#ffb347', 0.35], [0.5, 0.35, '#9e1b32', 0.4], [0.85, 0.2, '#3b0a12', 0.4]], { vignette: 40, contrast: 10 }),
    p_medit: P('#f6efe2', 10, 0.85, 30, 14, [[0.2, 0.2, '#1f6fb2', 0.45], [0.8, 0.3, '#5fc1d9', 0.4], [0.45, 0.75, '#ffffff', 0.4], [0.85, 0.85, '#e8b04a', 0.3], [0.15, 0.8, '#0d3b66', 0.35]]),
    p_aurore: P('#02060f', 30, 0.8, 70, 20, [[0.2, 0.35, '#38f2a0', 0.38], [0.5, 0.25, '#1fd1c1', 0.32], [0.8, 0.4, '#8f5cff', 0.38], [0.6, 0.6, '#2f7bff', 0.3], [0.3, 0.75, '#0b2a4a', 0.4]], { vignette: 25 })
  };

  /* ---------- État ---------- */
  var state = GD.sanitize(GD.DEFAULTS);
  var lang = 'fr', selected = -1, currentPreset = null;
  var view = $('view'), vctx = view.getContext('2d');
  var dispW = 0, dispH = 0;               // taille affichée (px CSS)
  var draft = false, pending = false, hashTimer = 0;

  /* ---------- Traduction ---------- */
  function t(k) { return (I18N[lang] && I18N[lang][k]) || I18N.fr[k] || k; }
  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t('title');
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    $('lang').value = lang;
    buildPoints();
    buildHandles();
  }

  /* ---------- Panneau de réglages ---------- */
  function fmt(k, v) {
    if (k === 'softness') return (+v).toFixed(2) + '×';
    if (k === 'grainSize') return (+v).toFixed(1) + ' px';
    if (k === 'contrast' || k === 'saturation' || k === 'brightness') return (v > 0 ? '+' : '') + Math.round(v);
    return String(Math.round(v));
  }
  function buildControls() {
    var root = $('controls');
    GROUPS.forEach(function (g) {
      var fs = document.createElement('fieldset');
      var lg = document.createElement('legend'); lg.dataset.i18n = g.id; fs.appendChild(lg);
      g.items.forEach(function (it) {
        var k = it[0], lab = document.createElement('label'); lab.className = 'ctl';
        var head = document.createElement('span'); head.className = 'ctl-head';
        var name = document.createElement('span'); name.dataset.i18n = k; head.appendChild(name);
        var inp;
        if (it[1] === 'color') {
          inp = document.createElement('input'); inp.type = 'color'; inp.id = 'c_' + k;
          lab.className = 'ctl ctl-color';
          lab.appendChild(head); lab.appendChild(inp);
          inp.addEventListener('input', function () { state[k] = inp.value; changed(); });
        } else if (it[1] === 'select') {
          inp = document.createElement('select'); inp.id = 'c_' + k;
          it.slice(2).forEach(function (o) {
            var op = document.createElement('option'); op.value = o[0]; op.dataset.i18n = o[1]; inp.appendChild(op);
          });
          lab.appendChild(head); lab.appendChild(inp);
          inp.addEventListener('change', function () { state[k] = inp.value; changed(); });
        } else {
          var out = document.createElement('output'); out.id = 'o_' + k; head.appendChild(out);
          inp = document.createElement('input'); inp.type = 'range'; inp.id = 'c_' + k;
          inp.min = it[1]; inp.max = it[2]; inp.step = it[3];
          lab.htmlFor = inp.id;   // <output> est aussi « étiquetable » : on lie le label au curseur
          lab.appendChild(head); lab.appendChild(inp);
          inp.addEventListener('input', function () { state[k] = +inp.value; out.textContent = fmt(k, state[k]); changed(); });
          // Double-clic : retour à la valeur par défaut.
          inp.addEventListener('dblclick', function () { state[k] = GD.DEFAULTS[k]; syncControls(); changed(); });
        }
        fs.appendChild(lab);
      });
      root.appendChild(fs);
    });
  }
  function syncControls() {
    GROUPS.forEach(function (g) {
      g.items.forEach(function (it) {
        var k = it[0], inp = $('c_' + k);
        inp.value = state[k];
        if ($('o_' + k)) $('o_' + k).textContent = fmt(k, state[k]);
      });
    });
    $('seed').value = state.seed;
    $('w').value = state.width; $('h').value = state.height;
    var key = state.width + 'x' + state.height, sel = $('sizePreset');
    sel.value = [].some.call(sel.options, function (o) { return o.value === key; }) ? key : 'custom';
  }

  function buildPresets() {
    var root = $('presets');
    Object.keys(PRESETS).forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'preset'; b.dataset.key = k;
      var sw = document.createElement('span'); sw.className = 'sw';
      var p = PRESETS[k];
      sw.style.background = 'linear-gradient(120deg,' + p.points.map(function (q) { return q.c; }).join(',') + ')';
      var name = document.createElement('span'); name.dataset.i18n = k;
      b.appendChild(sw); b.appendChild(name);
      b.addEventListener('click', function () { applyPreset(k); });
      root.appendChild(b);
    });
  }
  function applyPreset(k) {
    var keep = { seed: state.seed, width: state.width, height: state.height, grainSize: state.grainSize, mix: state.mix };
    state = GD.sanitize(Object.assign({}, GD.DEFAULTS, PRESETS[k], keep));
    currentPreset = k; selected = -1;
    refreshAll();
  }
  function markPreset() {
    document.querySelectorAll('.preset').forEach(function (b) {
      b.classList.toggle('on', b.dataset.key === currentPreset);
      b.setAttribute('aria-pressed', b.dataset.key === currentPreset ? 'true' : 'false');
    });
  }

  /* ---------- Liste des points ---------- */
  function buildPoints() {
    var ol = $('plist'); ol.innerHTML = '';
    state.points.forEach(function (p, i) {
      var li = document.createElement('li'); li.className = 'pt' + (i === selected ? ' sel' : '');
      var num = document.createElement('button'); num.type = 'button'; num.className = 'pnum';
      num.textContent = i + 1; num.style.background = p.c;
      num.setAttribute('aria-label', t('point') + ' ' + (i + 1));
      num.addEventListener('click', function () { select(i); });
      var col = document.createElement('input'); col.type = 'color'; col.value = p.c;
      col.setAttribute('aria-label', t('color') + ' — ' + t('point') + ' ' + (i + 1));
      col.addEventListener('input', function () {
        p.c = col.value; num.style.background = p.c; selected = i; buildHandles(); changed();
      });
      var rl = document.createElement('label'); rl.className = 'prad';
      var rs = document.createElement('span'); rs.textContent = t('radius'); rs.className = 'small';
      var rr = document.createElement('input'); rr.type = 'range'; rr.min = 0.05; rr.max = 1; rr.step = 0.01; rr.value = p.r;
      rr.setAttribute('aria-label', t('radius') + ' — ' + t('point') + ' ' + (i + 1));
      rr.addEventListener('input', function () { p.r = +rr.value; changed(); });
      rl.appendChild(rs); rl.appendChild(rr);
      var del = document.createElement('button'); del.type = 'button'; del.className = 'pdel'; del.textContent = '×';
      del.title = t('remove'); del.setAttribute('aria-label', t('remove') + ' — ' + t('point') + ' ' + (i + 1));
      del.disabled = state.points.length <= 3;
      del.addEventListener('click', function () { removePoint(i); });
      li.appendChild(num); li.appendChild(col); li.appendChild(rl); li.appendChild(del);
      ol.appendChild(li);
    });
    $('btnAdd').disabled = state.points.length >= 8;
  }

  /* ---------- Poignées sur l'aperçu ---------- */
  function buildHandles() {
    var root = $('handles'); root.innerHTML = '';
    state.points.forEach(function (p, i) {
      var h = document.createElement('button'); h.type = 'button';
      h.className = 'handle' + (i === selected ? ' sel' : '');
      h.dataset.i = i; h.style.left = (p.x * 100) + '%'; h.style.top = (p.y * 100) + '%';
      h.style.setProperty('--c', p.c);
      h.setAttribute('aria-label', t('point') + ' ' + (i + 1) + ' (' + Math.round(p.x * 100) + ' %, ' + Math.round(p.y * 100) + ' %)');
      h.textContent = i + 1;
      h.addEventListener('keydown', function (e) {
        var step = e.shiftKey ? 0.05 : 0.01, dx = 0, dy = 0;
        if (e.key === 'ArrowLeft') dx = -step; else if (e.key === 'ArrowRight') dx = step;
        else if (e.key === 'ArrowUp') dy = -step; else if (e.key === 'ArrowDown') dy = step;
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removePoint(i); return; }
        else return;
        e.preventDefault();
        p.x = Math.min(1, Math.max(0, p.x + dx)); p.y = Math.min(1, Math.max(0, p.y + dy));
        moveHandle(i); changed();
      });
      h.addEventListener('focus', function () { if (selected !== i) select(i, true); });
      root.appendChild(h);
    });
  }
  function moveHandle(i) {
    var h = $('handles').children[i], p = state.points[i];
    if (!h) return;
    h.style.left = (p.x * 100) + '%'; h.style.top = (p.y * 100) + '%';
    h.setAttribute('aria-label', t('point') + ' ' + (i + 1) + ' (' + Math.round(p.x * 100) + ' %, ' + Math.round(p.y * 100) + ' %)');
  }
  function select(i, keepFocus) {
    selected = i;
    [].forEach.call($('handles').children, function (h, j) { h.classList.toggle('sel', j === i); });
    [].forEach.call($('plist').children, function (li, j) { li.classList.toggle('sel', j === i); });
    if (!keepFocus && $('handles').children[i]) $('handles').children[i].focus({ preventScroll: true });
  }
  function addPoint(x, y) {
    if (state.points.length >= 8) { toast(t('maxPoints')); return; }
    var R = GD.rng((state.seed + state.points.length * 7919) >>> 0);
    var c = state.points[Math.floor(R() * state.points.length)].c;
    var rgb = GD.hexToRgb(c);
    // Nouvelle couleur : voisine d'une couleur existante, légèrement décalée.
    var nc = GD.rgbToHex(rgb[2] * 0.6 + rgb[0] * 0.4, rgb[0] * 0.5 + rgb[1] * 0.5, rgb[1] * 0.6 + rgb[2] * 0.4);
    state.points.push({ x: x != null ? x : 0.2 + R() * 0.6, y: y != null ? y : 0.2 + R() * 0.6, c: nc, r: 0.35 });
    selected = state.points.length - 1;
    currentPreset = null; markPreset();
    buildPoints(); buildHandles(); changed();
  }
  function removePoint(i) {
    if (state.points.length <= 3) { toast(t('minPoints')); return; }
    state.points.splice(i, 1); selected = -1;
    currentPreset = null; markPreset();
    buildPoints(); buildHandles(); changed();
  }

  /* Glisser-déposer (souris, stylet, tactile) sur l'aperçu */
  function relPos(e) {
    var r = $('frame').getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
             y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }
  var drag = -1, pressTimer = 0, pressStart = null;
  function initPointer() {
    var frame = $('frame');
    frame.addEventListener('pointerdown', function (e) {
      var h = e.target.closest('.handle');
      if (h) {
        drag = +h.dataset.i; select(drag);
        try { frame.setPointerCapture(e.pointerId); } catch (err) { /* pointeur déjà relâché */ }
        draft = true; e.preventDefault();
      } else if (e.pointerType !== 'mouse') {
        // Appui long sur une zone vide (écran tactile) : ajoute un point.
        pressStart = { x: e.clientX, y: e.clientY };
        var pos = relPos(e);
        clearTimeout(pressTimer);
        pressTimer = setTimeout(function () { pressStart = null; addPoint(pos.x, pos.y); }, 550);
      }
    });
    frame.addEventListener('pointermove', function (e) {
      if (pressStart && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 10) { clearTimeout(pressTimer); pressStart = null; }
      if (drag < 0) return;
      var pos = relPos(e), p = state.points[drag];
      p.x = +pos.x.toFixed(4); p.y = +pos.y.toFixed(4);
      moveHandle(drag); currentPreset = null; schedule();
    });
    function end() {
      clearTimeout(pressTimer); pressStart = null;
      if (drag >= 0) {
        var i = drag; drag = -1; draft = false;
        markPreset(); moveHandle(i); changed();
      }
    }
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);
    frame.addEventListener('dblclick', function (e) {
      if (e.target.closest('.handle')) return;
      var pos = relPos(e); addPoint(+pos.x.toFixed(4), +pos.y.toFixed(4));
    });
  }

  /* ---------- Aperçu ---------- */
  // Calcule la taille affichée de l'aperçu selon la place disponible et le format.
  function layout() {
    var wrap = $('wrap'), cs = getComputedStyle(wrap);
    var availW = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var maxH = Math.max(220, Math.min(window.innerHeight * (window.innerWidth < 900 ? 0.62 : 0.74), 820));
    var ar = state.width / state.height;
    dispW = availW; dispH = dispW / ar;
    if (dispH > maxH) { dispH = maxH; dispW = dispH * ar; }
    dispW = Math.floor(dispW); dispH = Math.floor(dispH);
    $('frame').style.width = dispW + 'px'; $('frame').style.height = dispH + 'px';
  }
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; draw(); });
  }
  function draw() {
    // Résolution de calcul : taille affichée × densité d'écran (bornée), divisée par 2 pendant le glisser.
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var k = dpr * (draft ? 0.5 : 1);
    var w = Math.max(16, Math.round(dispW * k)), h = Math.max(16, Math.round(dispH * k));
    var cap = 1000 / Math.max(w, h);
    if (cap < 1) { w = Math.round(w * cap); h = Math.round(h * cap); }
    w = Math.min(w, state.width); h = Math.min(h, state.height);
    if (view.width !== w || view.height !== h) { view.width = w; view.height = h; }
    var img = vctx.createImageData(w, h);
    GD.render(state, w, h, img.data);
    vctx.putImageData(img, 0, 0);
  }
  // Appelé après toute modification : rendu + mise à jour (différée) du lien.
  function changed() {
    schedule();
    clearTimeout(hashTimer);
    hashTimer = setTimeout(writeHash, 300);
    if (!$('cssBox').hidden) updateCss();
  }
  function refreshAll() {
    syncControls(); markPreset(); buildPoints(); buildHandles(); layout(); changed();
  }

  /* ---------- Lien partageable (#s=…) ---------- */
  function encodeState(s) {
    var json = JSON.stringify(s);
    var b64 = btoa(String.fromCharCode.apply(null, new TextEncoder().encode(json)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeState(str) {
    var b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function writeHash() {
    try { history.replaceState(null, '', '#s=' + encodeState(state)); } catch (e) { /* file:// ou bac à sable */ }
  }
  function readHash() {
    var m = /[#&]s=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return false;
    try { state = GD.sanitize(decodeState(m[1])); return true; } catch (e) { return false; }
  }

  /* ---------- Exports ---------- */
  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast(t('exported') + name);
  }
  function baseName() { return 'grain-degrade-' + state.seed + '-' + state.width + 'x' + state.height; }

  function exportPng() {
    toast(t('rendering'));
    $('btnPng').disabled = true;
    // Laisse le navigateur afficher le message avant le calcul pleine résolution.
    setTimeout(function () {
      var c = document.createElement('canvas'); c.width = state.width; c.height = state.height;
      var ctx = c.getContext('2d'), img = ctx.createImageData(c.width, c.height);
      GD.render(state, c.width, c.height, img.data);
      ctx.putImageData(img, 0, 0);
      c.toBlob(function (blob) { $('btnPng').disabled = false; download(blob, baseName() + '.png'); }, 'image/png');
    }, 40);
  }
  function exportJson() {
    var blob = new Blob([JSON.stringify(Object.assign({ app: 'grain-degrade' }, state), null, 2)], { type: 'application/json' });
    download(blob, baseName() + '.json');
  }
  function importJson(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var o = JSON.parse(fr.result);
        if (!o || typeof o !== 'object' || !Array.isArray(o.points)) throw new Error('format');
        state = GD.sanitize(o); currentPreset = null; selected = -1;
        refreshAll(); toast(t('imported'));
      } catch (e) { toast(t('importError')); }
    };
    fr.readAsText(file);
  }
  function updateCss() {
    var css = GD.toCSS(state, $('cssGrain').checked);
    $('cssOut').value = css;
    var st = $('cssPreviewStyle');
    if (!st) { st = document.createElement('style'); st.id = 'cssPreviewStyle'; document.head.appendChild(st); }
    // La classe .grain-degrade est utilisée telle quelle pour l'aperçu du CSS.
    st.textContent = css.replace(/\.grain-degrade/g, '#cssPreview.grain-degrade');
  }
  function copyText(text, okMsg, failMsg) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, function () { toast(failMsg + text); });
    } else toast(failMsg + text);
  }

  /* ---------- Message temporaire ---------- */
  var toastTimer = 0;
  function toast(msg) {
    var el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* ---------- Formats ---------- */
  function setSize(w, h) {
    w = Math.round(+w); h = Math.round(+h);
    if (!(w >= 64 && w <= 6000 && h >= 64 && h <= 6000)) { toast(t('tooBig')); syncControls(); return; }
    state.width = w; state.height = h;
    syncControls(); layout(); changed();
  }

  /* ---------- Initialisation ---------- */
  function init() {
    try { lang = localStorage.getItem(LS_LANG) || 'fr'; } catch (e) { lang = 'fr'; }
    if (!I18N[lang]) lang = 'fr';
    buildControls(); buildPresets();
    if (!readHash()) { state = GD.sanitize(Object.assign({}, GD.DEFAULTS, PRESETS.p_aube)); currentPreset = 'p_aube'; }
    applyLang(); refreshAll(); initPointer();

    $('lang').addEventListener('change', function () {
      lang = $('lang').value;
      try { localStorage.setItem(LS_LANG, lang); } catch (e) { /* stockage indisponible */ }
      applyLang();
    });
    $('btnRandom').addEventListener('click', function () {
      state = GD.randomState(Math.floor(Math.random() * 1e6), state); currentPreset = null; selected = -1; refreshAll();
    });
    $('btnReseed').addEventListener('click', function () { state.seed = Math.floor(Math.random() * 1e6); syncControls(); changed(); });
    $('seed').addEventListener('change', function () {
      state.seed = Math.max(0, Math.min(999999999, Math.floor(+$('seed').value || 0))); syncControls(); changed();
    });
    $('sizePreset').addEventListener('change', function () {
      var v = $('sizePreset').value;
      if (v === 'custom') { $('w').focus(); return; }
      var p = v.split('x'); setSize(p[0], p[1]);
    });
    $('w').addEventListener('change', function () { setSize($('w').value, state.height); });
    $('h').addEventListener('change', function () { setSize(state.width, $('h').value); });
    $('btnAdd').addEventListener('click', function () { addPoint(); });
    $('btnReset').addEventListener('click', function () {
      state = GD.sanitize(Object.assign({}, GD.DEFAULTS, { width: state.width, height: state.height }));
      currentPreset = null; selected = -1; refreshAll();
    });
    $('btnPng').addEventListener('click', exportPng);
    $('btnJson').addEventListener('click', exportJson);
    $('fileJson').addEventListener('change', function () {
      if (this.files[0]) importJson(this.files[0]); this.value = '';
    });
    $('btnLink').addEventListener('click', function () { writeHash(); copyText(location.href, t('copied'), t('copyFail')); });
    $('btnCss').addEventListener('click', function () {
      $('cssBox').hidden = false; updateCss(); $('cssBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('cssGrain').addEventListener('change', updateCss);
    $('btnCloseCss').addEventListener('click', function () { $('cssBox').hidden = true; });
    $('btnCopyCss').addEventListener('click', function () { copyText($('cssOut').value, t('cssCopied'), t('copyFail')); });
    $('btnDlCss').addEventListener('click', function () {
      download(new Blob([$('cssOut').value], { type: 'text/css' }), baseName() + '.css');
    });
    window.addEventListener('hashchange', function () { if (readHash()) { currentPreset = null; refreshAll(); } });
    var rt = 0;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { layout(); schedule(); }, 120); });
  }
  init();
})();
