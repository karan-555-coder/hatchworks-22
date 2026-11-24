/*
 * Molten Lava skin: behaviour (glitch reveals, crosshair cursor, target-lock clicks, HUD card corners).
 *
 * Purely presentational. It never moves, removes or rewrites content; it only
 *   - tags existing elements (lv-card, lv-btn, lv-pill, lv-img, lv-band, lv-prose-link, lv-grad)
 *     so styles/lava.css can restyle the site's many hand-built blocks,
 *   - plays one-off cinematic reveals (clip-path wipes) as tagged elements scroll into view,
 *   - tilts hoverable cards in 3D toward the pointer, with a glare that follows it,
 *   - adds an aria-hidden, pointer-events:none "sky" of slowly drifting lava blobs,
 *   - lifts dark logos / line-art on transparent backgrounds so they read on navy.
 * No dependencies. Respects prefers-reduced-motion; tilt only runs for fine pointers.
 */
(function () {
  'use strict';
  if (window.__lvSkin) return;
  window.__lvSkin = true;

  var doc = document, root = doc.documentElement, body = doc.body;
  if (!body) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var seen = new WeakSet();
  var bands = [];
  var cardRects = new Map();
  // blocks that already animate themselves keep their own entrance
  var OWN_REVEAL = '[class*="reveal"],[data-aos],[class*="animat"],.elementor-invisible,[class*="fade"]';
  var SKIP_MOTION = '[class*="marquee"],[class*="swiper"],[class*="slick"],[class*="carousel"],[class*="ticker"],[class*="slider"]';

  // Some pages scroll inside <body> (html{overflow:hidden}) instead of the window.
  var bodyScroller = false;
  function detectScroller() {
    var ho = getComputedStyle(root).overflowY, bo = getComputedStyle(body).overflowY;
    bodyScroller = (ho === 'hidden' || ho === 'clip') && (bo === 'auto' || bo === 'scroll') && body.scrollHeight > body.clientHeight + 40;
  }
  function scrollTop() { return bodyScroller ? body.scrollTop : window.scrollY; }

  // ---- helpers ---------------------------------------------------------------
  function rgba(str) {
    var m = /rgba?\(([^)]+)\)/.exec(str || '');
    if (!m) return [0, 0, 0, 0];
    var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
    return [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 ? p[3] : 1];
  }
  function lin(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function lum(c) { return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  // chroma (0..1): how far a colour is from grey, independent of lightness
  function chroma(c) { return (Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2])) / 255; }
  function px(v) { return parseFloat(v) || 0; }
  function fourBorders(cs) {
    return px(cs.borderTopWidth) >= 1 && px(cs.borderRightWidth) >= 1 && px(cs.borderBottomWidth) >= 1 && px(cs.borderLeftWidth) >= 1 &&
      cs.borderTopStyle !== 'none' && cs.borderLeftStyle !== 'none' && rgba(cs.borderTopColor)[3] >= 0.1;
  }
  function ownText(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function hasOwnText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && /\S/.test(n.nodeValue)) return true;
    return false;
  }

  var CARD_TAGS = { DIV: 1, ARTICLE: 1, LI: 1, A: 1, SECTION: 1, ASIDE: 1, FIGURE: 1, FORM: 1, BLOCKQUOTE: 1, DETAILS: 1 };
  var BAND_TAGS = { DIV: 1, SECTION: 1, FOOTER: 1, HEADER: 1, MAIN: 1, ARTICLE: 1 };
  var PILL_TAGS = { SPAN: 1, DIV: 1, A: 1, LI: 1, BUTTON: 1, P: 1 };

  // ---- tagging ---------------------------------------------------------------
  function scan() {
    var vw = root.clientWidth, vh = window.innerHeight, sy = window.scrollY;
    var els = body.querySelectorAll('div,section,article,li,a,button,aside,figure,form,blockquote,details,span,p,img,footer,header,main');
    var todo = [];

    // read phase
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (seen.has(el) || el.__lvTagged) continue;
      if (el.closest('.lv-sky') || el.closest('svg')) { seen.add(el); continue; }
      var r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 14) continue;          // hidden for now: look again later
      seen.add(el);
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      var tag = el.tagName, w = r.width, h = r.height;
      var inNav = !!el.closest('#hwnav');
      var item = { el: el, r: r, top: r.top + sy, cls: [] };

      if (tag === 'IMG') {
        var src = el.currentSrc || el.src || '';
        if (w >= 260 && h >= 150 && /\.(jpe?g|webp)(\?|$)/i.test(src) && !el.closest(SKIP_MOTION) && !inNav) {
          var pc = el.closest('.lv-card');
          var pr = pc && cardRects.get(pc);
          if (!(pr && w >= pr.width - 6)) { item.cls.push('lv-img'); item.fx = 'lv-fx-iris'; }
        }
        if (item.cls.length) todo.push(item);
        continue;
      }

      var bg = rgba(cs.backgroundColor);
      var radius = px(cs.borderTopLeftRadius);
      var bordered = fourBorders(cs);
      var fixed = cs.position === 'fixed' || cs.position === 'sticky';
      var roundish = radius >= Math.min(w, h) / 2 - 2;
      var txt = null;

      // buttons
      if ((tag === 'A' || tag === 'BUTTON' || el.getAttribute('role') === 'button') && h >= 26 && h <= 86 && w >= 64 && w <= 480 &&
          (bg[3] >= 0.6 || bordered) && cs.display !== 'inline') {
        txt = ownText(el);
        if (txt.length >= 2 && txt.length <= 48 && !el.querySelector('img,picture,video')) item.cls.push('lv-btn');
      }

      // pills / tags
      if (!item.cls.length && PILL_TAGS[tag] && h >= 18 && h <= 42 && w >= 34 && w <= 280 && radius >= 8 &&
          (bg[3] >= 0.5 || bordered) && el.children.length <= 3 && !inNav) {
        txt = txt === null ? ownText(el) : txt;
        if (txt.length >= 2 && txt.length <= 34) item.cls.push('lv-pill');
      }

      // cards
      if (!item.cls.length && CARD_TAGS[tag] && !inNav && !fixed && !roundish && w >= 150 && h >= 80 && w <= vw * 0.94) {
        var isCard = bordered ||
          (radius >= 6 && bg[3] >= 0.5) ||
          (cs.boxShadow !== 'none' && radius >= 4 && bg[3] >= 0.5);
        if (isCard) {
          // skip wrappers that merely repeat an enclosing card
          var p = el.parentElement, dup = false, depth = 0;
          while (p && depth < 4) {
            var prc = cardRects.get(p);
            if (prc && Math.abs(prc.width - w) < 14 && Math.abs(prc.height - h) < 14) { dup = true; break; }
            p = p.parentElement; depth++;
          }
          if (!dup) {
            cardRects.set(el, r);
            item.cls.push('lv-card');
            item.fx = 'lv-fx-lift';
            if (h < 640 && (tag === 'A' || cs.cursor === 'pointer' || el.querySelector('a[href]'))) {
              item.cls.push('lv-hot');
              // tilt only where nothing else owns the transform, and never inside moving strips
              if (cs.transform === 'none' && !el.style.transform && !el.closest(SKIP_MOTION) && !el.parentElement.closest('.lv-card')) {
                item.tilt = true;
                if (cs.backgroundImage === 'none') item.cls.push('lv-glare');
              }
            }
          }
        }
      }

      // full-width bands
      if (!item.cls.length && BAND_TAGS[tag] && !inNav && !fixed && w >= vw * 0.98 && h >= 180 && !el.closest('.hw-ann')) {
        var hasImg = /url\(/.test(cs.backgroundImage);
        if (bg[3] >= 0.9 || cs.backgroundImage !== 'none') {
          var par = el.parentElement, same = false;
          for (var d = 0; par && d < 3; d++, par = par.parentElement) {
            if (par.__lvBand && Math.abs(par.__lvBand - h) < 6) { same = true; break; }
          }
          if (!same) {
            el.__lvBand = h;
            el.__lvImg = hasImg;
            item.cls.push('lv-band');
            item.band = true;
            if (hasImg) checkLightImage(el, cs.backgroundImage);
          }
        }
      }

      // inline links in running text
      if (!item.cls.length && tag === 'A' && cs.display === 'inline' && el.getAttribute('href') && !inNav &&
          el.closest('p,li') && !el.closest('footer,nav,.hwf-shell,[class*="menu"],[class*="breadcrumb"]') && !el.querySelector('img,svg')) {
        item.cls.push('lv-prose-link');
      }

      if (!item.cls.length) continue;
      todo.push(item);
    }

    // display headings: gradient fill + curtain reveal
    var heads = body.querySelectorAll('h1,h2,h3,.elementor-heading-title');
    for (var k = 0; k < heads.length; k++) {
      var hd = heads[k];
      if (seen.has(hd) || hd.__lvTagged) continue;
      var hr = hd.getBoundingClientRect();
      if (hr.width < 24 || hr.height < 10) continue;
      seen.add(hd);
      if (hd.closest('#hwnav') || hd.closest('.lv-btn')) continue;
      var hcs = getComputedStyle(hd), fs = parseFloat(hcs.fontSize);
      if (fs < 26) continue;                                    // small label headings stay put
      var it2 = { el: hd, r: hr, top: hr.top + sy, cls: [], grad: gradTargets(hd) };
      if (hd.tagName !== 'H3' && !hd.closest(SKIP_MOTION) && !hd.closest('footer,[class*="hwf-"]')) it2.fx = 'lv-fx-wipe';
      todo.push(it2);
    }

    // write phase
    var siblingIndex = new Map();
    for (var j = 0; j < todo.length; j++) {
      var it = todo[j], e = it.el;
      e.__lvTagged = true;
      for (var c = 0; c < it.cls.length; c++) e.classList.add(it.cls[c]);
      if (it.band) bands.push(e);
      if (it.tilt) e.__lvTilt = true;
      if (it.grad) for (var g = 0; g < it.grad.length; g++) {
        sizeGrad(it.grad[g]);
        it.grad[g].classList.add('lv-grad');
        if (gradIO) gradIO.observe(it.grad[g]);
      }

      // the first headline in view gets a one-off curtain on load
      if (!heroDone && !reduce && e.tagName === 'H1' && it.r.top < vh * 0.8 && it.r.bottom > 0 && !e.matches(OWN_REVEAL)) {
        heroDone = true;
        var hcs2 = getComputedStyle(e);
        if (parseFloat(hcs2.opacity) >= 0.99 && hcs2.animationName === 'none') {
          e.classList.add('lv-hero-sweep');
          e.addEventListener('animationend', function done(ev) {
            if (ev.target !== this) return;
            this.classList.remove('lv-hero-sweep');
            this.removeEventListener('animationend', done);
          });
        }
        continue;
      }

      if (it.fx && !reduce && io && it.r.top > vh * 0.92 && !e.closest('.lv-wait') && !e.closest(SKIP_MOTION) && !e.matches(OWN_REVEAL)) {
        var ecs = getComputedStyle(e);
        if (parseFloat(ecs.opacity) >= 0.99 && ecs.animationName === 'none') {
          var parent = e.parentElement;
          var n = siblingIndex.get(parent) || 0;
          siblingIndex.set(parent, n + 1);
          e.style.setProperty('--lv-d', Math.min(n, 5) * 90 + 'ms');
          e.__lvFx = it.fx;
          e.classList.add('lv-wait');
          io.observe(e);
        }
      }
    }
    if (todo.length) { placeSkySoon(); liftImagesSoon(); }
  }
  var heroDone = false;

  // Light, low-saturation text in a heading (the heading itself and any light inline runs inside
  // it) takes the gradient; coloured accent words keep their own colour.
  function lightInk(el) {
    var c = rgba(getComputedStyle(el).color);
    return c[3] >= 0.9 && lum(c) > 0.55 && chroma(c) < 0.25;
  }
  function gradTargets(hd) {
    return [];   // no gradient headings in this variant: glitch headings instead
    var out = [];
    if (hd.closest('.lv-lightzone')) return out;
    if (hasOwnText(hd) && lightInk(hd)) out.push(hd);
    var kids = hd.querySelectorAll('span,strong,em,b,i,mark');
    for (var i = 0; i < kids.length && i < 16; i++) {
      var k = kids[i];
      if (!hasOwnText(k) || k.closest('a,svg')) continue;
      if (out.indexOf(hd) >= 0 && getComputedStyle(k).color === getComputedStyle(hd).color) continue;  // inherits the gradient already
      if (lightInk(k)) out.push(k);
    }
    for (var j = 0; j < out.length; j++) out[j].__lvHead = hd;
    return out;
  }
  // Every piece of one heading shares a single gradient laid across the whole heading, so the
  // colours run continuously from word to word and the shimmer sweeps them together.
  function sizeGrad(el) {
    var hd = el.__lvHead || el, hr = hd.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!hr.width) return;
    el.style.setProperty('--lv-gw', Math.round(hr.width * 2) + 'px');
    el.style.setProperty('--lv-gx', Math.round(hr.left - r.left) + 'px');
    el.style.setProperty('--lv-gt', Math.round(hr.width) + 'px');
  }
  function sizeAllGrads() { doc.querySelectorAll('.lv-grad').forEach(sizeGrad); }
  // the shimmer only runs while a heading is on screen
  var gradIO = 'IntersectionObserver' in window && !reduce ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { en.target.classList.toggle('lv-live', en.isIntersecting); });
  }, { rootMargin: '60px' }) : null;

  // ---- reveal on scroll ---------------------------------------------------------
  function reveal(el) {
    if (!el.classList.contains('lv-wait')) return;
    el.classList.remove('lv-wait');
    el.classList.add('lv-in', el.__lvFx || 'lv-fx-lift');
    var done = function () {
      el.classList.remove('lv-in', 'lv-fx-wipe', 'lv-fx-lift', 'lv-fx-iris');
      el.style.removeProperty('--lv-d');
      el.removeEventListener('animationend', onEnd);
    };
    var onEnd = function (ev) { if (ev.target === el) done(); };
    el.addEventListener('animationend', onEnd);
    setTimeout(done, 2200);
  }
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { io.unobserve(en.target); reveal(en.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' }) : null;

  // never leave anything hidden: reveal whatever is above the fold line or was skipped past
  function sweep() {
    var waiting = doc.querySelectorAll('.lv-wait');
    var limit = window.innerHeight;
    for (var i = 0; i < waiting.length; i++) {
      var r = waiting[i].getBoundingClientRect();
      if (r.top < limit || r.width === 0) { if (io) io.unobserve(waiting[i]); reveal(waiting[i]); }
    }
  }
  window.addEventListener('beforeprint', function () {
    doc.querySelectorAll('.lv-wait').forEach(function (el) { el.classList.remove('lv-wait'); });
  });

  // ---- 3D tilt cards ---------------------------------------------------------------
  var tiltCard = null, tiltRect = null, tiltX = 0, tiltY = 0, tiltFrame = 0;
  function endTilt() {
    if (!tiltCard) return;
    var c = tiltCard;
    tiltCard = null; tiltRect = null;
    c.classList.remove('lv-tilting');
    c.style.removeProperty('transform');
  }
  function paintTilt() {
    tiltFrame = 0;
    if (!tiltCard || !tiltRect) return;
    var r = tiltRect;
    var px2 = Math.min(1, Math.max(0, (tiltX - r.left) / r.width));
    var py2 = Math.min(1, Math.max(0, (tiltY - r.top) / r.height));
    var maxDeg = Math.max(3, Math.min(8, 11 - r.width / 110));     // big cards tilt less
    var rx = (0.5 - py2) * maxDeg * 1.6, ry = (px2 - 0.5) * maxDeg * 2;
    tiltCard.style.transform = 'perspective(1100px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) translateZ(0)';
    tiltCard.style.setProperty('--lv-mx', (px2 * 100).toFixed(1) + '%');
    tiltCard.style.setProperty('--lv-my', (py2 * 100).toFixed(1) + '%');
  }
  if (false) {   // no 3D tilt in this variant: HUD corner brackets instead
    doc.addEventListener('pointermove', function (ev) {
      if (ev.pointerType && ev.pointerType !== 'mouse') return;
      // the nearest tiltable card (cards nested in a card ride along with their parent)
      var t = ev.target && ev.target.closest ? ev.target.closest('.lv-card.lv-hot') : null;
      while (t && !t.__lvTilt) t = t.parentElement ? t.parentElement.closest('.lv-card.lv-hot') : null;
      if (t !== tiltCard) {
        endTilt();
        if (t && !t.classList.contains('lv-wait') && !t.classList.contains('lv-in')) {
          tiltCard = t;
          tiltRect = t.getBoundingClientRect();         // measured flat, before any rotation
          t.classList.add('lv-tilting');
        }
      }
      if (!tiltCard) return;
      tiltX = ev.clientX; tiltY = ev.clientY;
      if (!tiltFrame) tiltFrame = requestAnimationFrame(paintTilt);
    }, { passive: true });
    doc.addEventListener('pointerleave', endTilt);
    window.addEventListener('blur', endTilt);
  }

  // ---- lava sky ------------------------------------------------------------------------
  var VIOLET = 'rgba(255, 69, 0,.34)', AQUA = 'rgba(255, 176, 0,.22)', LILAC = 'rgba(255, 122, 69,.26)', DEEP = 'rgba(255, 209, 102,.30)';
  // per-band recipes: [colour, left %, top %, width vw, drift x vw, drift y vw, period s]
  var RECIPES = [
    [[VIOLET, -12, -30, 62, 9, 4, 24], [AQUA, 58, 10, 54, -8, -5, 28], [LILAC, 24, 55, 46, 6, -6, 21]],
    [[AQUA, -18, 20, 52, 8, -4, 26], [VIOLET, 62, -20, 58, -7, 5, 23]],
    [[DEEP, 40, -35, 64, -9, 5, 27], [AQUA, -10, 45, 44, 7, -5, 22]],
    [[LILAC, 64, 30, 50, -6, -4, 25], [VIOLET, -15, -10, 56, 8, 6, 29]],
  ];
  var sky = null, skyBands = [], skyIO = null, skyTimer = 0;

  function ensureSky(fixedMode) {
    if (!sky) {
      sky = doc.createElement('div');
      sky.className = 'lv-sky';
      sky.setAttribute('aria-hidden', 'true');
      body.appendChild(sky);
      if ('IntersectionObserver' in window) {
        skyIO = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) { en.target.classList.toggle('lv-off', !en.isIntersecting); });
        }, { rootMargin: '120px' });
      }
    }
    sky.classList.toggle('lv-sky-fixed', !!fixedMode);
  }
  function blobsInto(box, recipe, strength) {
    box.innerHTML = '';
    for (var i = 0; i < recipe.length; i++) {
      var b = recipe[i], s = doc.createElement('span');
      s.className = 'lv-blob';
      s.style.cssText = '--c:' + b[0] + ';left:' + b[1] + '%;top:' + b[2] + '%;--w:' + b[3] + 'vw;--dx:' + b[4] + 'vw;--dy:' + b[5] +
        'vw;--t:' + b[6] + 's;--dl:' + (-i * 5) + 's;--o:' + strength;
      box.appendChild(s);
    }
  }
  function placeSkySoon() { clearTimeout(skyTimer); skyTimer = setTimeout(placeSky, 240); }

  function placeSky() {
    return;   // no aurora sky in this variant: laser scan + grid instead
    detectScroller();
    if (bodyScroller) {                      // the sky cannot follow an inner scroller: pin one to the viewport
      ensureSky(true);
      if (!sky.__fixedDone) {
        sky.innerHTML = ''; skyBands = [];
        var box = doc.createElement('div');
        box.className = 'lv-sky-band';
        box.style.cssText = 'top:0;height:100%';
        blobsInto(box, RECIPES[0], 0.7);
        sky.appendChild(box);
        sky.__fixedDone = true;
      }
      return;
    }
    ensureSky(false);
    var sy = window.scrollY, picks = [], lastBottom = -1e9;
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      if (!b.isConnected) continue;
      var r = b.getBoundingClientRect();
      if (r.width === 0 || r.height < 200) continue;
      var top = Math.round(r.top + sy), isHero = top < 400;
      if (b.__lvImg && !isHero) continue;             // photographic bands keep their image as is
      if (b.querySelector('video,canvas')) continue;   // bands with their own lit artwork need no extra glow
      if (top < lastBottom + 260 && !isHero) continue;  // leave breathing room between lavas
      picks.push({ top: top, h: Math.round(Math.min(r.height, 1600)), hero: isHero });
      lastBottom = top + Math.min(r.height, 1600);
      if (picks.length >= 9) break;
    }
    for (var n = 0; n < picks.length; n++) {
      var pk = picks[n], box2 = skyBands[n];
      if (!box2) {
        box2 = doc.createElement('div');
        box2.className = 'lv-sky-band lv-off';
        sky.appendChild(box2);
        skyBands.push(box2);
        if (skyIO) skyIO.observe(box2); else box2.classList.remove('lv-off');
      }
      var key = (pk.hero ? 'h' : 'b') + (n % RECIPES.length);
      // heroes often carry their own lit artwork, so their lava is the gentlest
      if (box2.__key !== key) { blobsInto(box2, pk.hero ? RECIPES[0] : RECIPES[(n % (RECIPES.length - 1)) + 1], pk.hero ? 0.42 : 0.8); box2.__key = key; }
      box2.style.top = pk.top + 'px';
      box2.style.height = pk.h + 'px';
      box2.style.display = '';
    }
    for (var x = picks.length; x < skyBands.length; x++) skyBands[x].style.display = 'none';
  }

  // ---- light photography -----------------------------------------------------------------
  // A band painted with a light photo / illustration keeps dark ink on top of it: its zone
  // (the band, or the section it is the backdrop layer of) resets the surface variables.
  function checkLightImage(band, bgi) {
    var m = /url\(["']?([^"')]+)["']?\)/.exec(bgi || '');
    if (!m || !pctx) return;
    var im = new Image();
    im.onload = function () {
      try {
        pctx.clearRect(0, 0, 40, 40);
        pctx.drawImage(im, 0, 0, 40, 40);
        var d = pctx.getImageData(0, 0, 40, 40).data, l = 0, n = 0;
        for (var i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; l += lum([d[i], d[i + 1], d[i + 2]]); n++; }
        if (!n || l / n < 0.6) return;
      } catch (e) { return; }
      var bcs = getComputedStyle(band);
      var zone = (bcs.position === 'absolute' || bcs.position === 'fixed') && !ownText(band) ? band.parentElement : band;
      if (!zone || zone.classList.contains('lv-lightzone')) return;
      zone.classList.add('lv-lightzone');
      zone.querySelectorAll('.lv-grad').forEach(function (g) { g.classList.remove('lv-grad', 'lv-live'); g.__lvHead = null; });
      zone.querySelectorAll('.lv-inv').forEach(function (g) { g.classList.remove('lv-inv'); });
    };
    im.src = m[1];
  }

  // ---- dark logos on transparent backgrounds ---------------------------------------------
  var lifted = new WeakSet(), liftTimer = 0;
  var probe = doc.createElement('canvas');
  probe.width = probe.height = 40;
  var pctx = null;
  try { pctx = probe.getContext('2d', { willReadFrequently: true }); } catch (e) { pctx = null; }

  function liftImagesSoon() { clearTimeout(liftTimer); liftTimer = setTimeout(liftImages, 300); }
  function liftImages() {
    var imgs = body.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (lifted.has(im)) continue;
      if (!im.complete || !im.naturalWidth) {
        if (!im.__lvWait) { im.__lvWait = true; im.addEventListener('load', liftImagesSoon, { once: true }); }
        continue;
      }
      var src = im.currentSrc || im.src || '';
      if (!/\.(png|svg|gif|webp)(\?|#|$)/i.test(src)) { lifted.add(im); continue; }
      var r = im.getBoundingClientRect();
      if (r.width < 14 || r.height < 10) continue;        // not laid out yet: look again later
      lifted.add(im);
      var f = getComputedStyle(im).filter;
      if (f && f !== 'none') {
        if (/brightness\(0\)/.test(f) && !/invert/.test(f)) im.classList.add('lv-inv-force');   // forced-black logos
        continue;
      }
      if (pctx && !im.closest('.lv-lightzone') && isDarkInk(im)) im.classList.add('lv-inv');
    }
  }
  function isDarkInk(im) {
    try {
      pctx.clearRect(0, 0, 40, 40);
      pctx.drawImage(im, 0, 0, 40, 40);
      var d = pctx.getImageData(0, 0, 40, 40).data, clear = 0, ink = 0, l = 0;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 24) { clear++; continue; }
        if (d[i + 3] < 160) continue;
        ink++;
        l += lum([d[i], d[i + 1], d[i + 2]]);
      }
      var total = d.length / 4;
      return clear / total > 0.18 && ink > 12 && l / ink < 0.12;
    } catch (e) { return false; }   // cross-origin or undecodable: leave as is
  }

  // ---- scroll: progress line ------------------------------------------------------------
  var bar = doc.createElement('div');
  bar.className = 'lv-progress';
  bar.setAttribute('aria-hidden', 'true');
  body.appendChild(bar);

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var sy = scrollTop(), vh = window.innerHeight;
      var max = bodyScroller ? body.scrollHeight - body.clientHeight : root.scrollHeight - vh;
      bar.style.setProperty('--lv-progress', max > 0 ? Math.min(1, sy / max).toFixed(4) : 0);
    });
  }
  // anything scrolled past before its observer fired (fast jumps, anchor links) is shown at once
  var sweepAt = 0;
  doc.addEventListener('scroll', function () {
    onScroll();
    if (tiltCard) endTilt();
    var now = Date.now();
    if (now - sweepAt > 140) { sweepAt = now; sweep(); }
  }, { passive: true, capture: true });
  doc.addEventListener('scrollend', sweep, { passive: true, capture: true });

  // ---- lifecycle ------------------------------------------------------------------------
  var scanTimer = 0;
  function scanSoon(ms) { clearTimeout(scanTimer); scanTimer = setTimeout(function () { scan(); sweep(); }, typeof ms === 'number' ? ms : 160); }

  detectScroller();
  scan();
  onScroll();
  // Page scripts may inject their own styles after this first pass (DOMContentLoaded / load),
  // so untagged elements are looked at again once the page has settled.
  function rescan() { seen = new WeakSet(); scanSoon(60); }
  doc.addEventListener('DOMContentLoaded', rescan);
  window.addEventListener('load', function () { rescan(); liftImagesSoon(); setTimeout(sweep, 2500); });
  setTimeout(rescan, 1600);

  // content revealed by interaction (menus, tabs, accordions, filters) gets tagged too
  ['click', 'keyup', 'change'].forEach(function (t) {
    doc.addEventListener(t, function () { scanSoon(140); setTimeout(scanSoon, 650); }, { passive: true });
  });
  var nav = doc.getElementById('hwnav');
  if (nav) nav.addEventListener('pointerenter', function () { scanSoon(200); liftImagesSoon(); }, true);

  if ('MutationObserver' in window) {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.target === sky || (m.target.closest && m.target.closest('.lv-sky'))) continue;
        if (m.addedNodes && m.addedNodes.length) { scanSoon(300); liftImagesSoon(); return; }
      }
    }).observe(body, { childList: true, subtree: true });
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { endTilt(); scan(); sweep(); placeSky(); sizeAllGrads(); }, 250);
  });
  if ('ResizeObserver' in window) {
    var lastH = 0;
    new ResizeObserver(function () {
      var h = root.scrollHeight;
      if (Math.abs(h - lastH) > 40) { lastH = h; placeSkySoon(); }
    }).observe(body);
  }


  // ---- Forge layer: rising embers, a falling spark trail behind the pointer, spark bursts on click ----
  var forge = doc.createElement('div');
  forge.className = 'lv-forge';
  forge.setAttribute('aria-hidden', 'true');
  body.appendChild(forge);
  var EMBER_COLORS = ['#ffb000', '#ff4500', '#ffd166', '#ff7a45'];
  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };

  if (!reduce) {
    var n = innerWidth < 768 ? 12 : 24;
    for (var i = 0; i < n; i++) {
      var e = doc.createElement('i');
      var s = 2 + Math.random() * 4;
      e.className = 'lv-ember';
      e.style.left = (Math.random() * 100).toFixed(2) + '%';
      e.style.width = e.style.height = s.toFixed(1) + 'px';
      e.style.setProperty('--t', (9 + Math.random() * 12).toFixed(1) + 's');
      e.style.setProperty('--d', (-Math.random() * 20).toFixed(1) + 's');
      e.style.setProperty('--drift', ((Math.random() - 0.5) * 120).toFixed(0) + 'px');
      e.style.setProperty('--c', pick(EMBER_COLORS));
      forge.appendChild(e);
    }
  }

  var spark = function (x, y, dx, dy, life, size) {
    var p = doc.createElement('i');
    p.className = 'lv-spark';
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.width = p.style.height = size + 'px';
    p.style.setProperty('--dx', dx.toFixed(0) + 'px');
    p.style.setProperty('--dy', dy.toFixed(0) + 'px');
    p.style.setProperty('--c', pick(EMBER_COLORS));
    p.style.animationDuration = life + 's';
    p.addEventListener('animationend', function () { p.remove(); }, { once: true });
    forge.appendChild(p);
  };

  if (finePointer && !reduce) {
    var lastSpark = 0;
    doc.addEventListener('pointermove', function (ev) {
      if (ev.pointerType && ev.pointerType !== 'mouse') return;
      var now = performance.now();
      if (now - lastSpark < 35) return;
      lastSpark = now;
      spark(ev.clientX, ev.clientY, (Math.random() - 0.5) * 40, 30 + Math.random() * 50, 0.7 + Math.random() * 0.4, 2 + Math.random() * 3);
    }, { passive: true });
  }
  if (!reduce) doc.addEventListener('pointerdown', function (ev) {
    var ring = doc.createElement('i');
    ring.className = 'lv-flare';
    ring.style.left = ev.clientX + 'px';
    ring.style.top = ev.clientY + 'px';
    ring.addEventListener('animationend', function () { ring.remove(); }, { once: true });
    forge.appendChild(ring);
    for (var k = 0; k < 14; k++) {
      var a = (k / 14) * Math.PI * 2 + Math.random() * 0.3, r = 40 + Math.random() * 50;
      spark(ev.clientX, ev.clientY, Math.cos(a) * r, Math.sin(a) * r + 30, 0.6 + Math.random() * 0.4, 3 + Math.random() * 3);
    }
  }, { passive: true });
})();
