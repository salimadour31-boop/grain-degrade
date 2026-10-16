/*
 * gradient.js — Moteur de rendu de Grain Dégradé.
 * Calcule, pixel par pixel, un dégradé maillé (« mesh gradient ») à partir de
 * points de couleur, puis applique ondulation, retouches, vignette et grain.
 * Aucune dépendance : fonctionne dans le navigateur (window.GD) et sous Node.
 * Licence MIT — code original.
 */
(function (root) {
  'use strict';

  /* ---------- Hasard reproductible ---------- */

  // Générateur pseudo-aléatoire « mulberry32 » : même graine => même suite.
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Hachage entier de (x, y, graine) vers [0, 1) : base du bruit procédural.
  function hash(x, y, s) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function smooth(t) { return t * t * (3 - 2 * t); }

  // Bruit de valeur lissé (interpolation bilinéaire + smoothstep) aux coordonnées réelles.
  function valueNoise(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var fx = smooth(x - xi), fy = smooth(y - yi);
    var a = hash(xi, yi, s), b = hash(xi + 1, yi, s);
    var c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  /* ---------- Couleurs : sRGB <-> linéaire <-> OKLab ---------- */

  function hexToRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    var n = parseInt(h, 16);
    if (!/^[0-9a-fA-F]{6}$/.test(h)) n = 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      v = Math.max(0, Math.min(255, Math.round(v)));
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('');
  }
  function toLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

  // Table linéaire -> sRGB (0..1) pour éviter un Math.pow par pixel.
  var ENC_N = 4096, ENC = new Float32Array(ENC_N + 1);
  for (var i = 0; i <= ENC_N; i++) {
    var l = i / ENC_N;
    ENC[i] = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  }
  function encode(l) { return l <= 0 ? 0 : l >= 1 ? 1 : ENC[(l * ENC_N + 0.5) | 0]; }

  function linToOklab(r, g, b) {
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }

  /* ---------- Réglages par défaut ---------- */

  var DEFAULTS = {
    v: 1,                 // version du format JSON
    seed: 2026,           // graine (grain + ondulation)
    width: 1080, height: 1080,
    base: '#14111f',      // couleur de fond
    baseWeight: 12,       // présence du fond (0-100)
    softness: 0.85,       // multiplicateur global des rayons (0.3-2.5)
    warp: 30,             // ondulation organique (0-100)
    mix: 'oklab',         // espace de mélange : 'oklab' ou 'rgb'
    grain: 18,            // quantité de grain (0-100)
    grainSize: 1,         // taille du grain en pixels de sortie (1-8)
    contrast: 0,          // -50..50
    saturation: 0,        // -100..100
    brightness: 0,        // -50..50
    vignette: 0,          // 0..100
    points: [
      { x: 0.2, y: 0.25, c: '#ff6a3d', r: 0.38 },
      { x: 0.78, y: 0.3, c: '#7b5cff', r: 0.4 },
      { x: 0.55, y: 0.8, c: '#1fd1c1', r: 0.38 },
      { x: 0.15, y: 0.85, c: '#ffcf5a', r: 0.3 }
    ]
  };

  function clamp(v, a, b) { v = +v; if (!isFinite(v)) v = a; return v < a ? a : v > b ? b : v; }

  // Nettoie et borne un objet de réglages (import JSON, URL, etc.).
  function sanitize(o) {
    o = o && typeof o === 'object' ? o : {};
    var d = DEFAULTS, s = {};
    s.v = 1;
    s.seed = Math.floor(clamp(o.seed != null ? o.seed : d.seed, 0, 999999999));
    s.width = Math.round(clamp(o.width || d.width, 64, 6000));
    s.height = Math.round(clamp(o.height || d.height, 64, 6000));
    s.base = /^#[0-9a-f]{6}$/i.test(o.base) ? o.base.toLowerCase() : d.base;
    s.baseWeight = clamp(o.baseWeight != null ? o.baseWeight : d.baseWeight, 0, 100);
    s.softness = clamp(o.softness != null ? o.softness : d.softness, 0.3, 2.5);
    s.warp = clamp(o.warp != null ? o.warp : d.warp, 0, 100);
    s.mix = o.mix === 'rgb' ? 'rgb' : 'oklab';
    s.grain = clamp(o.grain != null ? o.grain : d.grain, 0, 100);
    s.grainSize = clamp(o.grainSize != null ? o.grainSize : d.grainSize, 1, 8);
    s.contrast = clamp(o.contrast || 0, -50, 50);
    s.saturation = clamp(o.saturation || 0, -100, 100);
    s.brightness = clamp(o.brightness || 0, -50, 50);
    s.vignette = clamp(o.vignette || 0, 0, 100);
    var pts = Array.isArray(o.points) ? o.points : d.points;
    s.points = pts.slice(0, 8).map(function (p) {
      p = p || {};
      return { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1),
               c: /^#[0-9a-f]{6}$/i.test(p.c) ? p.c.toLowerCase() : '#888888',
               r: clamp(p.r != null ? p.r : 0.4, 0.05, 1) };
    });
    while (s.points.length < 3) s.points.push({ x: 0.5, y: 0.5, c: '#888888', r: 0.4 });
    return s;
  }

  /* ---------- Rendu ---------- */

  /*
   * render(state, w, h, out)
   *   state : réglages (voir DEFAULTS)
   *   w, h  : taille du rendu en pixels (aperçu réduit ou export plein format)
   *   out   : Uint8ClampedArray RGBA de w*h*4 (ex. ImageData.data)
   *
   * Principe : chaque point i a un poids gaussien w_i = exp(-d²/σ_i²), où d est
   * la distance (corrigée du format) et σ_i = rayon × douceur. Le fond reçoit un
   * poids constant. La couleur du pixel est la moyenne pondérée, calculée en
   * OKLab (mélanges sans zones grises) ou en RVB linéaire.
   */
  function render(state, w, h, out) {
    var st = state, pts = st.points, n = pts.length;
    var scale = w / st.width;                    // aperçu réduit => grain réduit
    var gm = Math.sqrt(w * h);                   // échelle de distance commune
    var ax = w / gm, ay = h / gm;                // correction du format
    var useLab = st.mix !== 'rgb';

    // Pré-calcul des couleurs (fond + points) dans l'espace de mélange.
    function prep(hex) {
      var c = hexToRgb(hex), r = toLinear(c[0]), g = toLinear(c[1]), b = toLinear(c[2]);
      return useLab ? linToOklab(r, g, b) : [r, g, b];
    }
    var px = new Float64Array(n), py = new Float64Array(n), inv = new Float64Array(n);
    var c0 = new Float64Array(n), c1 = new Float64Array(n), c2 = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var p = pts[i], cc = prep(p.c), sig = Math.max(0.02, p.r * st.softness);
      px[i] = p.x * ax; py[i] = p.y * ay; inv[i] = 1 / (sig * sig);
      c0[i] = cc[0]; c1[i] = cc[1]; c2[i] = cc[2];
    }
    var bc = prep(st.base);
    var bw = 0.002 + Math.pow(st.baseWeight / 100, 2) * 0.8;

    // Ondulation : décalage des coordonnées par un bruit très basse fréquence.
    var warp = st.warp / 100 * 0.22, seed = st.seed | 0;
    // Retouches.
    var con = 1 + st.contrast / 50 * 0.6;
    var sat = 1 + st.saturation / 100;
    var bri = st.brightness / 50 * 0.25;
    var vig = st.vignette / 100 * 0.85;
    // Grain : taille de cellule en pixels du rendu courant.
    var gAmt = st.grain / 100 * 0.32, gCell = st.grainSize * scale, gSeed = seed ^ 0x5bd1e995;

    var idx = 0;
    for (var y = 0; y < h; y++) {
      var v = (y + 0.5) / h;
      for (var x = 0; x < w; x++, idx += 4) {
        var u = (x + 0.5) / w, uu = u, vv = v;
        if (warp > 0) {
          uu += warp * (valueNoise(u * 2.2 + 3.1, v * 2.2, seed) - 0.5 + 0.5 * (valueNoise(u * 5.1, v * 5.1 + 7.7, seed + 11) - 0.5));
          vv += warp * (valueNoise(u * 2.2 - 5.3, v * 2.2 + 1.9, seed + 3) - 0.5 + 0.5 * (valueNoise(u * 5.1 + 2.4, v * 5.1, seed + 17) - 0.5));
        }
        var qx = uu * ax, qy = vv * ay;
        var sw = bw, s0 = bc[0] * bw, s1 = bc[1] * bw, s2 = bc[2] * bw;
        for (var k = 0; k < n; k++) {
          var dx = qx - px[k], dy = qy - py[k];
          var wk = Math.exp(-(dx * dx + dy * dy) * inv[k]);
          sw += wk; s0 += c0[k] * wk; s1 += c1[k] * wk; s2 += c2[k] * wk;
        }
        s0 /= sw; s1 /= sw; s2 /= sw;
        var r, g, b;
        if (useLab) {                        // OKLab -> RVB linéaire
          var l_ = s0 + 0.3963377774 * s1 + 0.2158037573 * s2;
          var m_ = s0 - 0.1055613458 * s1 - 0.0638541728 * s2;
          var q_ = s0 - 0.0894841775 * s1 - 1.2914855480 * s2;
          l_ = l_ * l_ * l_; m_ = m_ * m_ * m_; q_ = q_ * q_ * q_;
          r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * q_;
          g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * q_;
          b = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * q_;
        } else { r = s0; g = s1; b = s2; }
        r = encode(r); g = encode(g); b = encode(b);

        // Saturation, contraste, luminosité (en sRGB 0..1).
        if (sat !== 1) {
          var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = lum + (r - lum) * sat; g = lum + (g - lum) * sat; b = lum + (b - lum) * sat;
        }
        if (con !== 1) { r = (r - 0.5) * con + 0.5; g = (g - 0.5) * con + 0.5; b = (b - 0.5) * con + 0.5; }
        r += bri; g += bri; b += bri;
        // Vignette douce (assombrit les bords).
        if (vig > 0) {
          var ex = (u - 0.5) * 2, ey = (v - 0.5) * 2;
          var dd = Math.sqrt(ex * ex + ey * ey) / 1.4142;
          var f = 1 - vig * smooth(Math.min(1, Math.max(0, (dd - 0.25) / 0.75)));
          r *= f; g *= f; b *= f;
        }
        // Grain monochrome : bruit blanc (taille 1) ou bruit lissé en cellules.
        if (gAmt > 0) {
          var nz = gCell <= 1.01 ? hash(x, y, gSeed) : valueNoise(x / gCell, y / gCell, gSeed);
          var gr = (nz - 0.5) * 2 * gAmt;
          r += gr; g += gr; b += gr;
        }
        out[idx] = r * 255 + 0.5; out[idx + 1] = g * 255 + 0.5; out[idx + 2] = b * 255 + 0.5; out[idx + 3] = 255;
      }
    }
    return out;
  }

  /* ---------- Palette aléatoire harmonieuse ---------- */

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    var a = s * Math.min(l, 1 - l);
    function f(n) { var k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }
    return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
  }

  // Produit des réglages complets à partir d'une graine (couleurs + positions).
  function randomState(seed, keep) {
    var R = rng(seed), st = sanitize(keep || DEFAULTS);
    var hue = R() * 360, mode = Math.floor(R() * 4);
    var offsets = [[0, 30, 60, 90, 120], [0, 180, 20, 200, 160], [0, 120, 240, 60, 300], [0, 150, 210, 40, 330]][mode];
    var n = 3 + Math.floor(R() * 4);              // 3 à 6 points
    var dark = R() < 0.55;
    st.seed = seed;
    st.base = dark ? hslToHex(hue + 200, 30 + R() * 30, 6 + R() * 8) : hslToHex(hue + 40, 30 + R() * 40, 88 + R() * 7);
    st.points = [];
    for (var i = 0; i < n; i++) {
      var hh = hue + offsets[i % offsets.length] + (R() - 0.5) * 24;
      st.points.push({
        x: +(0.08 + R() * 0.84).toFixed(3), y: +(0.08 + R() * 0.84).toFixed(3),
        c: hslToHex(hh, 60 + R() * 35, dark ? 48 + R() * 20 : 62 + R() * 18),
        r: +(0.22 + R() * 0.2).toFixed(2)
      });
    }
    st.softness = +(0.75 + R() * 0.3).toFixed(2);
    st.baseWeight = Math.round(4 + R() * 20);
    return st;
  }

  /* ---------- Export CSS approché ---------- */

  // Pile de radial-gradient : chaque point devient une ellipse qui s'estompe.
  function toCSS(st, withGrain) {
    var gm = Math.sqrt(st.width * st.height);
    var layers = st.points.map(function (p) {
      var c = hexToRgb(p.c), rad = p.r * st.softness * 1.45;
      var rx = (rad * gm / st.width * 100).toFixed(1), ry = (rad * gm / st.height * 100).toFixed(1);
      var col = c.join(', ');
      return 'radial-gradient(ellipse ' + rx + '% ' + ry + '% at ' + (p.x * 100).toFixed(1) + '% ' + (p.y * 100).toFixed(1) +
        '%, rgba(' + col + ', 1) 0%, rgba(' + col + ', 0.55) 35%, rgba(' + col + ', 0) 100%)';
    });
    var css = '.grain-degrade {\n  aspect-ratio: ' + st.width + ' / ' + st.height + ';\n  background-color: ' + st.base + ';\n  background-image:\n    ' +
      layers.reverse().join(',\n    ') + ';\n';
    if (withGrain && st.grain > 0) {
      // Grain approché via un filtre SVG feTurbulence en ligne (aucun fichier externe).
      var op = (st.grain / 100 * 0.6).toFixed(2), freq = (0.9 / st.grainSize).toFixed(2);
      css += '  position: relative;\n  isolation: isolate;\n}\n.grain-degrade::after {\n  content: "";\n  position: absolute;\n  inset: 0;\n  pointer-events: none;\n' +
        '  opacity: ' + op + ';\n  mix-blend-mode: overlay;\n' +
        "  background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='" +
        freq + "' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\");\n}\n";
    } else css += '}\n';
    return css;
  }

  var api = { DEFAULTS: DEFAULTS, sanitize: sanitize, render: render, rng: rng, hash: hash,
              randomState: randomState, toCSS: toCSS, hexToRgb: hexToRgb, rgbToHex: rgbToHex, hslToHex: hslToHex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GD = api;
})(this);
