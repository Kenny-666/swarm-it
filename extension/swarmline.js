/*
 * Swarmline: watch a swarm build any website, live, in your browser.
 *
 * One click and the page becomes a blank canvas in its own colours. A swarm of
 * glowing pen-nibs then flies from element to element in reading order: crews
 * trace each box (which then fills in for real), type every line of text letter
 * by letter, and scan images into place. Everything that appears is the real
 * page, in place, so fonts, video, animations and links are exactly the site's.
 * When the last screen is built the page is fully live again.
 *
 * Injected by background.js; injecting again while it runs exits.
 */
(() => {
  "use strict";

  const KEY = "__swarmline";
  if (window[KEY]) {
    window[KEY].toggle();
    return;
  }

  // ----------------------------------------------------------------- constants

  const SHOWN = "data-swarmline-v"; // elements the swarm has put back on the page
  const ACTIVE = "data-swarmline"; // on <html> while the page is being built
  const SANS = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const MAX_UNITS = 3000;
  const CHAR_BUDGET = 9000; // exact letter positions per scan; past that they're estimated
  const PALETTE = ["#FF5A6E", "#FFB020", "#19D3A2", "#3D9BFF", "#A46BFF", "#FF7AC8", "#2FE0F0", "#FF8A3D"];

  const SKIP = new Set([
    "script", "style", "noscript", "template", "head", "meta", "link", "title", "base", "br", "wbr",
    "option", "optgroup", "datalist", "source", "track", "param", "area", "map", "swarmline-layer",
  ]);
  const MEDIA = new Set(["img", "svg", "video", "canvas", "picture", "iframe", "embed", "object"]);
  const CONTROL = new Set(["input", "textarea", "select"]);
  const LANDMARK = new Set(["header", "nav", "main", "section", "article", "aside", "footer", "form", "figure", "button", "ul", "ol", "table"]);

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const TAU = Math.PI * 2;
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
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  function parseColor(c) {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length >= 4 ? p[3] : 1 };
  }
  const alphaOf = (c) => {
    if (!c || c === "transparent") return 0;
    const p = parseColor(c);
    return p ? p.a : 1;
  };
  const luminance = (c) => {
    const p = parseColor(c);
    return p ? (0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b) / 255 : 1;
  };

  // ---------------------------------------------------------------- environment

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

  // ------------------------------------------------------------- the page itself

  // While building, every element on the page is hidden except the ones the swarm has
  // put back. Layout never changes (visibility keeps boxes in place), the page keeps
  // running underneath, and the "blank canvas" is simply the site's own background.
  class Stage {
    constructor() {
      this.marked = [];
      this.clips = new Map();
      this.style = document.createElement("style");
      this.style.setAttribute("data-swarmline", "");
      this.style.textContent =
        `html[${ACTIVE}] body *:not([${SHOWN}]):not(swarmline-layer){visibility:hidden !important}` +
        `html[${ACTIVE}] [${SHOWN}]{visibility:visible !important}`;
    }
    hide() {
      (document.head || document.documentElement).appendChild(this.style);
      document.documentElement.setAttribute(ACTIVE, "");
    }
    // read the page as it really is (our hiding rule off for a moment, never painted)
    peek(fn) {
      const was = this.style.disabled;
      this.style.disabled = true;
      try {
        return fn();
      } finally {
        this.style.disabled = was;
      }
    }
    show(el) {
      if (!el || el.hasAttribute(SHOWN)) return false;
      el.setAttribute(SHOWN, "");
      this.marked.push(el);
      return true;
    }
    shown(el) {
      return !!el && el.hasAttribute(SHOWN);
    }
    fadeIn(el, ms, from = 0) {
      if (!this.show(el)) return;
      try {
        const op = getComputedStyle(el).opacity;
        el.animate([{ opacity: from }, { opacity: op }], { duration: ms, easing: "cubic-bezier(.2,.7,.2,1)" });
      } catch (_) {}
    }
    // text typed in place: clip the element to the letters written so far
    clip(el, path) {
      if (!this.clips.has(el)) this.clips.set(el, [el.style.getPropertyValue("clip-path"), el.style.getPropertyPriority("clip-path")]);
      el.style.setProperty("clip-path", path, "important");
    }
    unclip(el) {
      const c = this.clips.get(el);
      if (!c) return;
      this.clips.delete(el);
      if (c[0]) el.style.setProperty("clip-path", c[0], c[1]);
      else el.style.removeProperty("clip-path");
    }
    restore() {
      for (const el of [...this.clips.keys()]) this.unclip(el);
      document.documentElement.removeAttribute(ACTIVE);
      for (const el of this.marked) el.removeAttribute(SHOWN);
      this.marked = [];
      this.style.remove();
    }
  }

  // --------------------------------------------------------------------- scanner

  function radiiOf(s, w, h) {
    const m = Math.min(w, h) / 2;
    return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].map((v) => {
      const n = parseFloat(v) || 0;
      return clamp(/%$/.test(v) ? (n / 100) * Math.min(w, h) : n, 0, m);
    });
  }

  const sameColor = (a, b) => !!a && !!b && a.replace(/\s/g, "") === b.replace(/\s/g, "");

  function paintsBox(s, under) {
    const bg = s.backgroundColor;
    if (alphaOf(bg) > 0.03 && !sameColor(bg, under)) return true;
    if (s.backgroundImage && s.backgroundImage !== "none") return true;
    if (s.boxShadow && s.boxShadow !== "none") return true;
    if (s.backdropFilter && s.backdropFilter !== "none") return true;
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      if (parseFloat(s["border" + side + "Width"]) > 0 && s["border" + side + "Style"] !== "none" && alphaOf(s["border" + side + "Color"]) > 0.05) return true;
    }
    return false;
  }

  const isInlineLevel = (d) => d.startsWith("inline") || d === "contents";

  function nameOf(el, kind) {
    const tag = el.localName;
    if (kind === "media") return tag === "img" || tag === "picture" ? "Image" : tag === "svg" ? "Vector" : tag[0].toUpperCase() + tag.slice(1);
    if (LANDMARK.has(tag)) return tag[0].toUpperCase() + tag.slice(1);
    const cls = ((el.getAttribute && el.getAttribute("class")) || "").trim().split(/\s+/)[0] || "";
    const clean = cls.replace(/[^a-zA-Z0-9-]/g, "").replace(/^(-|\d)+/, "");
    if (clean && clean.length <= 18) return clean[0].toUpperCase() + clean.slice(1);
    return "Frame";
  }

  class Scanner {
    constructor(env, host, stage) {
      this.env = env;
      this.host = host;
      this.stage = stage;
      this.seen = new WeakSet();
      this.boxOf = new WeakMap();
      this.flowRoots = new WeakSet();
      this.count = 0;
    }

    // An element's own running text: line boxes, letter edges and the inline elements
    // that carry it (links, spans, split-text letters), all relative to its box.
    text(el, r, cs, budget) {
      const nodes = [];
      const flow = [];
      const inFlow = (n) => {
        for (let p = n.parentElement; p && p !== el; p = p.parentElement) if (!isInlineLevel(cs(p).display)) return false;
        return true;
      };
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) if (/\S/.test(n.data) && inFlow(n)) nodes.push(n);
      for (const d of el.querySelectorAll("*")) {
        const s = cs(d);
        if (MEDIA.has(d.localName) && d.localName !== "svg") continue;
        if (isInlineLevel(s.display) && s.display !== "contents" && inFlow(d) && s.visibility === "visible") {
          flow.push(d);
          if (d.localName === "svg") for (const k of d.querySelectorAll("*")) flow.push(k);
        }
      }
      const rects = [];
      const chars = [];
      const rg = document.createRange();
      for (const n of nodes) {
        rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) if (q.width > 0.5 && q.height > 0.5) rects.push(q);
        if (budget.left > 0) {
          const s = n.data;
          for (let i = 0; i < s.length; i++) {
            if (/\s/.test(s[i]) && (i === 0 || /\s/.test(s[i - 1]))) continue;
            rg.setStart(n, i);
            rg.setEnd(n, i + 1);
            const q = rg.getBoundingClientRect();
            if (q.width > 0 || q.height > 0) chars.push(q);
          }
          budget.left -= s.length;
        }
      }
      rects.sort((a, b) => a.top - b.top || a.left - b.left);
      const lines = [];
      for (const q of rects) {
        const last = lines[lines.length - 1];
        const mid = q.top + q.height / 2;
        if (last && mid > last.t && mid < last.b) {
          last.l = Math.min(last.l, q.left);
          last.r = Math.max(last.r, q.right);
          last.t = Math.min(last.t, q.top);
          last.b = Math.max(last.b, q.bottom);
        } else lines.push({ l: q.left, r: q.right, t: q.top, b: q.bottom, edges: [] });
      }
      if (!lines.length) return null;
      if (chars.length) {
        for (const q of chars) {
          const mid = q.top + q.height / 2;
          const L = lines.find((l) => mid >= l.t - 1 && mid <= l.b + 1);
          if (L) L.edges.push(q.right);
        }
      }
      const fs = parseFloat(cs(el).fontSize) || 16;
      const out = lines.map((L) => {
        let e = L.edges.sort((a, b) => a - b);
        if (!e.length) {
          // estimate letters for text past the exact-measurement budget
          const n = Math.max(1, Math.round((L.r - L.l) / (fs * 0.52)));
          e = Array.from({ length: n }, (_, i) => L.l + ((L.r - L.l) * (i + 1)) / n);
        }
        return { x: L.l - r.left, y: L.t - r.top, w: L.r - L.l, h: L.b - L.t, edges: e.map((x) => x - r.left) };
      });
      return { lines: out, flow, total: out.reduce((n, L) => n + L.edges.length, 0) };
    }

    // Walk the DOM and register what's new inside a band of the page (content px).
    scan(band) {
      return this.stage.peek(() => this.walk(band));
    }

    walk(band) {
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
      const budget = { left: CHAR_BUDGET };

      const make = (el, kind, r, s, parent, fixed, extra) => {
        const u = {
          id: this.count++, el, kind, parent, fixed,
          state: 0, phase: 0, p: 0, typed: 0, color: PALETTE[this.count % PALETTE.length],
          y: fixed ? -1e9 : toContent(r.top), w: r.width, h: r.height, top0: r.top, left0: r.left,
          rad: radiiOf(s, r.width, r.height), label: "", lead: null,
          ...extra,
        };
        if (kind === "box" && r.width * r.height > 9000) u.label = `${nameOf(el, kind)}  ${Math.round(r.width)} × ${Math.round(r.height)}`;
        if (kind === "media" && r.width * r.height > 6000) u.label = `${nameOf(el, kind)}  ${Math.round(r.width)} × ${Math.round(r.height)}`;
        for (let a = parent; a && u.label; a = a.parent) {
          if (a.label && Math.abs(a.top0 - r.top) < 26 && Math.abs(a.left0 - r.left) < 120) u.label = "";
          if (Math.abs(a.top0 - r.top) >= 26) break;
        }
        out.push(u);
        return u;
      };

      // under: the solid colour painted behind this element, or null over images/gradients
      const visit = (el, parent, fixed, under, inFlow) => {
        if (this.count >= MAX_UNITS) return;
        const tag = el.localName;
        if (SKIP.has(tag) || el === this.host) return;
        const s = cs(el);
        const d = s.display;
        if (d === "none") return;
        if (d === "contents") {
          for (const k of el.children) visit(k, parent, fixed, under, inFlow);
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
        const show = s.visibility === "visible" && r.width >= 2 && r.height >= 2 && inBand;
        const isMedia = MEDIA.has(tag);
        const isControl = CONTROL.has(tag);
        let boxUnit = this.boxOf.get(el) || null;
        let madeText = false;
        const flowPiece = inFlow && isInlineLevel(d);
        if (show && !this.seen.has(el) && !flowPiece) {
          this.seen.add(el);
          if (isMedia) {
            make(el, "media", r, s, parent, isFixed);
            return;
          }
          if (isControl) {
            if ((el.getAttribute("type") || "").toLowerCase() !== "hidden") make(el, "control", r, s, parent, isFixed);
            return;
          }
          const inline = d === "inline";
          if (!inline && paintsBox(s, under)) {
            boxUnit = make(el, "box", r, s, parent, isFixed);
            this.boxOf.set(el, boxUnit);
          }
          if (!inline) {
            let hasText = false;
            for (const n of el.childNodes) {
              if (n.nodeType === 3 ? /\S/.test(n.data) : n.nodeType === 1 && isInlineLevel(cs(n).display) && !MEDIA.has(n.localName) && /\S/.test(n.textContent)) {
                hasText = true;
                break;
              }
            }
            if (hasText) {
              const t = this.text(el, r, cs, budget);
              if (t) {
                // how to type it: clip the element to the letters so far, unless the
                // element paints its own box (a button) - then reveal by colour
                const mode = boxUnit && boxUnit.el === el ? "fade" : "clip";
                make(el, "text", r, s, boxUnit || parent, isFixed, {
                  lines: t.lines, flow: t.flow, total: t.total, mode, fs: parseFloat(s.fontSize) || 16,
                  ink: s.color, caretColor: s.color,
                });
                madeText = true;
                this.flowRoots.add(el);
              }
            } else if (!el.firstElementChild && r.width <= 96 && r.height <= 96 && !/\S/.test(el.textContent)) {
              for (const w of ["::before", "::after"]) {
                const ps = getComputedStyle(el, w);
                if (ps.display !== "none" && /^"(.+)"$/.test(ps.content || "")) {
                  make(el, "glyph", r, s, boxUnit || parent, isFixed);
                  break;
                }
              }
            }
          }
        } else if (isMedia || isControl) return;
        if (isMedia || isControl) return;
        const bg = s.backgroundColor;
        let kidUnder = under;
        if (s.backgroundImage && s.backgroundImage !== "none") kidUnder = null;
        else if (alphaOf(bg) > 0.99) kidUnder = bg;
        else if (alphaOf(bg) > 0.03) kidUnder = null;
        const kidParent = boxUnit || parent;
        const kidFlow = madeText || flowPiece || this.flowRoots.has(el);
        for (const k of el.children) visit(k, kidParent, isFixed, kidUnder, kidFlow);
        if (el.shadowRoot) for (const k of el.shadowRoot.children) visit(k, kidParent, isFixed, kidUnder, kidFlow);
      };

      let pageBg = "rgb(255, 255, 255)";
      for (const e of [body, html]) {
        if (e && alphaOf(cs(e).backgroundColor) > 0.5) {
          pageBg = cs(e).backgroundColor;
          break;
        }
      }
      if (body) for (const k of body.children) visit(k, null, false, pageBg, false);
      return out;
    }

    // Everything still hidden on screen (decoration, wrappers, anything that isn't a
    // unit of its own), top to bottom, for the end-of-screen sweep.
    leftovers(vTop, vBottom) {
      return this.stage.peek(() => {
        const out = [];
        const all = document.body ? document.body.getElementsByTagName("*") : [];
        for (let i = 0; i < all.length && out.length < 4000; i++) {
          const el = all[i];
          if (el === this.host || SKIP.has(el.localName) || this.stage.shown(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.bottom < vTop || r.top > vBottom) continue;
          out.push({ el, y: r.top });
        }
        return out.sort((a, b) => a.y - b.y);
      });
    }
  }

  // ---------------------------------------------------------------------- styles

  const STYLE = `
:host{all:initial}
*{box-sizing:border-box}
canvas{position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:auto;cursor:default}
canvas.off{pointer-events:none}
.hud{position:fixed;left:50%;bottom:22px;display:flex;align-items:center;gap:6px;padding:6px 6px 6px 8px;border-radius:16px;background:rgba(16,17,22,.9);-webkit-backdrop-filter:blur(16px) saturate(150%);backdrop-filter:blur(16px) saturate(150%);box-shadow:0 20px 50px rgba(0,0,0,.32),inset 0 0 0 1px rgba(255,255,255,.08);color:#F4F5F8;font:500 12px/1 ${SANS};pointer-events:auto;opacity:0;transform:translate(-50%,14px);transition:opacity .45s ease,transform .45s cubic-bezier(.2,.8,.2,1);user-select:none;white-space:nowrap}
.hud.on{opacity:1;transform:translate(-50%,0)}
.ring{width:30px;height:30px;flex:none}
.ring circle{fill:none;stroke-width:3}
.ring .bg{stroke:rgba(255,255,255,.12)}
.ring .fg{stroke:url(#sw-grad);stroke-linecap:round;transition:stroke-dashoffset .3s ease}
.meta{display:flex;flex-direction:column;gap:4px;padding:0 10px 0 4px;min-width:178px}
.meta .t{font-weight:650;color:#fff}
.meta .s{color:#9CA3B4;font:500 11px/1 ${SANS};font-variant-numeric:tabular-nums}
.hud button{all:unset;cursor:pointer;padding:8px 11px;border-radius:10px;color:#F4F5F8;background:rgba(255,255,255,.07);font:550 12px/1 ${SANS};transition:background .15s,color .15s}
.hud button:hover{background:rgba(255,255,255,.14)}
.hud button:focus-visible{outline:2px solid #3D9BFF;outline-offset:1px}
.hud button.on{background:linear-gradient(90deg,#FF5A6E,#A46BFF 55%,#3D9BFF);color:#fff}
.hud button.pri{background:linear-gradient(90deg,#FF5A6E,#A46BFF 55%,#3D9BFF);color:#fff;font-weight:650}
.hud button[hidden]{display:none}
.hud .x{padding:8px 10px;color:#9CA3B4;background:transparent}
`;

  // ------------------------------------------------------------------------- app

  class App {
    constructor() {
      this.env = new Env();
      this.stage = new Stage();
      this.dead = false;
      this.speed = reduced() ? 3 : 1;
      this.tour = true; // on by default: glide through the page on its own
      this.units = [];
      this.waiting = [];
      this.active = [];
      this.bands = []; // finished rows of the page, content px
      this.scanned = [];
      this.sweep = null;
      this.jump = null;
      this.frontier = -Infinity;
      this.done = 0;
      this.time = 0;
      this.intro = 0;
      this.hidden = false;
      this.outro = null;
      this.lastTop = null;
      this.speedPx = 0;
      this.restFor = 0;
      this.dwell = 0;
      this.focus = null;
      this.nibs = [];
      this.anchor = null;
      this.dt = 0;
      this.startedAt = performance.now();
      this.pageBg = this.readPageBg();
      this.dark = luminance(this.pageBg) < 0.45;
      this.mount();
      this.scanner = new Scanner(this.env, this.host, this.stage);
      this.makeNibs();
      this.bind();
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
    }

    readPageBg() {
      for (const e of [document.body, document.documentElement]) {
        if (!e) continue;
        const c = getComputedStyle(e).backgroundColor;
        if (alphaOf(c) > 0.5) return c;
      }
      return "rgb(255, 255, 255)";
    }

    mount() {
      for (const old of document.querySelectorAll("swarmline-layer")) old.remove();
      const host = document.createElement("swarmline-layer");
      host.style.cssText = "all:initial !important;position:fixed !important;inset:0 !important;z-index:2147483647 !important;display:block !important;visibility:visible !important;pointer-events:none !important;contain:strict !important;";
      const root = host.attachShadow({ mode: "closed" }); // page scripts can't reach in
      root.innerHTML = `<style>${STYLE}</style>
<canvas aria-hidden="true"></canvas>
<div class="hud" role="toolbar" aria-label="Swarmline">
  <svg class="ring" viewBox="0 0 30 30" aria-hidden="true"><defs><linearGradient id="sw-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF5A6E"/><stop offset=".55" stop-color="#A46BFF"/><stop offset="1" stop-color="#3D9BFF"/></linearGradient></defs><circle class="bg" cx="15" cy="15" r="12"/><circle class="fg" cx="15" cy="15" r="12" transform="rotate(-90 15 15)" stroke-dasharray="75.4" stroke-dashoffset="75.4"/></svg>
  <div class="meta" aria-live="polite"><span class="t">Clearing the canvas…</span><span class="s">&nbsp;</span></div>
  <button data-a="tour" class="${this.tour ? "on" : ""}" aria-pressed="${this.tour}" title="Glide through the page screen by screen (T)">Auto-tour</button>
  <button data-a="speed" title="Build speed" aria-label="Build speed 1×">1×</button>
  <button data-a="finish" title="Show the finished page now (F)">Finish</button>
  <button data-a="replay" class="pri" hidden title="Build the page again">Replay</button>
  <button data-a="close" class="x" title="Exit (Esc)" aria-label="Exit Swarmline">✕</button>
</div>`;
      document.documentElement.appendChild(host);
      this.host = host;
      this.root = root;
      this.cv = root.querySelector("canvas");
      this.g = this.cv.getContext("2d");
      this.hud = root.querySelector(".hud");
      this.$ = (s) => root.querySelector(s);
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
    }

    bind() {
      const on = (t, ev, fn, o) => {
        t.addEventListener(ev, fn, o);
        (this.unbinds || (this.unbinds = [])).push(() => t.removeEventListener(ev, fn, o));
      };
      on(window, "resize", () => this.resize());
      on(window, "pagehide", () => stop(true));
      on(window, "wheel", () => {
        if (this.jump) this.jump = null; // the reader took over
      }, { passive: true });
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
          b.setAttribute("aria-label", `Build speed ${this.speed}×`);
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

    // ---------------------------------------------------------------- bands

    covered(a, b) {
      for (const k of this.bands) if (k.top <= a + 1 && k.bottom >= b - 1) return true;
      return false;
    }
    gapIn(a, b) {
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
    scannedCovers(a, b) {
      for (const k of this.scanned) if (k.top <= a + 1 && k.bottom >= b - 1) return true;
      return false;
    }

    // ---------------------------------------------------------------- units

    register(list) {
      for (const u of list) {
        this.units.push(u);
        // already on the page (an earlier sweep put it back): nothing to build
        if (this.stage.shown(u.el)) this.complete(u, true);
        else this.waiting.push(u);
      }
      this.waiting.sort((a, b) => (a.fixed !== b.fixed ? (a.fixed ? -1 : 1) : a.y - b.y || a.id - b.id));
    }

    complete(u, silent) {
      if (u.state === 2) return;
      this.release(u);
      u.state = 2;
      u.p = 1;
      this.done++;
      const st = this.stage;
      if (u.kind === "text") {
        st.show(u.el);
        for (const f of u.flow) st.show(f);
        st.unclip(u.el);
      } else if (u.kind === "media" || u.kind === "control") {
        st.show(u.el);
        for (const k of u.el.querySelectorAll("*")) st.show(k);
      } else st.show(u.el);
      if (!silent && this.focus === u) this.focus = null;
    }

    liveRect(u) {
      const el = u.el;
      if (!el.isConnected) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }

    inView(u, v, top, pad = 0) {
      if (u.fixed) return true;
      const y = u.y - top + v.y;
      return y + u.h > v.y - pad && y < v.y + v.h + pad;
    }

    // a unit can start once the box it sits in has been drawn
    parentReady(u) {
      const p = u.parent;
      if (!p) return true;
      return p.state === 2 || (p.kind === "box" && p.state === 1 && p.phase >= 1);
    }

    // ---------------------------------------------------------------- frame

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
        console.error("[swarmline]", err);
        stop(true); // never leave a page hidden
        return;
      }
      if (!this.dead) this.raf = requestAnimationFrame((t) => this.frame(t));
    }

    update(dt) {
      this.time += dt;
      this.dt = dt;
      const env = this.env;
      const v = env.view();
      const top = env.top;
      const sdt = dt * this.speed;
      const st = this.stage;

      const moved = this.lastTop == null ? 0 : Math.abs(top - this.lastTop);
      this.lastTop = top;
      const inst = this.jump ? 0 : moved / Math.max(dt, 0.001);
      this.speedPx += (inst - this.speedPx) * (1 - Math.exp(-dt / 0.12));
      const resting = !this.jump && this.speedPx < 45;
      this.restFor = resting ? this.restFor + dt : 0;

      // intro: the page fades into a blank canvas of its own colour
      if (this.intro < 1) {
        this.intro = Math.min(1, this.intro + dt / 0.75);
        if (this.intro >= 0.45 && !this.hidden) {
          this.hidden = true;
          st.hide();
        }
        if (this.intro > 0.3) this.hud.classList.add("on");
        if (this.intro < 1) return;
      }

      if (this.outro) {
        this.outro.t = Math.min(1, this.outro.t + dt / 1.1);
        if (this.outro.t >= 1 && !this.outro.off) {
          this.outro.off = true;
          this.cv.classList.add("off");
        }
        return;
      }

      if (this.jump) {
        const J = this.jump;
        J.t += dt;
        const k = Math.min(1, J.t / J.dur);
        env.scrollTo(Math.round(J.from + (J.to - J.from) * easeSine(k)));
        if (k >= 1) this.jump = null;
      }

      if (this.restFor > 0.12 && (this.scanTop !== Math.round(top) || this.scanH !== env.height)) {
        this.scanTop = Math.round(top);
        this.scanH = env.height;
        const band = { top: top - v.h * 0.1, bottom: top + v.h * 1.1 };
        this.register(this.scanner.scan(band));
        this.scanned = this.addBand(this.scanned, band.top, band.bottom);
        this.frontier = Math.max(this.frontier, top + v.h);
      }

      // start work in reading order, a crew at a time
      const slots = 8 + this.speed * 3;
      let busy = 0;
      for (const u of this.active) if (!(u.kind === "box" && u.phase >= 1)) busy++;
      if (resting && this.waiting.length) {
        const keep = [];
        for (const u of this.waiting) {
          if (u.state !== 0) continue;
          if (st.shown(u.el)) {
            this.complete(u, true);
            continue;
          }
          const go = busy < slots && (u.fixed || u.y <= this.frontier) && this.parentReady(u);
          if (!go) {
            keep.push(u);
            continue;
          }
          if (!this.inView(u, v, top, 40)) {
            this.complete(u, true); // scrolled past without being seen: it simply appears
            continue;
          }
          u.state = 1;
          u.phase = 0;
          u.p = 0;
          this.crew(u);
          this.active.push(u);
          if (u.kind !== "text" || u.fs >= 26) this.focus = u;
          busy++;
        }
        this.waiting = keep;
      }

      // work waits (briefly) for its crew to arrive, so the swarm visibly does it
      const ready = (u) => !u.lead || u.lead.attached || (u.waitT = (u.waitT || 0) + sdt) > 0.6;
      for (const u of this.active) {
        if (u.state !== 1) continue;
        if (u.kind === "box") {
          if (u.phase === 0) {
            if (ready(u)) u.p += sdt / 0.42;
            if (u.p >= 1) {
              u.phase = 1;
              u.p = 0;
              this.release(u);
              st.fadeIn(u.el, 380 / this.speed); // the box itself fills in for real
            }
          } else {
            u.p += sdt / 0.38;
            if (u.p >= 1) this.complete(u);
          }
        } else if (u.kind === "text") {
          if (u.phase === 0) {
            if (ready(u)) {
              u.phase = 1;
              st.show(u.el);
              for (const f of u.flow) st.show(f);
              if (u.mode === "fade") this.colorIn(u);
              else st.clip(u.el, this.typedPath(u, 0));
            }
          } else {
            // typing: a natural, slightly uneven rhythm; long paragraphs speed up
            const rate = Math.max(42, u.total / 1.2) * (0.75 + Math.random() * 0.6);
            u.typed = Math.min(u.total, u.typed + rate * sdt);
            if (u.mode !== "fade") st.clip(u.el, this.typedPath(u, Math.floor(u.typed)));
            if (u.typed >= u.total) this.complete(u);
          }
        } else if (u.kind === "media" || u.kind === "control") {
          if (u.phase === 0) {
            if (ready(u)) u.p += sdt / 0.38;
            if (u.p >= 1) {
              u.phase = 1;
              u.p = 0;
              st.show(u.el);
              for (const k of u.el.querySelectorAll("*")) st.show(k);
              this.scanIn(u);
            }
          } else {
            u.p += sdt / (u.kind === "media" ? 0.62 : 0.36);
            if (u.p >= 1) this.complete(u);
          }
        } else {
          if (ready(u)) u.p += sdt / 0.3;
          if (u.p >= 0.5 && !st.shown(u.el)) st.fadeIn(u.el, 220 / this.speed);
          if (u.p >= 1) this.complete(u);
        }
      }
      if (this.active.some((u) => u.state === 2)) this.active = this.active.filter((u) => u.state !== 2);

      // end of a screen: everything still hidden there (backgrounds of plain wrappers,
      // decoration) comes in top to bottom behind a soft light line
      if (this.sweep) {
        const s = this.sweep;
        s.p = Math.min(1, s.p + sdt / s.dur);
        const edge = s.vTop + (s.vBottom - s.vTop) * easeInOut(s.p) + 60;
        while (s.i < s.items.length && s.items[s.i].y <= edge) {
          const it = s.items[s.i++];
          if (st.shown(it.el)) continue;
          if (it.el.querySelector(`[${SHOWN}]`)) st.show(it.el); // has built content inside: no fade
          else st.fadeIn(it.el, 300);
        }
        if (s.p >= 1) {
          for (; s.i < s.items.length; s.i++) st.show(s.items[s.i].el);
          this.bands = this.addBand(this.bands, s.top, s.bottom);
          this.sweep = null;
        }
      } else if (resting && this.restFor > 0.08) {
        const vt = top;
        const vb = Math.min(env.height, top + v.h);
        const gap = this.gapIn(vt, vb);
        if (gap && this.scannedCovers(vt, vb)) {
          const pending = this.waiting.some((u) => !u.fixed && u.y < gap.bottom && u.y + u.h > gap.top && u.y >= vt - 2) ||
            this.active.some((u) => !(u.kind === "box" && u.phase >= 1));
          if (!pending) {
            const sTop = gap.top - top + v.y;
            const sBottom = gap.bottom - top + v.y;
            const items = this.scanner.leftovers(Math.max(0, sTop - 2), sBottom + 2);
            this.sweep = { top: gap.top, bottom: gap.bottom, vTop: sTop, vBottom: sBottom, p: 0, i: 0, items, dur: items.length ? 0.6 : 0.2 };
          }
        }
      }

      // tour: next screen, or the end
      const viewDone = !this.sweep && !this.gapIn(top, Math.min(env.height, top + v.h));
      if (viewDone && !this.jump) {
        const atEnd = top >= env.maxTop() - 1;
        if (atEnd && this.covered(0, env.height)) {
          this.dwell += dt;
          if (this.dwell > 0.5) this.finish();
        } else if (this.tour && resting) {
          // a finished screen hands straight over to the next one
          this.dwell += dt * this.speed;
          if (this.dwell > 0.12) {
            this.dwell = 0;
            const gap = atEnd ? this.gapIn(0, env.height) : null;
            const to = gap ? clamp(gap.top, 0, env.maxTop()) : Math.min(env.maxTop(), top + v.h * 0.82);
            if (reduced()) env.scrollTo(to);
            else this.jump = { from: top, to, t: 0, dur: clamp(0.4 + (to - top) / 2600, 0.5, 1.1) / Math.sqrt(this.speed) };
          }
        } else this.dwell = 0;
      } else this.dwell = 0;
    }

    // the clip that shows a text element's first n letters (element-local px)
    typedPath(u, n) {
      let d = "";
      let left = n;
      for (const L of u.lines) {
        if (left <= 0) break;
        const k = Math.min(left, L.edges.length);
        left -= k;
        const x0 = Math.min(L.x, 0) - 4;
        const right = k >= L.edges.length ? L.x + L.w + 6 : L.edges[k - 1] + 0.5;
        const y0 = L.y - 3;
        const h = L.h + 6;
        d += `M${(x0).toFixed(1)} ${y0.toFixed(1)}H${right.toFixed(1)}V${(y0 + h).toFixed(1)}H${x0.toFixed(1)}Z`;
      }
      return d ? `path('${d}')` : "path('M0 0Z')";
    }

    // where the caret sits after n letters (element-local px)
    caretAt(u, n) {
      let left = Math.floor(n);
      for (const L of u.lines) {
        if (left <= L.edges.length) return { x: left ? L.edges[left - 1] : L.x, y: L.y, h: L.h };
        left -= L.edges.length;
      }
      const L = u.lines[u.lines.length - 1];
      return { x: L.x + L.w, y: L.y, h: L.h };
    }

    colorIn(u) {
      try {
        const c = getComputedStyle(u.el).color;
        u.el.animate([{ color: "transparent", WebkitTextFillColor: "transparent" }, { color: c, WebkitTextFillColor: c }], { duration: 500 / this.speed, easing: "ease-out" });
      } catch (_) {}
    }

    scanIn(u) {
      try {
        const kf = u.kind === "control"
          ? [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }]
          : [{ clipPath: "inset(0 0 100% 0)", opacity: 0.6 }, { clipPath: "inset(0 0 0 0)", opacity: 1 }];
        u.el.animate(kf, { duration: (u.kind === "media" ? 620 : 360) / this.speed, easing: "cubic-bezier(.65,0,.35,1)" });
      } catch (_) {}
    }

    finish() {
      if (this.outro || this.dead) return;
      this.jump = null;
      this.outro = { t: 0, at: performance.now() };
      this.secs = (this.outro.at - this.startedAt) / 1000;
      // the rest of the page comes back at once, gently
      const leftover = [];
      for (const u of this.units) if (u.state !== 2) this.complete(u, true);
      this.stage.peek(() => {
        for (const el of document.body ? document.body.getElementsByTagName("*") : []) if (!this.stage.shown(el) && el !== this.host) leftover.push(el);
      });
      this.stage.restore();
      for (const el of leftover.slice(0, 600)) {
        try {
          const r = el.getBoundingClientRect();
          if (r.bottom > 0 && r.top < innerHeight && !el.firstElementChild) el.animate([{ opacity: 0 }, { opacity: getComputedStyle(el).opacity }], { duration: 450 });
        } catch (_) {}
      }
      this.$('[data-a="tour"]').hidden = true;
      this.$('[data-a="speed"]').hidden = true;
      this.$('[data-a="finish"]').hidden = true;
      this.$('[data-a="replay"]').hidden = false;
      this.updateHud(true);
    }

    // ---------------------------------------------------------------- the swarm

    makeNibs() {
      const n = reduced() ? 8 : 28;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.nibs.push({
          i, unit: null, role: 0, attached: false, vis: 0, color: PALETTE[i % PALETTE.length],
          x: this.W / 2 + Math.cos(a) * 6, y: this.H / 2 + Math.sin(a) * 6,
          vx: Math.cos(a) * (700 + (i % 4) * 160), vy: Math.sin(a) * (700 + (i % 4) * 160), ang: a,
          trail: [], seed: Math.random() * Math.PI * 2, born: 0.55 + i * 0.012, size: 1.2 + (i % 3) * 0.14,
          ring: i % 3 === 2 ? 1 : 0, orb: a, orbiting: false,
        });
      }
      this.ringPhase = [0, 0];
    }

    // where the free swarm circles: over the next thing to build, so it's always
    // heading for the next section instead of waiting in the middle
    nextSpot(rects, v) {
      const top = this.env.top;
      for (const u of this.waiting) {
        if (u.state !== 0 || u.fixed) continue;
        const y = u.y - top + v.y;
        if (y > v.y + v.h) break; // sorted by y: nothing further is on screen
        if (y + u.h < v.y) continue;
        return [u.left0 + Math.min(u.w, 520) / 2, y + Math.min(u.h, 220) / 2];
      }
      const fr = this.focus && rects.get(this.focus);
      if (fr) return [fr.x + fr.w / 2, fr.y + Math.min(fr.h, 160) / 2];
      // screen done: drift low, the way the tour is about to go
      return [v.x + v.w / 2, v.y + v.h * (this.tour ? 0.6 : 0.46)];
    }

    // free nibs fly an evenly spaced double orbit: outer ring one way, inner the other
    orbitTargets(free, dt) {
      const W = this.W;
      const H = this.H;
      const rings = [[], []];
      for (const n of free) rings[n.ring].push(n);
      const total = free.length;
      const R0 = clamp(54 + total * 4.2, 74, 150);
      const radii = [R0, R0 * 0.56];
      const speeds = [0.85, -1.25];
      const cx = clamp(this.anchor[0], R0 + 24, W - R0 - 24);
      const cy = clamp(this.anchor[1], R0 + 24, H - R0 - 96);
      const out = new Map();
      for (let r = 0; r < 2; r++) {
        const L = rings[r];
        const m = L.length;
        this.ringPhase[r] += speeds[r] * dt;
        if (!m) continue;
        const ph = this.ringPhase[r];
        for (const n of L) {
          if (!n.orbiting) {
            n.orbiting = true;
            n.orb = Math.atan2(n.y - cy, n.x - cx); // join the ring where it is
          }
        }
        // keep their order round the ring, ease each into an even slot
        const rel = (n) => (((n.orb - ph) % TAU) + TAU) % TAU;
        L.sort((p, q) => rel(p) - rel(q));
        const ek = 1 - Math.exp(-dt * 4);
        for (let k = 0; k < m; k++) {
          const n = L[k];
          const slot = ph + (TAU * (k + 0.5)) / m; // half a step in, so no nib sits on the seam
          let d = (slot - n.orb) % TAU;
          if (d > Math.PI) d -= TAU;
          if (d < -Math.PI) d += TAU;
          n.orb += speeds[r] * dt + d * ek;
          // a soft rosette: the ring breathes in three lobes as it turns
          const rr = radii[r] * (1 + 0.05 * Math.sin(3 * (n.orb - ph) + this.time * 1.2 + r * Math.PI));
          out.set(n, [cx + Math.cos(n.orb) * rr, cy + Math.sin(n.orb) * rr]);
        }
      }
      return out;
    }

    crew(u) {
      const want = u.kind === "glyph" || u.kind === "control" ? 1 : u.kind === "text" ? (u.lines.length > 1 ? 2 : 1) : u.w * u.h > 60000 ? 4 : u.w * u.h > 12000 ? 3 : 2;
      const free = this.nibs.filter((n) => !n.unit);
      if (!free.length) return;
      const r = u.el.getBoundingClientRect();
      const d = (n) => Math.hypot(n.x - r.left, n.y - r.top);
      free.sort((a, b) => d(a) - d(b));
      for (let k = 0; k < want && k < free.length; k++) {
        free[k].unit = u;
        free[k].role = k;
        free[k].attached = false;
      }
      u.lead = free[0];
      u.color = free[0].color;
      u.waitT = 0;
    }

    release(u) {
      if (!u.lead) return;
      for (const n of this.nibs) {
        if (n.unit !== u) continue;
        n.unit = null;
        n.attached = false;
      }
      u.lead = null;
    }

    perim(R, t) {
      const { x, y, w, h } = R;
      let d = (((t % 1) + 1) % 1) * 2 * (w + h);
      if (d < w) return [x + d, y];
      d -= w;
      if (d < h) return [x + w, y + d];
      d -= h;
      if (d < w) return [x + w - d, y + h];
      d -= w;
      return [x, y + h - d];
    }

    workPoint(n, u, R) {
      const k = clamp(u.p, 0, 1);
      if (u.kind === "box" || ((u.kind === "media" || u.kind === "control") && u.phase === 0)) {
        // the crew traces the outline together, spaced around it
        return this.perim(R, easeInOut(u.phase === 0 ? k : 1) - n.role * 0.09);
      }
      if (u.kind === "text") {
        const c = this.caretAt(u, u.typed);
        if (n.role === 0) return [R.x + c.x + 4, R.y + c.y + c.h * 0.62];
        // a helper hovers a little ahead, where the next words go
        const ahead = this.caretAt(u, Math.min(u.total, u.typed + 14));
        return [R.x + ahead.x + 10, R.y + ahead.y - 6];
      }
      if (u.kind === "glyph") {
        const a = this.time * 7 + n.role * 2.1;
        const rr = Math.hypot(R.w, R.h) / 2 + 6;
        return [R.x + R.w / 2 + Math.cos(a) * rr, R.y + R.h / 2 + Math.sin(a) * rr];
      }
      const c = easeInOut(k);
      if (u.kind === "control") return [R.x + R.w * c, R.y + R.h * (0.3 + 0.4 * (n.role % 2))];
      return [R.x + R.w * [0.1, 0.9, 0.5, 0.3][n.role % 4], R.y + R.h * c];
    }

    stepSwarm(rects, v) {
      const dt = this.dt;
      const W = this.W;
      const H = this.H;
      const want = this.nextSpot(rects, v);
      if (!this.anchor) this.anchor = [W / 2, H * 0.45];
      const ak = 1 - Math.exp(-dt * 3);
      this.anchor[0] += (want[0] - this.anchor[0]) * ak;
      this.anchor[1] += (want[1] - this.anchor[1]) * ak;
      let sweepY = null;
      if (this.sweep) sweepY = this.sweep.vTop + (this.sweep.vBottom - this.sweep.vTop) * easeInOut(this.sweep.p);
      const free = this.nibs.filter((n) => !n.unit || !rects.get(n.unit));
      const orbit = !this.outro && sweepY == null ? this.orbitTargets(free, dt) : null;
      for (const n of this.nibs) {
        n.vis = this.time < n.born ? 0 : Math.min(1, n.vis + dt / 0.3);
        let tx;
        let ty;
        let stick = false;
        const R = n.unit && rects.get(n.unit);
        const target = orbit && orbit.get(n);
        if (!target) n.orbiting = false;
        if (this.outro) {
          // the rings unwind: each nib spirals out and away
          const a = (Math.atan2(n.y - H / 2, n.x - W / 2) || n.seed) + 0.8;
          tx = n.x + Math.cos(a) * 900;
          ty = n.y + Math.sin(a) * 900;
        } else if (R) {
          [tx, ty] = this.workPoint(n, n.unit, R);
          if (!n.attached && Math.hypot(tx - n.x, ty - n.y) < 16) n.attached = true;
          stick = n.attached;
        } else if (sweepY != null) {
          const j = free.indexOf(n);
          tx = v.x + (v.w * (j + 0.5)) / Math.max(1, free.length);
          ty = sweepY + Math.sin(this.time * 6 + j) * 6;
        } else if (target) {
          [tx, ty] = target;
        } else {
          tx = this.anchor[0];
          ty = this.anchor[1];
        }
        if (stick) {
          const k = 1 - Math.exp(-dt * 36);
          const nx = n.x + (tx - n.x) * k;
          const ny = n.y + (ty - n.y) * k;
          n.vx = (nx - n.x) / Math.max(dt, 1e-3);
          n.vy = (ny - n.y) / Math.max(dt, 1e-3);
          n.x = nx;
          n.y = ny;
        } else {
          const dx = tx - n.x;
          const dy = ty - n.y;
          const d = Math.hypot(dx, dy) || 1;
          // arrive smoothly: fast across the page, easing off as it closes in
          const sp = Math.min(2200, d * 6.2);
          let ax = ((dx / d) * sp - n.vx) * 9;
          let ay = ((dy / d) * sp - n.vy) * 9;
          for (const m of this.nibs) {
            if (m === n || (n.orbiting && m.orbiting)) continue; // the rings keep their own spacing
            const ex = n.x - m.x;
            const ey = n.y - m.y;
            const e = ex * ex + ey * ey;
            if (e < 576 && e > 0.01) {
              const s = Math.sqrt(e);
              const push = 1400 * (1 - s / 24);
              ax += (ex / s) * push;
              ay += (ey / s) * push;
            }
          }
          const am = Math.hypot(ax, ay) || 1;
          const step = Math.min(8200 * dt, am * dt);
          n.vx += (ax / am) * step;
          n.vy += (ay / am) * step;
          n.x += n.vx * dt;
          n.y += n.vy * dt;
        }
        // turn smoothly towards the direction of travel (no snapping or jitter)
        if (Math.hypot(n.vx, n.vy) > 30) {
          let da = Math.atan2(n.vy, n.vx) - n.ang;
          da = ((da + Math.PI) % TAU + TAU) % TAU - Math.PI;
          n.ang += da * (1 - Math.exp(-dt * (stick ? 9 : 14)));
        }
        n.trail.push(n.x, n.y);
        if (n.trail.length > 36) n.trail.splice(0, 2);
      }
    }

    drawSwarm(g, alpha) {
      const fade = this.outro ? 1 - easeInOut(this.outro.t) : 1;
      g.lineCap = "round";
      for (const n of this.nibs) {
        const a = alpha * n.vis * fade;
        if (a < 0.02) continue;
        const T = n.trail;
        const segs = T.length / 2;
        g.strokeStyle = n.color;
        for (let i = 1; i < segs; i++) {
          const f = i / segs;
          g.globalAlpha = a * f * f * 0.7;
          g.lineWidth = (0.6 + 2.6 * f) * n.size;
          g.beginPath();
          g.moveTo(T[i * 2 - 2], T[i * 2 - 1]);
          g.lineTo(T[i * 2], T[i * 2 + 1]);
          g.stroke();
        }
      }
      for (const n of this.nibs) {
        const a = alpha * n.vis * fade;
        if (a < 0.02) continue;
        const s = n.size;
        g.globalAlpha = a;
        g.save();
        g.translate(n.x, n.y);
        g.rotate(n.ang);
        // soft glow, then an arrow head with a crisp light edge and a bright core
        g.shadowColor = n.color;
        g.shadowBlur = 16;
        g.fillStyle = n.color;
        g.beginPath();
        g.moveTo(9 * s, 0);
        g.lineTo(-5 * s, -5 * s);
        g.lineTo(-2.2 * s, 0);
        g.lineTo(-5 * s, 5 * s);
        g.closePath();
        g.fill();
        g.shadowBlur = 0;
        g.lineJoin = "round";
        g.lineWidth = 1.1;
        g.strokeStyle = "rgba(255,255,255,0.85)";
        g.stroke();
        g.fillStyle = "rgba(255,255,255,0.95)";
        g.beginPath();
        g.arc(1.8 * s, 0, 1.5 * s, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      g.globalAlpha = 1;
      g.lineWidth = 1;
      g.lineCap = "butt";
    }

    // ---------------------------------------------------------------- drawing

    draw() {
      const g = this.g;
      const { W, H, dpr } = this;
      const v = this.env.view();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      g.clearRect(0, 0, W, H);
      if (this.outro && this.outro.off) return;

      // intro: a wash of the page's own colour covers it while it's cleared
      if (this.intro < 1) {
        const k = this.intro < 0.45 ? easeOut(this.intro / 0.45) : 1 - easeInOut((this.intro - 0.45) / 0.55);
        g.globalAlpha = k;
        g.fillStyle = this.pageBg;
        g.fillRect(0, 0, W, H);
        g.globalAlpha = 1;
      }

      const rects = new Map();
      const top = this.env.top;
      for (const u of this.active) {
        if (!this.inView(u, v, top, 60)) continue;
        const R = this.liveRect(u);
        if (R) rects.set(u, R);
      }
      for (const u of this.active) {
        const R = rects.get(u);
        if (R) this.mark(g, u, R);
      }
      if (this.sweep) {
        const s = this.sweep;
        const e = s.vTop + (s.vBottom - s.vTop) * easeInOut(s.p);
        const line = this.dark ? "255,255,255" : "40,40,60";
        const gl = g.createLinearGradient(0, e - 34, 0, e + 2);
        gl.addColorStop(0, `rgba(${line},0)`);
        gl.addColorStop(1, `rgba(${line},${this.dark ? 0.16 : 0.08})`);
        g.fillStyle = gl;
        g.fillRect(v.x, e - 34, v.w, 36);
        const hl = g.createLinearGradient(v.x, 0, v.x + v.w, 0);
        for (let i = 0; i < PALETTE.length; i++) hl.addColorStop(i / (PALETTE.length - 1), rgba(PALETTE[i], 0.85));
        g.fillStyle = hl;
        g.fillRect(v.x, e - 1, v.w, 2);
      }
      this.stepSwarm(rects, v);
      const sheetA = this.intro < 1 ? clamp((this.intro - 0.5) / 0.5, 0, 1) : 1;
      this.drawSwarm(g, sheetA);
    }

    roundPath(g, x, y, w, h, r) {
      g.beginPath();
      if (g.roundRect && r && r.some((k) => k > 0.5)) g.roundRect(x, y, w, h, r);
      else g.rect(x, y, w, h);
    }

    // the drafting marks for work in progress, in the colour of the crew doing it
    mark(g, u, R) {
      const { x, y, w, h } = R;
      const col = u.color;
      g.lineWidth = 1.5;
      if (u.kind === "box") {
        const per = 2 * (w + h);
        if (u.phase === 0) {
          const k = easeInOut(clamp(u.p, 0, 1));
          g.fillStyle = rgba(col, 0.06 * k);
          this.roundPath(g, x, y, w, h, u.rad);
          g.fill();
          g.strokeStyle = col;
          g.setLineDash([per * k, per]);
          this.roundPath(g, x + 0.75, y + 0.75, w - 1.5, h - 1.5, u.rad);
          g.stroke();
          g.setLineDash([]);
          if (u.label) this.tag(g, u.label, x, y, col, clamp(k * 2, 0, 1));
          this.sizeBadge(g, x, y, w, h, col, k);
        } else {
          const a = 1 - easeOut(clamp(u.p, 0, 1));
          g.globalAlpha = a;
          g.strokeStyle = col;
          this.roundPath(g, x + 0.75, y + 0.75, w - 1.5, h - 1.5, u.rad);
          g.stroke();
          this.handles(g, x, y, w, h, col);
          if (u.label) this.tag(g, u.label, x, y, col, 1);
          g.globalAlpha = 1;
        }
        return;
      }
      if (u.kind === "text") {
        if (u.phase === 0) return;
        g.globalAlpha = 0.5;
        g.strokeStyle = col;
        g.lineWidth = 1;
        const L0 = u.lines[0];
        const L1 = u.lines[u.lines.length - 1];
        const bx = x + Math.min(...u.lines.map((L) => L.x)) - 4;
        const bw = Math.max(...u.lines.map((L) => L.x + L.w)) - Math.min(...u.lines.map((L) => L.x)) + 8;
        g.strokeRect(Math.round(bx) + 0.5, Math.round(y + L0.y - 3) + 0.5, Math.round(bw), Math.round(L1.y + L1.h - L0.y + 6));
        g.globalAlpha = 1;
        const c = this.caretAt(u, u.typed);
        const blink = u.typed >= u.total ? 1 : 1;
        g.globalAlpha = blink;
        g.fillStyle = col;
        g.fillRect(Math.round(x + c.x + 1), y + c.y + 1, Math.max(2, Math.min(3, u.fs / 16)), c.h - 2);
        g.globalAlpha = 1;
        return;
      }
      if (u.kind === "glyph") {
        const k = easeOut(clamp(u.p, 0, 1));
        g.globalAlpha = 1 - k * 0.7;
        g.strokeStyle = col;
        g.beginPath();
        g.arc(x + w / 2, y + h / 2, (Math.hypot(w, h) / 2 + 3) * (0.6 + 0.4 * k), 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
        return;
      }
      // media and form controls: an outlined placeholder, then a scan line
      const per = 2 * (w + h);
      const k0 = u.phase === 0 ? easeInOut(clamp(u.p, 0, 1)) : 1;
      const cut = u.phase === 1 ? easeInOut(clamp(u.p, 0, 1)) : 0;
      g.save();
      g.beginPath();
      if (u.kind === "control") g.rect(x + w * cut, y, w * (1 - cut), h);
      else g.rect(x, y + h * cut, w, h * (1 - cut));
      g.clip();
      g.fillStyle = this.dark ? `rgba(255,255,255,${0.07 * k0})` : `rgba(20,24,40,${0.06 * k0})`;
      this.roundPath(g, x, y, w, h, u.rad);
      g.fill();
      if (u.kind === "media" && w > 28 && h > 28) {
        g.globalAlpha = 0.45 * k0;
        g.strokeStyle = col;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + w, y + h);
        g.moveTo(x + w, y);
        g.lineTo(x, y + h);
        g.stroke();
        g.globalAlpha = 1;
      }
      g.restore();
      g.lineWidth = 1.5;
      g.strokeStyle = col;
      g.setLineDash(u.phase === 0 ? [per * k0, per] : []);
      g.globalAlpha = u.phase === 1 ? 1 - cut * 0.6 : 1;
      this.roundPath(g, x + 0.75, y + 0.75, w - 1.5, h - 1.5, u.rad);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
      if (u.label) this.tag(g, u.label, x, y, col, k0);
      if (u.phase === 0) this.sizeBadge(g, x, y, w, h, col, k0);
      if (u.phase === 1) {
        g.shadowColor = col;
        g.shadowBlur = 14;
        g.fillStyle = col;
        if (u.kind === "control") g.fillRect(x + w * cut - 1, y, 2.5, h);
        else g.fillRect(x, y + h * cut - 1.25, w, 2.5);
        g.shadowBlur = 0;
      }
    }

    // a name tag above an element: "Card  412 × 280"
    tag(g, text, x, y, col, a) {
      if (a <= 0.01 || y < 4 || y > this.H - 20) return;
      g.font = `650 10.5px ${SANS}`;
      const tw = g.measureText(text).width;
      const px = Math.round(clamp(x, 4, this.W - tw - 18));
      const py = Math.round(y - 21 < 2 ? y + 5 : y - 21);
      g.globalAlpha = a;
      g.fillStyle = col;
      this.roundPath(g, px, py, tw + 12, 17, [4, 4, 4, 4]);
      g.fill();
      g.fillStyle = "#fff";
      g.textBaseline = "middle";
      g.fillText(text, px + 6, py + 9);
      g.globalAlpha = 1;
    }

    // live size readout under the shape while it's being drawn
    sizeBadge(g, x, y, w, h, col, k) {
      if (k <= 0.05 || w < 40) return;
      const text = `${Math.round(w * Math.min(1, k * 1.25))} × ${Math.round(h * Math.min(1, k * 1.25))}`;
      g.font = `650 10.5px ${SANS}`;
      const tw = g.measureText(text).width;
      const bx = Math.round(x + w / 2 - tw / 2 - 6);
      const by = Math.round(y + h + 7 > this.H - 80 ? y + h - 24 : y + h + 7);
      g.globalAlpha = clamp(k * 3, 0, 1);
      g.fillStyle = col;
      this.roundPath(g, bx, by, tw + 12, 17, [4, 4, 4, 4]);
      g.fill();
      g.fillStyle = "#fff";
      g.textBaseline = "middle";
      g.fillText(text, bx + 6, by + 9);
      g.globalAlpha = 1;
    }

    handles(g, x, y, w, h, col) {
      g.fillStyle = "#fff";
      g.strokeStyle = col;
      g.lineWidth = 1.25;
      for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        g.beginPath();
        g.rect(Math.round(hx - 3.5) + 0.5, Math.round(hy - 3.5) + 0.5, 7, 7);
        g.fill();
        g.stroke();
      }
    }

    // ---------------------------------------------------------------- HUD

    updateHud(force) {
      const env = this.env;
      const v = env.view();
      const H = Math.max(1, env.height);
      let shown = 0;
      for (const b of this.bands) shown += Math.min(H, b.bottom) - Math.max(0, b.top);
      const frac = this.outro ? 1 : clamp(shown / H, 0, 1);
      this.$(".ring .fg").setAttribute("stroke-dashoffset", String(75.4 * (1 - frac)));
      const step = v.h * 0.82;
      const screens = Math.max(1, Math.ceil((H - v.h) / step) + 1);
      const screen = clamp(Math.round(env.top / step) + 1, 1, screens);
      const t = this.$(".meta .t");
      const s = this.$(".meta .s");
      if (this.outro) {
        t.textContent = `Built in ${this.secs.toFixed(1)} s`;
        s.textContent = `${this.units.length.toLocaleString()} elements · ${screens} screen${screens > 1 ? "s" : ""} · live again`;
        return;
      }
      if (!force && this.intro < 1) return;
      const crews = new Set(this.nibs.filter((n) => n.unit).map((n) => n.unit)).size;
      const viewDone = !this.sweep && !this.gapIn(env.top, Math.min(H, env.top + v.h));
      if (!viewDone) t.textContent = `Building screen ${screen} of ${screens}`;
      else if (!this.tour) t.textContent = `Screen ${screen} built · scroll or tour`;
      else t.textContent = `On to screen ${Math.min(screens, screen + 1)}`;
      s.textContent = `${this.done.toLocaleString()} / ${this.units.length.toLocaleString()} elements · ${crews} crew${crews === 1 ? "" : "s"} at work`;
    }

    destroy(quick) {
      if (this.dead) return;
      this.dead = true;
      cancelAnimationFrame(this.raf);
      for (const u of this.unbinds || []) u();
      this.stage.restore(); // the page is always fully back
      const host = this.host;
      host.style.setProperty("transition", `opacity ${quick ? 0.15 : 0.3}s ease`, "important");
      host.style.setProperty("opacity", "0", "important");
      setTimeout(() => host.remove(), quick ? 170 : 330);
    }
  }

  // --------------------------------------------------------------------- control

  let app = null;

  function start() {
    if (app || !document.body) return;
    try {
      app = new App();
    } catch (err) {
      console.error("[swarmline]", err);
      if (app) app.destroy(true);
      app = null;
    }
  }

  function stop(quick) {
    if (!app) return;
    const a = app;
    app = null;
    a.destroy(quick);
  }

  function replay() {
    if (app) {
      const env = app.env;
      app.destroy(true);
      app = null;
      env.scrollTo(0);
    }
    setTimeout(start, 200);
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
