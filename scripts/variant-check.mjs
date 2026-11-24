// Structural check: a visual variant against the untouched original.
//
//   VARIANT=original npm run serve        (http://localhost:4320)
//   VARIANT=aurora   npm run serve        (http://localhost:4322)
//   npm run check:variant -- --variant=aurora [--widths=1440,768,390] [/route/ ...] [--all]
//
// For every route × width both builds are loaded, scrolled through (so lazy content and reveals
// settle) and compared on what a skin must never change:
//   - DOM structure (tags + nesting, in order) and text (skin-injected decorative layers excluded)
//   - page height and the geometry of every heading, paragraph, image, link, button and field
//     (the original is loaded twice; anything that moves between those two loads on its own,
//     such as rotating copy or late embeds, is reported as a note and not compared)
//   - horizontal overflow, broken images, JavaScript errors
// Exit code 1 if any route differs. Uses installed Chrome (or CHROME=<path to a Chromium>).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { VARIANTS } from './variants/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => (args.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1] || d;
const variant = VARIANTS[opt('variant', 'lava')];
if (!variant || variant.name === 'original') throw new Error('Pass --variant=<name> of a skin variant');
const BASE = `http://localhost:${VARIANTS.original.port}`;
const SKIN = opt('skin-origin', `http://localhost:${variant.port}`);   // --skin-origin=... e.g. a second copy of the original as a control
const widths = opt('widths', '1440,768,390').split(',').map(Number);
const TOL = Number(opt('tolerance', '2'));          // px
const DEFAULT_ROUTES = ['/', '/about-us/', '/careers/', '/case-studies/', '/company/contact/', '/faq/', '/how-we-engage/',
  '/ai-strategy-roadmap/', '/generative-driven-development/', '/agentic-ai-automation/', '/healthcare/', '/anthropic/',
  '/resources/blog/', '/talking-ai/', '/newsletter/', '/blog/gen-ai/proprietary-ai-solutions/'];
let routes = args.filter(a => a.startsWith('/'));
if (args.includes('--all')) routes = JSON.parse(await fs.readFile(path.join(ROOT, 'src', 'site.json'), 'utf8')).routes.map(r => r.route);
if (!routes.length) routes = DEFAULT_ROUTES;

// Runs in the page.
async function measure() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const root = document.documentElement, body = document.body;
  const bodyScroll = getComputedStyle(root).overflowY === 'hidden' && body.scrollHeight > body.clientHeight + 40;
  const sc = bodyScroll ? body : root;
  for (let y = 0; y < sc.scrollHeight; y += innerHeight * 0.7) { (bodyScroll ? body : window).scrollTo(0, y); await sleep(110); }
  (bodyScroll ? body : window).scrollTo(0, 0);
  await sleep(2600);                                                   // reveals finish, nothing left hidden
  if (document.fonts) await document.fonts.ready;                      // late web fonts change line wraps
  const DECOR = '.au-sky,.au-progress,.tc-grain,.tc-progress,.fr-grain,.fr-progress,.em-grain,.em-progress,.li-grain,.li-progress,.sk-grain,.sk-progress,.sk-halo,.hp-grain,.hp-progress,.hp-halo,.vb-sky,.vb-progress,.vb-sparks,.tg-grain,.tg-progress,.tg-confetti,.ng-sky,.ng-progress,.ng-net,.ng-edge,.rx-sky,.rx-progress,.rx-pixels,.oc-sky,.oc-progress,.oc-sea,.lv-sky,.lv-progress,.lv-forge,.nb-deco-layer,.nb-progress';
  const skip = el => el.closest(DECOR) || /^(SCRIPT|STYLE|LINK|NOSCRIPT|TEMPLATE)$/.test(el.tagName);
  const nodes = [...body.querySelectorAll('*')].filter(el => !skip(el));
  // structure (tags + nesting depth, in order) and text are fingerprinted separately
  let tags = 0, text = 0;
  const mix = (h, s) => { for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
  const depth = el => { let d = 0; for (let p = el.parentElement; p && p !== body; p = p.parentElement) d++; return d; };
  const order = new Map();
  nodes.forEach((el, i) => {
    order.set(el, i);
    tags = mix(tags, el.tagName + depth(el));
    for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) text = mix(text, n.nodeValue.trim());
  });
  // geometry of meaningful elements; animated strips (marquees, carousels) are skipped
  const MOVING = '[class*="marquee"],[class*="swiper"],[class*="slick"],[class*="carousel"],[class*="ticker"],[class*="slider"],[class*="hwts"]';
  const geo = {};                 // keyed by the element's position in document order
  const sy = bodyScroll ? body.scrollTop : scrollY;
  for (const el of body.querySelectorAll('h1,h2,h3,h4,p,img,a,button,input,textarea,select,video,iframe')) {
    if (skip(el) || el.closest(MOVING) || el.closest('#hwnav .hw-panel')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    geo[order.get(el)] = [el.tagName, Math.round(r.left), Math.round(r.top + sy), Math.round(r.width), Math.round(r.height)];
  }
  const broken = [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).length;
  return {
    height: sc.scrollHeight, nodes: nodes.length, tags, text, geo, broken,
    overflow: Math.max(root.scrollWidth, body.scrollWidth) - root.clientWidth > 1,
  };
}

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' });
let failures = 0;
const RETRIES = Number(opt('retries', '2'));
async function compare(width, route) {
  // the original is loaded twice: whatever differs between those two loads is the page's own
  // motion (rotating copy, late embeds) and is left out; everything stable must match exactly
  const res = {};
  for (const [key, origin] of [['base', BASE], ['skin', SKIN], ['base2', BASE]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    // pages that shuffle content get the same "random" sequence on every load
    await page.addInitScript(() => {
      let s = 0x2f6b3a1d;
      Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + route, { waitUntil: 'load', timeout: 60000 })
      .catch(() => page.goto(origin + route, { waitUntil: 'load', timeout: 90000 }));   // one retry on a slow load
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});   // late embeds settle
    res[key] = { ...(await page.evaluate(measure)), errors };
    await page.close();
  }
  const { base, skin, base2 } = res;
  const near = (x, y) => x && y && x[0] === y[0] && x.slice(1).every((v, k) => Math.abs(v - y[k + 1]) <= TOL);
  const issues = [], notes = [];
  if (base.tags !== skin.tags || base.nodes !== skin.nodes) issues.push(`DOM structure differs (${base.nodes} vs ${skin.nodes} elements)`);
  if (base.text === base2.text) { if (base.text !== skin.text) issues.push('text content differs'); }
  else notes.push('text changes between loads of the original (not compared)');
  if (Math.abs(base.height - base2.height) <= TOL) { if (Math.abs(base.height - skin.height) > TOL) issues.push(`height ${base.height} -> ${skin.height}`); }
  else notes.push('page height changes between loads of the original (not compared)');
  let moved = 0, stable = 0, dynamic = 0, first = null;
  for (const k of Object.keys(base.geo)) {
    if (!near(base.geo[k], base2.geo[k])) { dynamic++; continue; }
    stable++;
    if (!near(base.geo[k], skin.geo[k])) { moved++; first ??= `${base.geo[k].join(',')} -> ${(skin.geo[k] || ['missing']).join(',')}`; }
  }
  if (moved) issues.push(`${moved} of ${stable} stable element(s) moved/resized, first: ${first}`);
  if (dynamic) notes.push(`${dynamic} element(s) move on their own between loads (not compared); ${stable} compared`);
  if (skin.overflow && !base.overflow) issues.push('horizontal overflow');
  if (skin.broken > base.broken) issues.push(`${skin.broken - base.broken} broken image(s)`);
  const newErrors = skin.errors.filter(e => !base.errors.includes(e));
  if (newErrors.length) issues.push(`JS errors: ${newErrors.join(' | ')}`);
  return { issues, notes };
}
for (const width of widths) {
  for (const route of routes) {
    // a difference the skin causes repeats on every load; one the page's own scroll-driven motion
    // causes does not, so a differing route is measured again before it is reported
    let r, attempt = 0;
    do r = await compare(width, route); while (r.issues.length && attempt++ < RETRIES);
    const { issues, notes } = r;
    if (attempt && !issues.length) notes.push(`matched on retry ${attempt}`);
    if (issues.length) failures++;
    const lines = [...issues, ...notes.map(t => 'note: ' + t)];
    const detail = lines.length ? '\n        ' + lines.join('\n        ') : '';
    console.log(`${issues.length ? 'DIFF' : ' OK '}  ${String(width).padStart(4)}  ${route}${detail}`);
  }
}
await browser.close();
console.log(failures ? `\n${failures} route/width combination(s) differ` : '\nAll routes structurally identical');
process.exit(failures ? 1 : 0);
