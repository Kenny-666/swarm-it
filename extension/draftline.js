/*
 * Draftline: watch any web page draw itself as a blueprint.
 *
 * A blueprint sheet is laid over the live page. Elements are outlined and
 * dimensioned in reading order, then the sheet opens over each one, so what
 * appears is the real page itself: its fonts, animations, video, canvases and
 * interactivity are all intact. When the last sheet is drawn the blueprint
 * lifts away and the page is live again.
 *
 * Injected by background.js; injecting again while it runs exits.
 */
(() => {
  "use strict";

  const KEY = "__draftline";
  if (window[KEY]) {
    window[KEY].toggle();
    return;
  }

  // ------------------------------------------------------------------ theme

  const C = {
    sheet: "#0B1D36",
    sheetEdge: "#061223",
    minor: "rgba(120, 196, 255, 0.055)",
    major: "rgba(120, 196, 255, 0.13)",
    line: "#5FD3FF",
    soft: "rgba(95, 211, 255, 0.42)",
    faint: "rgba(95, 211, 255, 0.16)",
    label: "#DDF5FF",
    amber: "#FFC46B",
    ruler: "rgba(5, 15, 30, 0.92)",
  };
  const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Mono", Menlo, Consolas, monospace';
  const SANS = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const RULER = 18;
  const MAX_UNITS = 3000;

  const SKIP = new Set([
    "script", "style", "noscript", "template", "head", "meta", "link", "title", "base", "br", "wbr",
    "option", "optgroup", "datalist", "source", "track", "param", "area", "map", "draftline-sheet",
  ]);
  const MEDIA = new Set(["img", "svg", "video", "canvas", "picture", "iframe", "embed", "object"]);
  const CONTROL = new Set(["input", "textarea", "select"]);
  const LANDMARK = new Set(["header", "nav", "main", "section", "article", "aside", "footer", "form", "figure", "button", "ul", "ol", "table"]);

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeSine = (t) => (1 - Math.cos(Math.PI * t)) / 2;
  const reduced = () => {
    try {
      return matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  };

  function alphaOf(c) {
    if (!c || c === "transparent") return 0;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return 1;
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    return p.length >= 4 ? parseFloat(p[3]) : 1;
  }

  // ------------------------------------------------------------ environment

  // Most pages scroll the window; app shells scroll one big inner element.
  function findScroller() {
    const se = document.scrollingElement || document.documentElement;
    if (se.scrollHeight > innerHeight + 4) return null;
    let best = null;
    let area = 0;
    const all = document.body ? document.body.getElementsByTagName("*") : [];
    for (let i = 0; i < all.length && i < 20000; i++) {
      const el = all[i];
      if (el.scrollHeight <= el.clientHeight + 40 || el.clientHeight < innerHeight * 0.4) continue;
      if (!/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height > area && r.width > innerWidth * 0.35) {
        best = el;
        area = r.width * r.height;
      }
    }
    return best;
  }

  class Env {
    constructor() {
      this.el = findScroller();
    }
    get top() {
      return this.el ? this.el.scrollTop : window.scrollY;
    }
    get height() {
      if (this.el) return this.el.scrollHeight;
      return Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    }
    // the scrolling viewport, in screen px
    view() {
      if (!this.el) return { x: 0, y: 0, w: document.documentElement.clientWidth || innerWidth, h: innerHeight };
      const r = this.el.getBoundingClientRect();
      return { x: r.left + this.el.clientLeft, y: r.top + this.el.clientTop, w: this.el.clientWidth, h: this.el.clientHeight };
    }
    maxTop() {
      return Math.max(0, this.height - this.view().h);
    }
    scrollTo(y) {
      const o = { top: y, behavior: "instant" };
      if (this.el) this.el.scrollTo(o);
      else window.scrollTo(o);
    }
    owns(el) {
      return !this.el || this.el.contains(el);
    }
  }

  // ---------------------------------------------------------------- scanner

  function radiiOf(s, w, h) {
    const m = Math.min(w, h) / 2;
    return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].map((v) => {
      const n = parseFloat(v) || 0;
      return clamp(/%$/.test(v) ? (n / 100) * Math.min(w, h) : n, 0, m);
    });
  }

  function paintsBox(s, under) {
    const bg = s.backgroundColor;
    if (alphaOf(bg) > 0.03 && bg.replace(/\s/g, "") !== (under || "").replace(/\s/g, "")) return true;
    if (s.backgroundImage && s.backgroundImage !== "none") return true;
    if (s.boxShadow && s.boxShadow !== "none") return true;
    if (s.backdropFilter && s.backdropFilter !== "none") return true;
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      if (parseFloat(s["border" + side + "Width"]) > 0 && s["border" + side + "Style"] !== "none" && alphaOf(s["border" + side + "Color"]) > 0.05) return true;
    }
    return false;
  }

  const isInlineLevel = (d) => d.startsWith("inline") || d === "contents";

  function labelFor(el, kind, w, h) {
    const tag = el.localName;
    let name = tag;
    if (kind === "media") name = tag === "img" || tag === "picture" ? "img" : tag;
    else if (!LANDMARK.has(tag)) {
      const cls = ((el.getAttribute && el.getAttribute("class")) || "").trim().split(/\s+/)[0] || "";
      const clean = cls.replace(/[^a-zA-Z0-9-]/g, "").replace(/^(-|\d)+/, "");
      if (clean && clean.length <= 18) name = clean;
    }
    return `${name.toUpperCase()}  ${Math.round(w)} × ${Math.round(h)}`;
  }

  class Scanner {
    constructor(env, host) {
      this.env = env;
      this.host = host;
      this.seen = new WeakSet();
      this.boxOf = new WeakMap();
      this.flow = new WeakSet(); // elements whose inline content is already a text unit
      this.count = 0;
    }

    // Line boxes of an element's own inline text (not text inside its block children),
    // relative to the element's box, merged per visual line.
    lines(el, r, cs) {
      const rects = [];
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (!/\S/.test(n.data)) continue;
        let ok = true;
        for (let p = n.parentElement; p && p !== el; p = p.parentElement) {
          if (!isInlineLevel(cs(p).display)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        const rg = document.createRange();
        rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) if (q.width > 0.5 && q.height > 0.5) rects.push(q);
      }
      rects.sort((a, b) => a.top - b.top || a.left - b.left);
      const out = [];
      for (const q of rects) {
        const last = out[out.length - 1];
        const mid = q.top + q.height / 2;
        if (last && mid > last.t && mid < last.b) {
          last.l = Math.min(last.l, q.left);
          last.r = Math.max(last.r, q.right);
          last.t = Math.min(last.t, q.top);
          last.b = Math.max(last.b, q.bottom);
        } else out.push({ l: q.left, r: q.right, t: q.top, b: q.bottom });
      }
      return out.map((q) => ({ x: q.l - r.left, y: q.t - r.top, w: q.r - q.l, h: q.b - q.t }));
    }

    // Walk the DOM and register what's new inside a band of the page (content px).
    scan(band) {
      const env = this.env;
      const v = env.view();
      const top = env.top;
      const toContent = (y) => y - v.y + top;
      const out = [];
      const cache = new Map();
      const cs = (el) => {
        let s = cache.get(el);
        if (!s) {
          s = getComputedStyle(el);
          cache.set(el, s);
        }
        return s;
      };
      const html = document.documentElement;
      const body = document.body;

      const make = (el, kind, r, s, parent, fixed, clipEl) => {
        const u = {
          id: this.count++, el, kind, parent, fixed, clipEl,
          kids: 0, kidsDone: 0, state: 0, phase: 0, p: 0, line: 0, lp: 0,
          y: fixed ? -1e9 : toContent(r.top), w: r.width, h: r.height,
          rad: radiiOf(s, r.width, r.height), label: "", lines: null, covered: false,
          tall: false, fs: 0, top0: r.top, left0: r.left,
        };
        if (kind === "text") {
          u.lines = this.lines(el, r, cs);
          if (!u.lines.length) return null;
          u.fs = parseFloat(s.fontSize) || 16;
          u.lh = parseFloat(s.lineHeight) || u.fs * 1.2;
          u.rad = [0, 0, 0, 0];
        }
        if (kind === "box") {
          u.tall = r.height > v.h * 0.9;
          if (r.width * r.height > 9000) u.label = labelFor(el, kind, r.width, r.height);
        }
        if (kind === "media" && r.width * r.height > 2400) u.label = labelFor(el, kind, r.width, r.height);
        for (let a = parent; a && u.label; a = a.parent) {
          if (a.label && Math.abs(a.top0 - r.top) < 26 && Math.abs(a.left0 - r.left) < 120) u.label = "";
          if (Math.abs(a.top0 - r.top) >= 26) break;
        }
        if (parent) parent.kids++;
        out.push(u);
        return u;
      };

      const visit = (el, parent, fixed, under, clipEl, inFlow) => {
        if (this.count >= MAX_UNITS) return;
        const tag = el.localName;
        if (SKIP.has(tag) || el === this.host) return;
        const s = cs(el);
        const d = s.display;
        if (d === "none") return;
        if (d === "contents") {
          for (const k of el.children) visit(k, parent, fixed, under, clipEl, inFlow);
          return;
        }
        if (parseFloat(s.opacity) < 0.04) return;
        const isFixed = fixed || s.position === "fixed" || s.position === "sticky" || !env.owns(el);
        const r = el.getBoundingClientRect();
        let inBand = true;
        if (!isFixed) {
          const y0 = toContent(r.top);
          const y1 = toContent(r.bottom);
          inBand = y1 > band.top && y0 < band.bottom;
        }
        const show = s.visibility === "visible" && r.width >= 2 && r.height >= 2 && inBand && el !== html && el !== body;
        const isMedia = MEDIA.has(tag);
        const isControl = CONTROL.has(tag);
        let boxUnit = this.boxOf.get(el) || null;
        let madeText = false;
        if (show && !this.seen.has(el)) {
          this.seen.add(el);
          if (isMedia) {
            make(el, "media", r, s, parent, isFixed, clipEl);
            return;
          }
          if (isControl) {
            if ((el.getAttribute("type") || "").toLowerCase() !== "hidden") make(el, "control", r, s, parent, isFixed, clipEl);
            return;
          }
          const inline = d === "inline";
          if (!inline && paintsBox(s, under)) {
            boxUnit = make(el, "box", r, s, parent, isFixed, clipEl);
            if (boxUnit) this.boxOf.set(el, boxUnit);
          }
          // inline-blocks inside running text (split-text letters, badges) are part of its lines
          const flowPiece = inFlow && isInlineLevel(d);
          if (!inline && !flowPiece) {
            let text = false;
            for (const n of el.childNodes) {
              if (n.nodeType === 3 ? /\S/.test(n.data) : n.nodeType === 1 && isInlineLevel(cs(n).display) && !MEDIA.has(n.localName) && /\S/.test(n.textContent)) {
                text = true;
                break;
              }
            }
            if (text) {
              make(el, "text", r, s, boxUnit || parent, isFixed, clipEl);
              madeText = true;
            }
            else if (!el.firstElementChild && r.width <= 96 && r.height <= 96 && !/\S/.test(el.textContent)) {
              // icon fonts: an empty element whose ::before / ::after is a glyph
              for (const w of ["::before", "::after"]) {
                const ps = getComputedStyle(el, w);
                if (ps.display !== "none" && /^"(.+)"$/.test(ps.content || "")) {
                  make(el, "glyph", r, s, boxUnit || parent, isFixed, clipEl);
                  break;
                }
              }
            }
          }
        } else if (isMedia || isControl) return;
        if (isMedia || isControl) return;
        const opaque = alphaOf(s.backgroundColor) > 0.99 && s.backgroundImage === "none" && s.position !== "absolute" && s.position !== "fixed";
        const kidUnder = opaque ? s.backgroundColor : under;
        const clips = el !== html && el !== body && (s.overflowX !== "visible" || s.overflowY !== "visible");
        const kidClip = clips ? el : clipEl;
        const kidParent = boxUnit || parent;
        const kidFlow = madeText || (inFlow && isInlineLevel(d)) || this.flow.has(el);
        if (madeText) this.flow.add(el);
        for (const k of el.children) visit(k, kidParent, isFixed, kidUnder, kidClip, kidFlow);
        if (el.shadowRoot) for (const k of el.shadowRoot.children) visit(k, kidParent, isFixed, kidUnder, kidClip, kidFlow);
      };

      const pageBg = (() => {
        for (const e of [html, body]) {
          if (!e) continue;
          const c = getComputedStyle(e).backgroundColor;
          if (alphaOf(c) > 0.5) return c;
        }
        return "rgb(255, 255, 255)";
      })();
      if (body) visit(body, null, false, pageBg, null, false);
      return out;
    }
  }

  // -------------------------------------------------------------------- styles

  const STYLE = `
:host{all:initial}
*{box-sizing:border-box}
canvas{position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:auto;cursor:progress}
canvas.off{pointer-events:none;display:none}
.block{position:fixed;right:22px;bottom:22px;min-width:228px;padding:11px 14px 12px;border:1px solid rgba(95,211,255,.38);border-radius:4px;background:rgba(6,17,33,.86);color:#BEE9FF;font:500 10px/1.55 ${MONO};letter-spacing:.08em;text-transform:uppercase;pointer-events:none;opacity:0;transform:translateY(8px);transition:opacity .5s ease,transform .5s ease}
.block.on{opacity:1;transform:none}
.block b{display:block;color:#fff;font:700 12px/1.3 ${MONO};letter-spacing:.22em;margin-bottom:6px}
.block .row{display:flex;justify-content:space-between;gap:14px;border-top:1px solid rgba(95,211,255,.18);padding-top:4px;margin-top:4px}
.block .row span:last-child{color:#fff}
.hud{position:fixed;left:50%;bottom:22px;display:flex;align-items:center;gap:6px;padding:6px 6px 6px 8px;border-radius:14px;background:rgba(8,20,38,.92);-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%);box-shadow:0 18px 50px rgba(0,0,0,.35),inset 0 0 0 1px rgba(95,211,255,.22);color:#E7F7FF;font:500 12px/1 ${SANS};pointer-events:auto;opacity:0;transform:translate(-50%,14px);transition:opacity .5s ease,transform .5s cubic-bezier(.2,.8,.2,1);user-select:none;white-space:nowrap}
.hud.on{opacity:1;transform:translate(-50%,0)}
.ring{width:30px;height:30px;flex:none}
.ring circle{fill:none;stroke-width:3}
.ring .bg{stroke:rgba(95,211,255,.16)}
.ring .fg{stroke:#5FD3FF;stroke-linecap:round;transition:stroke-dashoffset .3s ease}
.meta{display:flex;flex-direction:column;gap:3px;padding:0 10px 0 4px;min-width:170px}
.meta .t{font-weight:600;color:#fff}
.meta .s{color:#8FB8D6;font:500 11px/1 ${MONO}}
.hud button{all:unset;cursor:pointer;padding:8px 11px;border-radius:9px;color:#E7F7FF;background:rgba(95,211,255,.08);font:500 12px/1 ${SANS};transition:background .15s,color .15s}
.hud button:hover{background:rgba(95,211,255,.18)}
.hud button:focus-visible{outline:2px solid #5FD3FF;outline-offset:1px}
.hud button.on{background:#5FD3FF;color:#06203A}
.hud button.pri{background:#5FD3FF;color:#06203A;font-weight:600}
.hud button[hidden]{display:none}
.hud .x{padding:8px 10px;color:#8FB8D6;background:transparent}
`;

  // --------------------------------------------------------------------- app

  class App {
    constructor() {
      this.env = new Env();
      this.dead = false;
      this.speed = reduced() ? 3 : 1;
      this.tour = false;
      this.units = [];
      this.waiting = [];
      this.active = [];
      this.bands = []; // revealed rows of the page, content px, sorted and merged
      this.scanned = []; // rows already scanned for elements
      this.sweep = null;
      this.jump = null;
      this.frontier = -Infinity;
      this.done = 0;
      this.time = 0;
      this.intro = 0;
      this.outro = null;
      this.lastTop = null;
      this.speedPx = 0;
      this.restFor = 0;
      this.dwell = 0;
      this.focus = null;
      this.startedAt = performance.now();
      this.mount();
      this.scanner = new Scanner(this.env, this.host);
      this.bind();
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
    }

    mount() {
      for (const old of document.querySelectorAll("draftline-sheet")) old.remove();
      const host = document.createElement("draftline-sheet");
      host.style.cssText = "all:initial !important;position:fixed !important;inset:0 !important;z-index:2147483647 !important;display:block !important;pointer-events:none !important;contain:strict !important;";
      // closed: page scripts can't reach into the overlay
      const root = host.attachShadow({ mode: "closed" });
      root.innerHTML = `<style>${STYLE}</style>
<canvas aria-hidden="true"></canvas>
<div class="block" aria-hidden="true"><b>DRAFTLINE</b><div class="host"></div><div class="row"><span>Sheet</span><span class="sheetn">01 / 01</span></div><div class="row"><span>Size</span><span class="size"></span></div></div>
<div class="hud" role="toolbar" aria-label="Draftline">
  <svg class="ring" viewBox="0 0 30 30" aria-hidden="true"><circle class="bg" cx="15" cy="15" r="12"/><circle class="fg" cx="15" cy="15" r="12" transform="rotate(-90 15 15)" stroke-dasharray="75.4" stroke-dashoffset="75.4"/></svg>
  <div class="meta" aria-live="polite"><span class="t">Preparing the sheet…</span><span class="s">&nbsp;</span></div>
  <button data-a="tour" aria-pressed="false" title="Glide through the page sheet by sheet (T)">Auto-tour</button>
  <button data-a="speed" title="Drafting speed" aria-label="Drafting speed 1×">1×</button>
  <button data-a="finish" title="Lift the blueprint now (F)">Finish</button>
  <button data-a="replay" class="pri" hidden title="Draw the page again">Replay</button>
  <button data-a="close" class="x" title="Exit (Esc)" aria-label="Exit Draftline">✕</button>
</div>`;
      document.documentElement.appendChild(host);
      this.host = host;
      this.root = root;
      this.cv = root.querySelector("canvas");
      this.g = this.cv.getContext("2d");
      this.hud = root.querySelector(".hud");
      this.block = root.querySelector(".block");
      this.$ = (s) => root.querySelector(s);
      this.$(".host").textContent = (location.hostname || document.title || "local page").replace(/^www\./, "").slice(0, 34);
      this.$('[data-a="speed"]').textContent = this.speed + "×";
      this.resize();
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.dpr = dpr;
      this.W = innerWidth;
      this.H = innerHeight;
      this.cv.width = Math.round(this.W * dpr);
      this.cv.height = Math.round(this.H * dpr);
      // sheet colour with a soft vignette, drawn once
      const bg = document.createElement("canvas");
      bg.width = this.cv.width;
      bg.height = this.cv.height;
      const b = bg.getContext("2d");
      b.fillStyle = C.sheet;
      b.fillRect(0, 0, bg.width, bg.height);
      const gr = b.createRadialGradient(bg.width / 2, bg.height * 0.42, Math.min(bg.width, bg.height) * 0.2, bg.width / 2, bg.height / 2, Math.max(bg.width, bg.height) * 0.75);
      gr.addColorStop(0, "rgba(30,70,120,0.35)");
      gr.addColorStop(1, "rgba(2,8,18,0.55)");
      b.fillStyle = gr;
      b.fillRect(0, 0, bg.width, bg.height);
      this.bgCanvas = bg;
      // drafting grid: 10px minor, 50px major
      const tile = document.createElement("canvas");
      tile.width = tile.height = Math.round(50 * dpr);
      const t = tile.getContext("2d");
      t.scale(dpr, dpr);
      t.strokeStyle = C.minor;
      t.lineWidth = 1;
      for (let i = 10; i < 50; i += 10) {
        t.beginPath();
        t.moveTo(i + 0.5, 0);
        t.lineTo(i + 0.5, 50);
        t.moveTo(0, i + 0.5);
        t.lineTo(50, i + 0.5);
        t.stroke();
      }
      t.strokeStyle = C.major;
      t.beginPath();
      t.moveTo(0.5, 0);
      t.lineTo(0.5, 50);
      t.moveTo(0, 0.5);
      t.lineTo(50, 0.5);
      t.stroke();
      this.grid = this.g.createPattern(tile, "repeat");
      this.gridTile = tile;
    }

    bind() {
      const on = (t, ev, fn, o) => {
        t.addEventListener(ev, fn, o);
        (this.unbinds || (this.unbinds = [])).push(() => t.removeEventListener(ev, fn, o));
      };
      on(window, "resize", () => this.resize());
      on(window, "wheel", () => {
        if (this.jump) this.jump = null; // the reader took over
      }, { passive: true });
      // the sheet blocks clicks on the half-drawn page; wheel scrolling still has to work
      if (this.env.el) {
        on(this.cv, "wheel", (e) => {
          e.preventDefault();
          this.jump = null;
          this.env.el.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: "instant" });
        }, { passive: false });
      }
      on(window, "keydown", (e) => {
        const tgt = e.composedPath()[0];
        if (tgt && (tgt.isContentEditable || /^(input|textarea|select)$/i.test(tgt.localName || ""))) return;
        if (e.key === "Escape") {
          e.stopPropagation();
          stop();
        } else if ((e.key === "t" || e.key === "T") && !e.ctrlKey && !e.metaKey && !e.altKey && !this.outro) this.setTour(!this.tour);
        else if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) this.finish();
      }, true);
      on(this.hud, "click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        const a = b.dataset.a;
        if (a === "close") stop();
        else if (a === "tour") this.setTour(!this.tour);
        else if (a === "finish") this.finish();
        else if (a === "replay") replay();
        else if (a === "speed") {
          this.speed = this.speed >= 3 ? 1 : this.speed + 1;
          b.textContent = this.speed + "×";
          b.setAttribute("aria-label", `Drafting speed ${this.speed}×`);
        }
      });
    }

    setTour(on) {
      this.tour = on;
      this.dwell = 0;
      if (!on) this.jump = null;
      const b = this.$('[data-a="tour"]');
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    }

    // ------------------------------------------------------------ bands

    covered(a, b) {
      for (const k of this.bands) if (k.top <= a + 1 && k.bottom >= b - 1) return true;
      return false;
    }
    gapIn(a, b) {
      // first stretch of [a, b) not yet revealed
      let y = a;
      for (const k of this.bands) {
        if (k.bottom <= y) continue;
        if (k.top > y + 1) return { top: y, bottom: Math.min(b, k.top) };
        y = Math.max(y, k.bottom);
        if (y >= b - 1) return null;
      }
      return y < b - 1 ? { top: y, bottom: b } : null;
    }
    addBand(list, top, bottom) {
      list.push({ top, bottom });
      list.sort((p, q) => p.top - q.top);
      const out = [];
      for (const k of list) {
        const l = out[out.length - 1];
        if (l && k.top <= l.bottom + 1) l.bottom = Math.max(l.bottom, k.bottom);
        else out.push({ ...k });
      }
      return out;
    }

    // ------------------------------------------------------------ units

    register(list) {
      for (const u of list) {
        this.units.push(u);
        const parentDone = u.parent && u.parent.state === 2 && u.parent.kind === "box" && !u.parent.tall;
        if (parentDone || (!u.fixed && this.covered(u.y, u.y + u.h))) this.finishUnit(u, true);
        else this.waiting.push(u);
      }
      this.waiting.sort((a, b) => (a.fixed !== b.fixed ? (a.fixed ? -1 : 1) : a.y - b.y || a.id - b.id));
    }

    finishUnit(u, silent) {
      if (u.state === 2) return;
      u.state = 2;
      u.p = 1;
      this.done++;
      if (u.parent) u.parent.kidsDone++;
      if (!silent && this.focus === u) this.focus = null;
    }

    liveRect(u) {
      const el = u.el;
      if (!el.isConnected) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      let x = r.left;
      let y = r.top;
      let w = r.width;
      let h = r.height;
      if (u.clipEl && u.clipEl.isConnected) {
        // keep the opening inside the box that clips this element (carousels, masks)
        const c = u.clipEl.getBoundingClientRect();
        const l = Math.max(x, c.left);
        const t = Math.max(y, c.top);
        const rr = Math.min(x + w, c.right);
        const b = Math.min(y + h, c.bottom);
        if (rr <= l || b <= t) return null;
        return { x, y, w, h, clip: { x: l, y: t, w: rr - l, h: b - t } };
      }
      return { x, y, w, h, clip: null };
    }

    inView(u, v, top, pad = 0) {
      if (u.fixed) return true;
      const y = u.y - top + v.y;
      return y + u.h > v.y - pad && y < v.y + v.h + pad;
    }

    // ------------------------------------------------------------ frame

    frame(now) {
      if (this.dead) return;
      const dt = clamp((now - this.last) / 1000, 0, 0.05); // the first frame can be stamped before we started
      this.last = now;
      try {
        this.update(dt);
        this.draw();
        if (!this._hudT || now - this._hudT > 180) {
          this._hudT = now;
          this.updateHud();
        }
      } catch (err) {
        console.error("[draftline]", err);
      }
      if (!this.dead) this.raf = requestAnimationFrame((t) => this.frame(t));
    }

    update(dt) {
      this.time += dt;
      const env = this.env;
      const v = env.view();
      const top = env.top;
      const sdt = dt * this.speed;

      // how fast the page is moving: new work waits until it comes to rest
      const moved = this.lastTop == null ? 0 : Math.abs(top - this.lastTop);
      this.lastTop = top;
      const inst = this.jump ? 0 : moved / Math.max(dt, 0.001);
      this.speedPx += (inst - this.speedPx) * (1 - Math.exp(-dt / 0.12));
      const resting = !this.jump && this.speedPx < 45;
      this.restFor = resting ? this.restFor + dt : 0;

      if (this.intro < 1) {
        this.intro = Math.min(1, this.intro + dt / 0.9);
        if (this.intro > 0.25) this.hud.classList.add("on");
      }
      // the title block shows during the intro and whenever the sheet changes, then steps aside
      if (this.jump) this.blockUntil = this.time + 1.6;
      const showBlock = !this.outro && (this.time < 3.2 || this.time < (this.blockUntil || 0));
      if (showBlock !== this._blockOn) {
        this._blockOn = showBlock;
        this.block.classList.toggle("on", showBlock);
      }
      if (this.intro < 1) return;

      if (this.outro) {
        this.outro.t = Math.min(1, this.outro.t + dt / 1.1);
        if (this.outro.t >= 1 && !this.outro.off) {
          this.outro.off = true;
          this.cv.classList.add("off");
        }
        return;
      }

      // tour camera
      if (this.jump) {
        const J = this.jump;
        J.t += dt;
        const k = Math.min(1, J.t / J.dur);
        env.scrollTo(Math.round(J.from + (J.to - J.from) * easeSine(k)));
        if (k >= 1) this.jump = null;
      }

      // look for elements once the page is still
      if (this.restFor > 0.12 && (this.scanTop !== Math.round(top) || this.scanH !== env.height)) {
        this.scanTop = Math.round(top);
        this.scanH = env.height;
        const band = { top: top - v.h * 0.1, bottom: top + v.h * 1.1 };
        this.register(this.scanner.scan(band));
        this.scanned = this.addBand(this.scanned, band.top, band.bottom);
        this.frontier = Math.max(this.frontier, top + v.h);
      }

      // start work in reading order
      const slots = 5 + this.speed * 2;
      let busy = 0;
      for (const u of this.active) if (!(u.kind === "box" && u.phase === 1)) busy++;
      if (resting && this.waiting.length) {
        const keep = [];
        for (const u of this.waiting) {
          if (u.state !== 0) continue;
          let go = busy < slots && (u.fixed || u.y <= this.frontier);
          if (go && u.parent && u.parent.state === 0) go = false;
          if (go && u.parent && u.parent.kind === "box" && u.parent.state === 1 && u.parent.phase === 0 && u.parent.p < 0.55) go = false;
          if (!go) {
            keep.push(u);
            continue;
          }
          if (!this.inView(u, v, top, 40)) {
            // scrolled past without being seen: it simply appears
            this.finishUnit(u, true);
            continue;
          }
          u.state = 1;
          u.phase = 0;
          u.p = 0;
          this.active.push(u);
          if (u.kind !== "text" || u.fs >= 26) this.focus = u;
          busy++;
        }
        this.waiting = keep;
      }

      // advance everything in flight
      for (const u of this.active) {
        if (u.state !== 1) continue;
        if (u.kind === "box") {
          if (u.phase === 0) {
            u.p += sdt / 0.45;
            if (u.p >= 1) {
              u.phase = 1;
              u.p = 0;
            }
          } else if (u.phase === 1) {
            if (u.tall) this.finishUnit(u);
            else if (u.kidsDone >= u.kids) u.phase = 2;
          } else {
            u.p += sdt / 0.42;
            if (u.p >= 1) this.finishUnit(u);
          }
        } else if (u.kind === "text") {
          if (u.phase === 0) {
            u.p += sdt / 0.16;
            if (u.p >= 1) {
              u.phase = 1;
              u.line = 0;
              u.lp = 0;
            }
          } else {
            const ln = u.lines[u.line];
            u.lp += sdt / clamp(ln.w / 1150, 0.1, 0.55);
            if (u.lp >= 1) {
              u.line++;
              u.lp = 0;
              if (u.line >= u.lines.length) this.finishUnit(u);
            }
          }
        } else {
          const outline = u.kind === "glyph" ? 0.28 : 0.36;
          const fill = u.kind === "media" ? 0.6 : u.kind === "control" ? 0.38 : 0;
          if (u.phase === 0) {
            u.p += sdt / outline;
            if (u.p >= 1) {
              if (!fill) this.finishUnit(u);
              else {
                u.phase = 1;
                u.p = 0;
              }
            }
          } else {
            u.p += sdt / fill;
            if (u.p >= 1) this.finishUnit(u);
          }
        }
      }
      if (this.active.some((u) => u.state === 2)) this.active = this.active.filter((u) => u.state !== 2);

      // sheet sweep: once everything in view is drawn, reveal the whole screen
      // (backgrounds, decoration and anything that isn't an element of its own)
      if (this.sweep) {
        this.sweep.p += sdt / 0.62;
        if (this.sweep.p >= 1) {
          this.bands = this.addBand(this.bands, this.sweep.top, this.sweep.bottom);
          for (const u of this.units) if (!u.covered && !u.fixed && this.covered(u.y, u.y + u.h)) u.covered = true;
          this.sweep = null;
        }
      } else if (resting && this.restFor > 0.15) {
        const vt = top;
        const vb = Math.min(env.height, top + v.h);
        const gap = this.gapIn(vt, vb);
        if (gap && this.scannedCovers(vt, vb)) {
          const pending = this.waiting.some((u) => !u.fixed && u.y < gap.bottom && u.y + u.h > gap.top && u.y >= vt - 2) ||
            this.active.some((u) => !(u.kind === "box" && (u.tall || u.phase === 1)) && (u.fixed || (u.y < gap.bottom && u.y + u.h > gap.top)));
          if (!pending) this.sweep = { top: gap.top, bottom: gap.bottom, p: 0 };
        }
      }

      // tour: next sheet, or the end
      const viewDone = !this.sweep && !this.gapIn(top, Math.min(env.height, top + v.h));
      if (viewDone && !this.jump) {
        const atEnd = top >= env.maxTop() - 1;
        if (atEnd && this.covered(0, env.height)) {
          this.dwell += dt;
          if (this.dwell > 0.5) this.finish();
        } else if (this.tour && resting) {
          this.dwell += dt * this.speed;
          if (this.dwell > 0.45) {
            this.dwell = 0;
            // next sheet down; at the bottom, go back for anything skipped higher up
            const gap = atEnd ? this.gapIn(0, env.height) : null;
            const to = gap ? clamp(gap.top, 0, env.maxTop()) : Math.min(env.maxTop(), top + v.h * 0.82);
            if (reduced()) env.scrollTo(to);
            else this.jump = { from: top, to, t: 0, dur: clamp(0.4 + (to - top) / 2600, 0.5, 1.1) / Math.sqrt(this.speed) };
          }
        } else this.dwell = 0;
      } else this.dwell = 0;
    }

    scannedCovers(a, b) {
      for (const k of this.scanned) if (k.top <= a + 1 && k.bottom >= b - 1) return true;
      return false;
    }

    finish() {
      if (this.outro || this.dead) return;
      this.jump = null;
      this.outro = { t: 0, at: performance.now() };
      this.secs = (this.outro.at - this.startedAt) / 1000;
      this.$('[data-a="tour"]').hidden = true;
      this.$('[data-a="speed"]').hidden = true;
      this.$('[data-a="finish"]').hidden = true;
      this.$('[data-a="replay"]').hidden = false;
      this.block.classList.remove("on");
      this.updateHud(true);
    }

    // ------------------------------------------------------------ drawing

    draw() {
      const g = this.g;
      const { W, H, dpr } = this;
      const env = this.env;
      const v = env.view();
      const top = env.top;
      const sy = (y) => y - top + v.y; // content px -> screen px
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      g.clearRect(0, 0, W, H);
      if (this.outro && this.outro.off) return;

      // the sheet fades in over the page, then lifts away at the end
      let sheetA = easeOut(this.intro);
      if (this.outro) sheetA *= 1 - easeInOut(this.outro.t);
      g.globalAlpha = sheetA;
      g.drawImage(this.bgCanvas, 0, 0, W, H);
      g.save();
      const off = top % 50;
      g.translate(v.x % 50, v.y - off);
      // the grid draws outwards from the centre during the intro
      if (this.intro < 1) {
        g.beginPath();
        g.arc(W / 2 - (v.x % 50), H / 2 - v.y + off, Math.hypot(W, H) * 0.6 * easeOut(this.intro), 0, Math.PI * 2);
        g.clip();
      }
      g.fillStyle = this.grid;
      g.fillRect(-50, -50, W + 100, H + 100);
      g.restore();
      g.globalAlpha = 1;
      if (this.intro < 1 && !this.units.length) return;

      // ---- openings onto the real page
      g.globalCompositeOperation = "destination-out";
      g.fillStyle = "#000";
      for (const b of this.bands) {
        const y0 = sy(b.top);
        const y1 = sy(b.bottom);
        if (y1 < 0 || y0 > H) continue;
        g.fillRect(v.x, y0, v.w, y1 - y0);
      }
      if (this.env.el && this.bands.length) {
        // app shells: once the first sheet is drawn, the frame around the scroller opens too
        const k = easeOut(clamp((this.time - (this.chromeAt || (this.chromeAt = this.time))) / 0.6, 0, 1));
        g.globalAlpha = k;
        g.fillRect(0, 0, W, v.y);
        g.fillRect(0, v.y + v.h, W, H - v.y - v.h);
        g.fillRect(0, v.y, v.x, v.h);
        g.fillRect(v.x + v.w, v.y, W - v.x - v.w, v.h);
        g.globalAlpha = 1;
      }
      if (this.sweep) {
        const s = this.sweep;
        const y0 = sy(s.top);
        const e = y0 + (sy(s.bottom) - y0) * easeInOut(clamp(s.p, 0, 1));
        g.fillRect(v.x, y0, v.w, e - y0);
        const fg = g.createLinearGradient(0, e, 0, e + 46);
        fg.addColorStop(0, "rgba(0,0,0,1)");
        fg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = fg;
        g.fillRect(v.x, e, v.w, 46);
        g.fillStyle = "#000";
      }
      const rects = new Map();
      for (const u of this.units) {
        if (u.covered || u.state === 0) continue;
        if (!this.inView(u, v, top, 60)) continue;
        const R = this.liveRect(u);
        if (!R) continue;
        rects.set(u, R);
        this.open(g, u, R);
      }

      // ---- drafting marks on top
      g.globalCompositeOperation = "source-over";
      for (const u of this.active) {
        const R = rects.get(u);
        if (R) this.mark(g, u, R);
      }
      if (this.sweep) {
        const s = this.sweep;
        const y0 = sy(s.top);
        const e = y0 + (sy(s.bottom) - y0) * easeInOut(clamp(s.p, 0, 1));
        const gl = g.createLinearGradient(0, e - 28, 0, e + 2);
        gl.addColorStop(0, "rgba(95,211,255,0)");
        gl.addColorStop(1, "rgba(95,211,255,0.35)");
        g.fillStyle = gl;
        g.fillRect(v.x, e - 28, v.w, 30);
        g.fillStyle = C.line;
        g.fillRect(v.x, e - 1, v.w, 1.5);
      }
      const focusR = this.focus && this.focus.state === 1 ? rects.get(this.focus) : null;
      if (focusR) {
        const f = this.focus;
        this.guides(g, focusR, f.phase === 0 ? easeOut(clamp(f.p * 1.6, 0, 1)) : 1);
      }
      this.rulers(g, v, top, focusR, sheetA);
    }

    roundPath(g, x, y, w, h, r) {
      g.beginPath();
      if (g.roundRect && r && r.some((k) => k > 0.5)) g.roundRect(x, y, w, h, r);
      else g.rect(x, y, w, h);
    }

    withClip(g, R, fn) {
      if (!R.clip) return fn();
      g.save();
      g.beginPath();
      g.rect(R.clip.x, R.clip.y, R.clip.w, R.clip.h);
      g.clip();
      fn();
      g.restore();
    }

    // reveal (part of) a unit through the sheet
    open(g, u, R) {
      this.withClip(g, R, () => {
        if (u.kind === "text") {
          // text shows line by line; its block's background waits for the sheet sweep
          if (u.state !== 2 && u.phase !== 1) return;
          const n = u.state === 2 ? u.lines.length : u.line;
          for (let i = 0; i < n; i++) {
            const L = u.lines[i];
            this.roundPath(g, R.x + L.x - 3, R.y + L.y - 1, L.w + 6, L.h + 2, [2, 2, 2, 2]);
            g.fill();
          }
          if (u.state === 2) return;
          const L = u.lines[u.line];
          if (!L) return;
          const w = (L.w + 6) * easeOut(clamp(u.lp, 0, 1));
          g.fillRect(R.x + L.x - 3, R.y + L.y - 1, w, L.h + 2);
          return;
        }
        if (u.state === 2) {
          this.roundPath(g, R.x, R.y, R.w, R.h, u.rad);
          g.fill();
          return;
        }
        if (u.kind === "box") {
          if (u.phase !== 2) return;
          g.globalAlpha = easeOut(clamp(u.p, 0, 1));
          this.roundPath(g, R.x, R.y, R.w, R.h, u.rad);
          g.fill();
          g.globalAlpha = 1;
          return;
        }
        if (u.kind === "glyph") {
          const k = easeOut(clamp(u.p, 0, 1));
          g.beginPath();
          g.arc(R.x + R.w / 2, R.y + R.h / 2, (Math.hypot(R.w, R.h) / 2) * k, 0, Math.PI * 2);
          g.fill();
          return;
        }
        if (u.phase !== 1) return;
        const k = easeInOut(clamp(u.p, 0, 1));
        g.save();
        this.roundPath(g, R.x, R.y, R.w, R.h, u.rad);
        g.clip();
        if (u.kind === "control") g.fillRect(R.x, R.y, R.w * k, R.h);
        else {
          const e = R.y + R.h * k;
          g.fillRect(R.x, R.y, R.w, e - R.y);
          const fg = g.createLinearGradient(0, e, 0, e + 22);
          fg.addColorStop(0, "rgba(0,0,0,0.85)");
          fg.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = fg;
          g.fillRect(R.x, e, R.w, 22);
          g.fillStyle = "#000";
        }
        g.restore();
      });
    }

    // outlines, labels and scan lines for work in progress
    mark(g, u, R) {
      const { x, y, w, h } = R;
      g.lineWidth = 1;
      if (u.kind === "box") {
        const per = 2 * (w + h);
        if (u.phase === 0) {
          const k = easeInOut(clamp(u.p, 0, 1));
          g.strokeStyle = C.line;
          g.setLineDash([per * k, per]);
          this.roundPath(g, x + 0.5, y + 0.5, w - 1, h - 1, u.rad);
          g.stroke();
          g.setLineDash([]);
          if (u.label && k > 0.4) this.tag(g, u.label, x, y, (k - 0.4) / 0.6);
        } else {
          const a = u.phase === 2 ? 1 - easeOut(clamp(u.p, 0, 1)) : 1;
          g.globalAlpha = 0.75 * a;
          g.strokeStyle = C.line;
          this.roundPath(g, x + 0.5, y + 0.5, w - 1, h - 1, u.rad);
          g.stroke();
          this.ticks(g, x, y, w, h);
          g.globalAlpha = a;
          if (u.label) this.tag(g, u.label, x, y, 1);
          g.globalAlpha = 1;
        }
        return;
      }
      if (u.kind === "text") {
        const a = u.phase === 0 ? easeOut(clamp(u.p, 0, 1)) : 1;
        g.globalAlpha = a;
        g.strokeStyle = C.faint;
        g.setLineDash([3, 4]);
        for (let i = u.phase === 1 ? u.line : 0; i < u.lines.length; i++) {
          const L = u.lines[i];
          const by = Math.round(y + L.y + L.h * 0.82) + 0.5;
          g.beginPath();
          g.moveTo(x + L.x, by);
          g.lineTo(x + L.x + L.w, by);
          g.stroke();
        }
        g.setLineDash([]);
        if (u.fs >= 26) this.tag(g, `TYPE  ${Math.round(u.fs)} / ${Math.round(u.lh)}`, x + (u.lines[0] ? u.lines[0].x : 0), y + (u.lines[0] ? u.lines[0].y : 0), a);
        if (u.phase === 1) {
          const L = u.lines[u.line];
          if (L) {
            const cx = x + L.x - 2 + (L.w + 4) * easeOut(clamp(u.lp, 0, 1));
            g.shadowColor = C.line;
            g.shadowBlur = 10;
            g.fillStyle = C.line;
            g.fillRect(Math.round(cx), y + L.y - 1, 2, L.h + 2);
            g.shadowBlur = 0;
          }
        }
        g.globalAlpha = 1;
        return;
      }
      if (u.kind === "glyph") {
        const k = easeOut(clamp(u.p, 0, 1));
        g.globalAlpha = 1 - k * 0.6;
        g.strokeStyle = C.line;
        g.beginPath();
        g.arc(x + w / 2, y + h / 2, (Math.hypot(w, h) / 2 + 3) * (0.6 + 0.4 * k), 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
        return;
      }
      // media and form controls
      const k0 = u.phase === 0 ? easeInOut(clamp(u.p, 0, 1)) : 1;
      const per = 2 * (w + h);
      g.strokeStyle = C.line;
      g.setLineDash(u.phase === 0 ? [per * k0, per] : []);
      this.roundPath(g, x + 0.5, y + 0.5, w - 1, h - 1, u.rad);
      g.stroke();
      g.setLineDash([]);
      const cut = u.phase === 1 ? easeInOut(clamp(u.p, 0, 1)) : 0;
      if (u.kind === "media" && w > 28 && h > 28) {
        // the classic placeholder cross, still showing where the image hasn't arrived
        g.save();
        g.beginPath();
        g.rect(x, y + h * cut, w, h * (1 - cut));
        g.clip();
        g.globalAlpha = 0.55 * k0;
        g.strokeStyle = C.soft;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + w, y + h);
        g.moveTo(x + w, y);
        g.lineTo(x, y + h);
        g.stroke();
        g.restore();
        g.globalAlpha = 1;
      }
      if (u.label) this.tag(g, u.label, x, y, k0);
      if (u.phase === 1) {
        g.shadowColor = C.line;
        g.shadowBlur = 12;
        g.fillStyle = C.line;
        if (u.kind === "control") g.fillRect(x + w * cut - 1, y, 2, h);
        else g.fillRect(x, y + h * cut - 1, w, 2);
        g.shadowBlur = 0;
      }
    }

    // a small label pill above an element: "CARD  412 × 280"
    tag(g, text, x, y, a) {
      // only for elements whose top edge is on screen (no pile of labels under the ruler)
      if (a <= 0.01 || y < RULER + 2 || y > this.H - 20) return;
      g.font = `600 10px ${MONO}`;
      const tw = g.measureText(text).width;
      const px = Math.round(clamp(x, RULER + 4, this.W - tw - 16));
      const py = Math.round(Math.max(RULER + 4, y - 19 < RULER + 2 ? y + 4 : y - 19));
      g.globalAlpha = a;
      g.fillStyle = "rgba(6,17,33,0.92)";
      this.roundPath(g, px, py, tw + 12, 16, [3, 3, 3, 3]);
      g.fill();
      g.strokeStyle = C.soft;
      g.stroke();
      g.fillStyle = C.label;
      g.textBaseline = "middle";
      g.fillText(text, px + 6, py + 8.5);
      g.globalAlpha = 1;
    }

    // corner registration marks
    ticks(g, x, y, w, h) {
      const k = 6;
      g.strokeStyle = C.line;
      g.beginPath();
      for (const [cx, cy, dx, dy] of [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]]) {
        g.moveTo(cx + dx * 2, cy);
        g.lineTo(cx + dx * (2 + k), cy);
        g.moveTo(cx, cy + dy * 2);
        g.lineTo(cx, cy + dy * (2 + k));
      }
      g.stroke();
    }

    // guide lines and dimensions for the element being drafted
    guides(g, R, a) {
      const { x, y, w, h } = R;
      if (a <= 0.01) return;
      g.save();
      g.globalAlpha = 0.5 * a;
      g.strokeStyle = C.soft;
      g.setLineDash([2, 5]);
      g.beginPath();
      g.moveTo(RULER, y + 0.5);
      g.lineTo(this.W, y + 0.5);
      g.moveTo(x + 0.5, RULER);
      g.lineTo(x + 0.5, this.H);
      g.stroke();
      g.setLineDash([]);
      g.restore();
      // width dimension, under the element
      if (w > 60 && y + h + 22 < this.H - 70) {
        const dy = Math.round(y + h + 12) + 0.5;
        g.strokeStyle = C.amber;
        g.globalAlpha = 0.85 * a;
        g.beginPath();
        g.moveTo(x, dy);
        g.lineTo(x + w, dy);
        g.moveTo(x, dy - 4);
        g.lineTo(x, dy + 4);
        g.moveTo(x + w, dy - 4);
        g.lineTo(x + w, dy + 4);
        g.stroke();
        g.font = `600 10px ${MONO}`;
        const t = String(Math.round(w));
        const tw = g.measureText(t).width;
        g.fillStyle = C.sheet;
        g.fillRect(x + w / 2 - tw / 2 - 4, dy - 6, tw + 8, 12);
        g.fillStyle = C.amber;
        g.textBaseline = "middle";
        g.fillText(t, x + w / 2 - tw / 2, dy + 0.5);
        g.globalAlpha = 1;
      }
    }

    rulers(g, v, top, focus, a) {
      const { W, H } = this;
      g.globalAlpha = a;
      g.fillStyle = C.ruler;
      g.fillRect(0, 0, W, RULER);
      g.fillRect(0, 0, RULER, H);
      g.strokeStyle = "rgba(95,211,255,0.38)";
      g.fillStyle = "rgba(190,233,255,0.75)";
      g.font = `500 9px ${MONO}`;
      g.textBaseline = "top";
      g.lineWidth = 1;
      g.beginPath();
      for (let px = 0; px < W; px += 10) {
        const len = px % 100 === 0 ? 9 : px % 50 === 0 ? 6 : 3;
        g.moveTo(px + 0.5, RULER - len);
        g.lineTo(px + 0.5, RULER);
        if (px % 100 === 0 && px > 0) g.fillText(String(px), px + 3, 2);
      }
      const c0 = Math.floor((top - v.y) / 10) * 10;
      for (let c = c0; c - top + v.y < H; c += 10) {
        const py = c - top + v.y;
        if (py < RULER) continue;
        const len = c % 100 === 0 ? 9 : c % 50 === 0 ? 6 : 3;
        g.moveTo(RULER - len, py + 0.5);
        g.lineTo(RULER, py + 0.5);
        if (c % 100 === 0) {
          g.save();
          g.translate(2, py - 3);
          g.rotate(-Math.PI / 2);
          g.fillText(String(c), 0, 0);
          g.restore();
        }
      }
      g.stroke();
      if (focus) {
        g.fillStyle = "rgba(95,211,255,0.24)";
        g.fillRect(Math.max(RULER, focus.x), 0, focus.w, RULER);
        g.fillRect(0, Math.max(RULER, focus.y), RULER, focus.h);
      }
      g.fillStyle = C.ruler;
      g.fillRect(0, 0, RULER, RULER);
      g.strokeStyle = "rgba(95,211,255,0.38)";
      g.strokeRect(RULER - 0.5, -1, W, RULER);
      g.strokeRect(-1, RULER - 0.5, RULER, H);
      g.globalAlpha = 1;
    }

    // ------------------------------------------------------------ HUD

    updateHud(force) {
      const env = this.env;
      const v = env.view();
      const H = Math.max(1, env.height);
      let shown = 0;
      for (const b of this.bands) shown += Math.min(H, b.bottom) - Math.max(0, b.top);
      const frac = this.outro ? 1 : clamp(shown / H, 0, 1);
      this.$(".ring .fg").setAttribute("stroke-dashoffset", String(75.4 * (1 - frac)));
      const step = v.h * 0.82;
      const sheets = Math.max(1, Math.ceil((H - v.h) / step) + 1);
      const sheet = clamp(Math.round(env.top / step) + 1, 1, sheets);
      const pad = (n) => String(n).padStart(2, "0");
      this.$(".sheetn").textContent = `${pad(sheet)} / ${pad(sheets)}`;
      this.$(".size").textContent = `${Math.round(v.w)} × ${Math.round(H)}`;
      const t = this.$(".meta .t");
      const s = this.$(".meta .s");
      if (this.outro) {
        t.textContent = `Drafted in ${this.secs.toFixed(1)} s`;
        s.textContent = `${this.units.length.toLocaleString()} elements · ${sheets} sheet${sheets > 1 ? "s" : ""}`;
        return;
      }
      if (!force && this.intro < 1) return;
      const drawing = this.active.length || this.sweep;
      const viewDone = !this.sweep && !this.gapIn(env.top, Math.min(H, env.top + v.h));
      if (drawing || !viewDone) t.textContent = `Drafting sheet ${sheet} of ${sheets}`;
      else if (!this.tour) t.textContent = `Sheet ${sheet} done · scroll or tour`;
      else t.textContent = `Moving to sheet ${Math.min(sheets, sheet + 1)}`;
      s.textContent = `${this.done.toLocaleString()} / ${this.units.length.toLocaleString()} elements`;
    }

    destroy(quick) {
      if (this.dead) return;
      this.dead = true;
      cancelAnimationFrame(this.raf);
      for (const u of this.unbinds || []) u();
      const host = this.host;
      host.style.setProperty("transition", `opacity ${quick ? 0.2 : 0.35}s ease`, "important");
      host.style.setProperty("opacity", "0", "important");
      setTimeout(() => host.remove(), quick ? 220 : 380);
    }
  }

  // ------------------------------------------------------------------ control

  let app = null;

  function start() {
    if (app || !document.body) return;
    try {
      app = new App();
    } catch (err) {
      console.error("[draftline]", err);
      app = null;
    }
  }

  function stop() {
    if (!app) return;
    const a = app;
    app = null;
    a.destroy(false);
  }

  function replay() {
    if (app) {
      const env = app.env;
      app.destroy(true);
      app = null;
      env.scrollTo(0);
    }
    setTimeout(start, 240);
  }

  window[KEY] = {
    toggle() {
      if (app) stop();
      else start();
    },
    start,
    stop,
    get app() {
      return app;
    },
  };
  start();
})();
