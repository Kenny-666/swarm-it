/*
 * Swarmline: watch a swarm build any website, live, in your browser.
 *
 * One click and the page becomes a blank canvas in its own colours. A swarm of
 * pointers then builds it back in reading order, like designers in a design tool:
 * click and drag each box out (which then fills in for real), click and type every
 * line of text letter by letter, and drag out image frames the picture scans into. Everything that appears is the real
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
  const GHOST = "data-swarmline-ghost"; // the look-alike carried during a duplicate (never scanned)
  const SANS = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const MAX_UNITS = 3000;
  const CHAR_BUDGET = 9000; // exact letter positions per scan; past that they're estimated
  // toolbar placement for this tab only: kept in memory, never stored
  const prefs = { hudHidden: false, hudPos: null };
  const MEASURE = "#F43F5E"; // spacing measurements while a copy is dragged
  const INK = "#2F6BFF"; // the one colour every drawing mark uses: a design tool's selection blue
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
  // minimum-jerk profile: how a hand moves a pointer (eases in and out, no sudden starts)
  const minJerk = (t) => t * t * t * (t * (t * 6 - 15) + 10);

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
        if (SKIP.has(tag) || el === this.host || el.hasAttribute(GHOST)) return;
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
                // block children (a heading inside a wrapper that also has a line of its
                // own text) stay outside the typing clip: they appear on their own schedule
                const keep = [];
                if (mode === "clip") {
                  for (const c of el.children) {
                    if (SKIP.has(c.localName)) continue;
                    const d2 = cs(c).display;
                    if (d2 === "none" || isInlineLevel(d2)) continue;
                    const q = c.getBoundingClientRect();
                    if (q.width >= 1 && q.height >= 1) keep.push({ x: q.left - r.left - 2, y: q.top - r.top - 2, w: q.width + 4, h: q.height + 4 });
                  }
                }
                make(el, "text", r, s, boxUnit || parent, isFixed, {
                  lines: t.lines, flow: t.flow, total: t.total, mode, keep, fs: parseFloat(s.fontSize) || 16,
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
          if (el === this.host || SKIP.has(el.localName) || this.stage.shown(el) || el.closest(`[${GHOST}]`)) continue;
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
.hud button:focus-visible{outline:2px solid #2F6BFF;outline-offset:1px}
.hud button.on{background:#2F6BFF;color:#fff}
.hud button.on:hover{background:#4A7FFF}
.hud button.pri{background:#2F6BFF;color:#fff;font-weight:650}
.hud button[hidden]{display:none}
.hud .x{padding:8px 10px;color:#9CA3B4;background:transparent}
.hud{cursor:grab;touch-action:none}
.hud.dragging{cursor:grabbing;transition:opacity .45s ease}
.hud.placed{bottom:auto;transform:translate(0,14px)}
.hud.placed.on{transform:none}
.hud.on.gone{opacity:0;pointer-events:none;transform:translate(-50%,14px)}
.hud.placed.on.gone{transform:translate(0,14px)}
.hud .ico{display:inline-flex;align-items:center;justify-content:center;padding:6px 8px}
.hud .ico svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,10px);padding:9px 14px;border-radius:12px;background:rgba(16,17,22,.86);color:#F4F5F8;font:500 12px/1.2 ${SANS};box-shadow:0 14px 36px rgba(0,0,0,.28);opacity:0;pointer-events:none;transition:opacity .35s ease,transform .35s ease;white-space:nowrap}
.toast.on{opacity:1;transform:translate(-50%,0)}
.toast kbd{font:650 11px/1 ${SANS};padding:3px 6px;border-radius:6px;background:rgba(255,255,255,.14);margin:0 2px}
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
  <svg class="ring" viewBox="0 0 30 30" aria-hidden="true"><defs><linearGradient id="sw-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7FA6FF"/><stop offset="1" stop-color="#2F6BFF"/></linearGradient></defs><circle class="bg" cx="15" cy="15" r="12"/><circle class="fg" cx="15" cy="15" r="12" transform="rotate(-90 15 15)" stroke-dasharray="75.4" stroke-dashoffset="75.4"/></svg>
  <div class="meta" aria-live="polite"><span class="t">Clearing the canvas…</span><span class="s">&nbsp;</span></div>
  <button data-a="tour" class="${this.tour ? "on" : ""}" aria-pressed="${this.tour}" title="Glide through the page screen by screen (T)">Auto-tour</button>
  <button data-a="speed" title="Build speed" aria-label="Build speed 1×">1×</button>
  <button data-a="finish" title="Show the finished page now (F)">Finish</button>
  <button data-a="replay" class="pri" hidden title="Build the page again">Replay</button>
  <button data-a="hide" class="ico" title="Hide the controls for a clean recording (H) · drag the bar to move it" aria-label="Hide controls"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.5 10.5 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2.5 12 2.5 12s3.5 7 9.5 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg></button>
  <button data-a="close" class="x" title="Exit (Esc)" aria-label="Exit Swarmline">✕</button>
</div>
<div class="toast" role="status"></div>`;
      document.documentElement.appendChild(host);
      this.host = host;
      this.root = root;
      this.cv = root.querySelector("canvas");
      this.g = this.cv.getContext("2d");
      this.hud = root.querySelector(".hud");
      this.$ = (s) => root.querySelector(s);
      this.$('[data-a="speed"]').textContent = this.speed + "×";
      this.toast = root.querySelector(".toast");
      this.resize();
      if (prefs.hudPos) this.placeHud(prefs.hudPos.x, prefs.hudPos.y);
      if (prefs.hudHidden) this.hud.classList.add("gone");
    }

    // ---------------------------------------------------------------- toolbar

    // hide or show the controls (H), e.g. for a clean screen recording
    setHud(show, quiet) {
      prefs.hudHidden = !show;
      this.hud.classList.toggle("gone", !show);
      if (!show && !quiet) this.say("Controls hidden · press <kbd>H</kbd> to bring them back");
    }

    say(html, ms = 2200) {
      const t = this.toast;
      t.innerHTML = html;
      t.classList.add("on");
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => t.classList.remove("on"), ms);
    }

    // put the bar at a spot on screen (kept inside the window)
    placeHud(x, y) {
      const h = this.hud;
      const w = h.offsetWidth || 560;
      const ht = h.offsetHeight || 44;
      const px = clamp(x, 8, Math.max(8, innerWidth - w - 8));
      const py = clamp(y, 8, Math.max(8, innerHeight - ht - 8));
      h.classList.add("placed");
      h.style.left = px + "px";
      h.style.top = py + "px";
      prefs.hudPos = { x: px, y: py };
    }

    resetHud() {
      const h = this.hud;
      h.classList.remove("placed");
      h.style.left = "";
      h.style.top = "";
      prefs.hudPos = null;
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
      on(window, "resize", () => {
        this.resize();
        if (prefs.hudPos) this.placeHud(prefs.hudPos.x, prefs.hudPos.y);
      });
      on(window, "pagehide", () => stop(true));
      on(window, "pointermove", (e) => {
        if (e.pointerType === "touch") return;
        this.mouse = { x: e.clientX, y: e.clientY };
      }, { passive: true, capture: true });
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
        else if ((e.key === "h" || e.key === "H") && !e.ctrlKey && !e.metaKey && !e.altKey) this.setHud(prefs.hudHidden);
      }, true);
      // drag the bar anywhere (double-click puts it back at the bottom)
      let drag = null;
      on(this.hud, "pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest("button")) return;
        const r = this.hud.getBoundingClientRect();
        drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
        this.hud.setPointerCapture(e.pointerId);
        this.hud.classList.add("dragging");
        e.preventDefault();
      });
      on(this.hud, "pointermove", (e) => {
        if (drag && e.pointerId === drag.id) this.placeHud(e.clientX - drag.dx, e.clientY - drag.dy);
      });
      const endDrag = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag = null;
        this.hud.classList.remove("dragging");
      };
      on(this.hud, "pointerup", endDrag);
      on(this.hud, "pointercancel", endDrag);
      on(this.hud, "dblclick", (e) => {
        if (!e.target.closest("button")) this.resetHud();
      });
      on(this.hud, "click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        const a = b.dataset.a;
        if (a === "close") stop();
        else if (a === "hide") this.setHud(false);
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
      const fresh = list.slice();
      for (const u of list) {
        this.units.push(u);
        // already on the page (an earlier sweep put it back): nothing to build
        if (this.stage.shown(u.el)) this.complete(u, true);
        else this.waiting.push(u);
      }
      try {
        this.findRepeats(fresh);
      } catch (err) {
        console.error("[swarmline] repeats", err);
      }
      this.waiting.sort((a, b) => (a.fixed !== b.fixed ? (a.fixed ? -1 : 1) : a.y - b.y || a.id - b.id));
    }

    // ---------------------------------------------------------------- repeats
    // Cards in a grid, rows in a list, items in a menu: build the first one, then
    // duplicate it into the next slot and edit only what differs.
    findRepeats(list) {
      if (!this.groups) {
        this.groups = new Map(); // parent element -> Map(signature -> group)
        this.roleOf = new WeakMap(); // component element -> "master" | job
        this.dupCount = 0;
      }
      const v = this.env.view();
      const top = this.env.top;
      const unitsIn = new Map();
      for (const u of list) {
        if (u.state !== 0 || u.fixed) continue;
        let e = u.el;
        for (let d = 0; e && e !== document.body && d < 9; d++, e = e.parentElement) {
          let a = unitsIn.get(e);
          if (!a) unitsIn.set(e, (a = []));
          a.push(u);
        }
      }
      const depth = (e) => {
        let d = 0;
        for (; e; e = e.parentElement) d++;
        return d;
      };
      const parents = [...new Set([...unitsIn.keys()].map((e) => e.parentElement).filter(Boolean))].sort((a, b) => depth(a) - depth(b));
      const ratio = (a, b) => Math.max(a, b) / Math.max(1, Math.min(a, b));
      const insideCopy = (e) => {
        for (let p = e; p; p = p.parentElement) {
          const r = this.roleOf.get(p);
          if (r && r !== "master") return true;
        }
        return false;
      };
      for (const P of parents) {
        if (P === document.body || P === document.documentElement || insideCopy(P)) continue;
        const buckets = new Map();
        for (const c of P.children) {
          const us = unitsIn.get(c);
          if (!us || us.length < 2 || this.roleOf.has(c)) continue;
          const r = c.getBoundingClientRect();
          if (r.width < 24 || r.height < 16 || r.height > v.h * 0.8 || r.width > v.w * 0.96) continue;
          if (getComputedStyle(c).translate !== "none") continue;
          const counts = {};
          for (const u of us) counts[u.kind] = (counts[u.kind] || 0) + 1;
          const sig = c.localName + "|" + (c.getAttribute("class") || "") + "|" + Object.keys(counts).sort().map((k) => k + counts[k]).join("");
          if (!buckets.has(sig)) buckets.set(sig, []);
          buckets.get(sig).push({ c, r, us });
        }
        let known = this.groups.get(P);
        if (!known) this.groups.set(P, (known = new Map()));
        for (const [sig, found] of buckets) {
          found.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
          let g = known.get(sig);
          let rest = found;
          if (!g) {
            if (found.length < 2) continue;
            const m = found[0];
            g = { master: m.c, masterUnits: m.us, mw: m.r.width, mh: m.r.height, copies: [] };
            known.set(sig, g);
            this.roleOf.set(m.c, "master");
            rest = found.slice(1);
          }
          for (const k of rest) {
            if (ratio(k.r.width, g.mw) > 1.35 || ratio(k.r.height, g.mh) > 1.35) continue;
            if (k.us.some((u) => u.state !== 0)) continue;
            this.makeDup(g, k, v, top);
          }
        }
      }
    }

    makeDup(g, k, v, top) {
      const job = {
        id: -(++this.dupCount), kind: "dup", el: k.c, group: g, parent: null, fixed: false,
        state: 0, phase: 0, p: 0, typed: 0, step: 0, st: 0, done: false,
        y: k.r.top - v.y + top, w: k.r.width, h: k.r.height, top0: k.r.top, left0: k.r.left,
        rad: [0, 0, 0, 0], label: "", lead: null, units: k.us,
      };
      this.roleOf.set(k.c, job);
      // what the copy shares with the original comes along with it; what differs is edited after
      const pathTo = (root, el) => {
        const p = [];
        for (let e = el; e && e !== root; e = e.parentElement) p.unshift([...e.parentElement.children].indexOf(e));
        return p;
      };
      const follow = (root, p) => {
        let e = root;
        for (const i of p) e = e && e.children[i];
        return e || null;
      };
      let same = 0;
      for (const u of k.us) {
        u.inCopy = job;
        const twin = follow(g.master, pathTo(k.c, u.el));
        let alike = !!twin && twin.localName === u.el.localName;
        if (alike && u.kind === "text") alike = twin.textContent.trim() === u.el.textContent.trim();
        else if (alike && u.kind === "media" && u.el.localName === "img") alike = (twin.currentSrc || twin.src) === (u.el.currentSrc || u.el.src);
        else if (alike && u.kind === "media" && u.el.localName === "svg") alike = twin.innerHTML.length === u.el.innerHTML.length;
        u.dupSame = alike;
        if (alike) same++;
      }
      // nothing in common to carry over: the copy simply arrives with its own content
      if (!same) for (const u of k.us) u.dupSame = true;
      g.copies.push(job);
      this.waiting.push(job);
    }

    // the duplicate can start once something to copy from is finished and on screen
    dupSource(job) {
      const g = job.group;
      const ready = [];
      if (g.masterUnits.every((u) => u.state === 2)) ready.push(g.master);
      for (const c of g.copies) if (c.done && c.state === 2 && c.units.every((x) => x.state === 2)) ready.push(c.el);
      if (!ready.length) return undefined; // not yet
      const D = job.el.getBoundingClientRect();
      let best = null;
      let bd = Infinity;
      for (const e of ready) {
        const r = e.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        const d = Math.hypot(r.left - D.left, r.top - D.top);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      return best; // null: nothing visible to copy from
    }

    shiftEl(el, x, y) {
      if (!this.shifted) this.shifted = new Map();
      if (!this.shifted.has(el)) this.shifted.set(el, [el.style.getPropertyValue("translate"), el.style.getPropertyPriority("translate")]);
      el.style.setProperty("translate", `${x.toFixed(1)}px ${y.toFixed(1)}px`, "important");
    }

    unshift(el) {
      const prev = this.shifted && this.shifted.get(el);
      if (!prev) return;
      if (prev[0]) el.style.setProperty("translate", prev[0], prev[1]);
      else el.style.removeProperty("translate");
      this.shifted.delete(el);
    }

    unshiftAll() {
      if (this.shifted) for (const el of [...this.shifted.keys()]) this.unshift(el);
      if (this.ghosts) for (const gh of [...this.ghosts]) this.dropGhost(gh);
    }

    // the duplicate, step by step: select the original, hold Alt, drag the copy out, let go
    stepDup(u, sdt, isReady) {
      const n = u.lead;
      if (u.step === 0) {
        if (!isReady) return;
        u.step = 1;
        u.st = 0;
        this.pulse(n);
        return;
      }
      u.st += sdt;
      if (u.step === 1 && u.st >= 0.24) {
        u.step = 2; // Alt down: the pointer shows it will copy
        u.st = 0;
        if (n) n.alt = true;
      } else if (u.step === 2 && u.st >= 0.14) {
        const S = u.src.getBoundingClientRect();
        const D = u.el.getBoundingClientRect();
        u.sx = S.left;
        u.sy = S.top;
        u.dx = D.left;
        u.dy = D.top;
        u.g0 = n ? [n.x, n.y] : [S.left + 20, S.top + 20];
        u.dist = Math.hypot(D.left - S.left, D.top - S.top);
        // the copy looks exactly like the original while it's carried; the real element
        // takes its place on release and anything that differs is then typed in
        u.ghost = this.makeGhost(u.src, S);
        if (!u.ghost) {
          for (const x of u.units) if (x.dupSame) this.reveal(x);
          this.shiftEl(u.el, u.sx - u.dx, u.sy - u.dy);
        }
        if (n) n.press = 0.18;
        u.step = 3;
        u.st = 0;
        u.p = 0;
      } else if (u.step === 3) {
        if (!u.dragDur) u.dragDur = (0.3 + Math.sqrt(u.dist) * 0.02) * (0.9 + 0.2 * Math.random());
        u.p = clamp(u.st / u.dragDur, 0, 1);
        if (u.p >= 1) {
          // let go: it lands in its slot
          if (u.ghost) this.dropGhost(u.ghost);
          else this.unshift(u.el);
          u.ghost = null;
          for (const x of u.units) if (x.dupSame) this.complete(x, true);
          u.done = true; // now the differences can be edited in
          if (n) n.alt = false;
          u.step = 4;
          u.st = 0;
        }
      } else if (u.step === 4 && u.st >= 0.32) {
        u.state = 2;
        this.release(u);
      }
    }

    // the copy rides under the pointer (called after the pointers move, so it never lags)
    dragCopy(u) {
      const n = u.lead;
      const e = minJerk(clamp(u.p, 0, 1));
      const px = n && n.unit === u ? n.x : u.g0[0] + (u.dx - u.sx) * e;
      const py = n && n.unit === u ? n.y : u.g0[1] + (u.dy - u.sy) * e;
      if (u.ghost) this.moveGhost(u.ghost, u.sx + (px - u.g0[0]), u.sy + (py - u.g0[1]));
      else this.shiftEl(u.el, u.sx - u.dx + (px - u.g0[0]), u.sy - u.dy + (py - u.g0[1]));
    }

    // a look-alike of an element, as it looks right now, laid over the page
    makeGhost(src, S) {
      try {
        const el = src.cloneNode(true);
        el.setAttribute(GHOST, "");
        el.setAttribute(SHOWN, "");
        el.setAttribute("aria-hidden", "true");
        el.removeAttribute("id");
        for (const k of el.querySelectorAll("[id],[name],[autofocus]")) {
          k.removeAttribute("id");
          k.removeAttribute("name");
          k.removeAttribute("autofocus");
        }
        for (const v of el.querySelectorAll("video,audio")) {
          v.removeAttribute("autoplay");
          v.muted = true;
        }
        const set = (p, val) => el.style.setProperty(p, val, "important");
        set("position", "fixed");
        set("left", "0px");
        set("top", "0px");
        set("margin", "0");
        set("width", S.width + "px");
        set("height", S.height + "px");
        set("box-sizing", "border-box");
        set("translate", "none");
        set("transform", "none");
        set("transition", "none");
        set("animation", "none");
        set("pointer-events", "none");
        set("z-index", "2147483000");
        set("box-shadow", "0 12px 32px rgba(15,23,42,.18)");
        src.parentNode.insertBefore(el, src.nextSibling);
        // a transformed ancestor can move "fixed": measure and correct for it
        const r = el.getBoundingClientRect();
        const gh = { el, ox: -r.left, oy: -r.top };
        this.moveGhost(gh, S.left, S.top);
        (this.ghosts || (this.ghosts = new Set())).add(gh);
        return gh;
      } catch (_) {
        return null;
      }
    }

    moveGhost(gh, x, y) {
      gh.el.style.setProperty("left", (x + gh.ox).toFixed(1) + "px", "important");
      gh.el.style.setProperty("top", (y + gh.oy).toFixed(1) + "px", "important");
    }

    dropGhost(gh) {
      gh.el.remove();
      if (this.ghosts) this.ghosts.delete(gh);
    }

    // show a unit's element(s) as they are (a copy carries them along)
    reveal(x) {
      const st = this.stage;
      st.show(x.el);
      if (x.kind === "text") for (const f of x.flow) st.show(f);
      else if (x.kind === "media" || x.kind === "control") for (const k of x.el.querySelectorAll("*")) st.show(k);
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
      this.idleT = this.active.length ? 0 : (this.idleT || 0) + dt;
      if (resting && this.waiting.length) {
        const keep = [];
        for (const u of this.waiting) {
          if (u.state !== 0) continue;
          if (u.kind !== "dup" && st.shown(u.el)) {
            this.complete(u, true);
            continue;
          }
          let go = busy < slots && (u.fixed || u.y <= this.frontier) && this.parentReady(u) && (!u.inCopy || u.inCopy.done);
          // one copy at a time per group: each is duplicated from the nearest finished one
          if (go && u.kind === "dup" && u.group.copies.some((c) => c !== u && c.state === 1)) go = false;
          if (go && u.kind === "dup") {
            const src = this.dupSource(u);
            // the original can't finish yet (part of it is still off screen) and nothing else
            // is happening: don't wait for it, build this copy by hand
            const stuck = src === undefined && this.idleT > 0.4;
            if (src === undefined && !stuck) go = false;
            else if (stuck || src === null || !this.inView(u, v, top, 0)) {
              // nothing on screen to copy from: build this one by hand instead
              u.done = true;
              u.state = 2;
              for (const x of u.units) x.dupSame = false;
              continue;
            } else u.src = src;
          }
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
      const ready = (u) => !u.lead || (u.lead.attached && u.lead.near) || (u.waitT = (u.waitT || 0) + sdt) > 1.8;
      for (const u of this.active) {
        if (u.state !== 1) continue;
        if (u.kind === "dup") {
          this.stepDup(u, sdt, ready(u));
          continue;
        }
        if (u.kind === "box") {
          if (u.phase === 0) {
            if (this.gesture(u, sdt, ready(u), true)) {
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
            // click where the text goes, then type
            if (this.gesture(u, sdt, ready(u), false)) {
              u.phase = 1;
              st.show(u.el);
              for (const f of u.flow) st.show(f);
              if (u.mode === "fade") this.colorIn(u);
              else st.clip(u.el, this.typedPath(u, 0));
            }
          } else {
            // typing: a natural, slightly uneven rhythm; long paragraphs speed up
            const rate = Math.max(34, u.total / 2) * (0.75 + Math.random() * 0.6);
            // like a carriage return: typing waits while the text cursor hops to the next line
            const L = u.lead;
            const hop = L && L.attached && L.move && L.move.hop && L.move.t < 0.85;
            if (!hop) u.typed = Math.min(u.total, u.typed + rate * sdt);
            if (u.mode !== "fade") st.clip(u.el, this.typedPath(u, Math.floor(u.typed)));
            if (u.typed >= u.total) this.complete(u);
          }
        } else if (u.kind === "media" || u.kind === "control") {
          if (u.phase === 0) {
            if (this.gesture(u, sdt, ready(u), true)) {
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
        } else if (u.phase === 0) {
          // icons: a click, and it's there
          if (this.gesture(u, sdt, ready(u), false)) {
            u.phase = 1;
            u.p = 0;
            st.fadeIn(u.el, 220 / this.speed);
          }
        } else {
          u.p += sdt / 0.25;
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

    // a hand-made gesture: reach the corner, press, drag to the far corner, let go.
    // (text and icons are a press only.) Returns true once it has been let go.
    gesture(u, sdt, isReady, drag) {
      if (u.step == null) {
        u.step = 0;
        u.st = 0;
      }
      if (u.step === 0) {
        if (!isReady) return false;
        u.step = 1;
        u.st = 0;
        u.p = 0;
        this.pulse(u.lead);
        return false;
      }
      u.st += sdt;
      if (u.step === 1) {
        if (u.st >= 0.1) {
          u.step = drag ? 2 : 3;
          u.st = 0;
        }
        return false;
      }
      if (u.step === 2) {
        const dur = 0.26 + 0.13 * Math.log2(1 + Math.hypot(u.w, u.h) / 90);
        u.p = clamp(u.st / dur, 0, 1);
        if (u.p >= 1) {
          u.step = 3;
          u.st = 0;
        }
        return false;
      }
      return u.st >= (drag ? 0.16 : 0.02); // hold the selection a beat before letting go
    }

    // a click: the pointer dips and a ring spreads from its tip
    pulse(n) {
      if (!n) return;
      n.press = 0.18;
      (this.pulses || (this.pulses = [])).push({ x: n.x, y: n.y, t: 0 });
    }

    // the clip that shows a text element's first n letters (element-local px)
    typedPath(u, n) {
      let d = "";
      let left = n;
      for (let i = 0; i < u.lines.length; i++) {
        const L = u.lines[i];
        if (left <= 0) break;
        const k = Math.min(left, L.edges.length);
        left -= k;
        const x0 = Math.min(L.x, 0) - 4;
        const right = k >= L.edges.length ? L.x + L.w + 6 : L.edges[k - 1] + 0.5;
        const y0 = L.y - 3;
        let h = L.h + 6;
        // tight line-height: stop halfway into the next line, so its letters don't peek through
        const N = u.lines[i + 1];
        if (N && N.y < L.y + L.h && N.x < L.x + L.w && N.x + N.w > L.x) h = Math.min(h, (L.y + L.h + N.y) / 2 - y0);
        d += `M${(x0).toFixed(1)} ${y0.toFixed(1)}H${right.toFixed(1)}V${(y0 + h).toFixed(1)}H${x0.toFixed(1)}Z`;
      }
      for (const k of u.keep || []) d += `M${k.x.toFixed(1)} ${k.y.toFixed(1)}H${(k.x + k.w).toFixed(1)}V${(k.y + k.h).toFixed(1)}H${k.x.toFixed(1)}Z`;
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
      this.cv.classList.add("off"); // the page is live: clicks go straight through
      this.unshiftAll();
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
      const n = reduced() ? 8 : 20;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.nibs.push({
          i, unit: null, role: 0, attached: false, vis: 0, color: PALETTE[i % PALETTE.length], press: 0,
          x: this.W / 2 + Math.cos(a) * 6, y: this.H / 2 + Math.sin(a) * 6,
          vx: 0, vy: 0, ang: 0, tool: 0, goal: null, move: null, hand: i % 2 ? 1 : -1,
          seed: Math.random() * Math.PI * 2, born: 0.55 + i * 0.02, size: 1,
          flying: false, pvx: 0, pvy: 0,
          // a personality for free flight: its own distance, swirl, personal space and wander
          orbR: 0.32 + Math.random() * 0.68, spin: (0.5 + Math.random() * 0.9) * (Math.random() < 0.8 ? 1 : -1),
          space: 20 + Math.random() * 26, wa: Math.random() * TAU, breath: 0.35 + Math.random() * 0.8, lead: 0.35 + Math.random() * 0.35,
        });
      }
    }

    // where the free swarm circles: over the next thing to build, so it's always
    // heading for the next section instead of waiting in the middle
    nextSpot(rects, v) {
      const top = this.env.top;
      for (const u of this.waiting) {
        if (u.state !== 0 || u.fixed || u.kind === "dup" || u.inCopy) continue; // keep clear of copies about to be dragged in
        const y = u.y - top + v.y;
        if (y > v.y + v.h) break; // sorted by y: nothing further is on screen
        if (y + u.h < v.y) continue;
        return [u.left0 + Math.min(u.w, 520) / 2, y + Math.min(u.h, 220) / 2];
      }
      // nothing new to hover over: wait in the open, out of the way of the work in progress
      const busy = [];
      for (const [u, R] of rects) {
        if (u.state !== 1) continue;
        busy.push([R.x + R.w / 2, R.y + R.h / 2]);
        if (u.kind === "dup" && u.src) {
          const S = u.src.getBoundingClientRect();
          busy.push([S.left + S.width / 2, S.top + S.height / 2]);
        }
      }
      if (!busy.length) return [v.x + v.w / 2, v.y + v.h * (this.tour ? 0.6 : 0.46)];
      let best = null;
      let bd = -1;
      for (const fx of [0.22, 0.5, 0.78]) {
        for (const fy of [0.3, 0.62]) {
          const p = [v.x + v.w * fx, v.y + v.h * fy];
          let d = Infinity;
          for (const b of busy) d = Math.min(d, Math.hypot(b[0] - p[0], b[1] - p[1]));
          // a little loyalty to where it already is, so it doesn't hop about
          if (this.anchor) d += 60 - Math.min(60, Math.hypot(this.anchor[0] - p[0], this.anchor[1] - p[1]) / 6);
          if (d > bd) {
            bd = d;
            best = p;
          }
        }
      }
      return best;
    }

    // free flight: a loose swarm around a centre, with real momentum. Each pointer keeps
    // its own preferred distance, swirl speed and personal space, the cloud is an ellipse
    // that slowly tilts and breathes, and a little wander keeps every path different.
    fly(n, cx, cy, dt, after) {
      if (!n.flying) {
        n.flying = true;
        n.pvx = n.vx;
        n.pvy = n.vy;
      }
      const t = this.time;
      const size = after ? 88 : clamp(56 + this.freeCount * 6, 80, 175);
      const r0 = size * n.orbR * (1 + 0.16 * Math.sin(t * n.breath + n.seed));
      const tilt = 0.35 + 0.5 * Math.sin(t * 0.11 + 1.3);
      const sq = after ? 0.78 : 0.6;
      const ct = Math.cos(tilt);
      const stl = Math.sin(tilt);
      // where it is, in the ellipse's own frame
      const dx = n.x - cx;
      const dy = n.y - cy;
      const ex = dx * ct + dy * stl;
      const ey = (-dx * stl + dy * ct) / sq;
      // aim a little further round its own orbit than it is now: that's the swirl
      const th = Math.atan2(ey, ex) + n.lead * Math.sign(n.spin) * (0.6 + 0.4 * Math.abs(n.spin));
      const px = Math.cos(th) * r0;
      const py = Math.sin(th) * r0 * sq;
      const tx = cx + px * ct - py * stl;
      const ty = cy + px * stl + py * ct;
      // a spring-damper towards that point, plus wander and personal space
      const kS = after ? 8.5 : 4.6;
      const kD = after ? 3.8 : 2.6;
      let ax = (tx - n.x) * kS - n.pvx * kD;
      let ay = (ty - n.y) * kS - n.pvy * kD;
      n.wa += (Math.random() - 0.5) * dt * 5;
      ax += Math.cos(n.wa) * 46;
      ay += Math.sin(n.wa) * 46;
      for (const m of this.nibs) {
        if (m === n) continue;
        const qx = n.x - m.x;
        const qy = n.y - m.y;
        const q2 = qx * qx + qy * qy;
        const sp = Math.max(n.space, m.space);
        if (q2 < sp * sp && q2 > 0.01) {
          const q = Math.sqrt(q2);
          ax += (qx / q) * (sp - q) * 26;
          ay += (qy / q) * (sp - q) * 26;
        }
      }
      const am = Math.hypot(ax, ay);
      const amax = after ? 5200 : 2600;
      if (am > amax) {
        ax *= amax / am;
        ay *= amax / am;
      }
      n.pvx += ax * dt;
      n.pvy += ay * dt;
      const vm = Math.hypot(n.pvx, n.pvy);
      const vmax = after ? 2100 : 1050;
      if (vm > vmax) {
        n.pvx *= vmax / vm;
        n.pvy *= vmax / vm;
      }
      n.x += n.pvx * dt;
      n.y += n.pvy * dt;
    }

    crew(u) {
      const want = 1;
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
        n.alt = false;
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
      if (u.kind === "dup") {
        if (u.step >= 3 && u.g0) {
          const e = u.step === 3 ? minJerk(clamp(u.p, 0, 1)) : 1;
          return [u.g0[0] + (u.dx - u.sx) * e, u.g0[1] + (u.dy - u.sy) * e];
        }
        // grab the original near its top-left, like picking up a card
        const S = u.src.getBoundingClientRect();
        return [S.left + Math.min(S.width * 0.4, 64), S.top + Math.min(S.height * 0.35, 26)];
      }
      // hands stay on screen even when an element runs past the edges
      const x0 = clamp(R.x, 4, this.W - 4);
      const y0 = clamp(R.y, 4, this.H - 4);
      const x1 = clamp(R.x + R.w, 4, this.W - 4);
      const y1 = clamp(R.y + R.h, 4, this.H - 4);
      if (u.kind === "box" || ((u.kind === "media" || u.kind === "control") && u.phase === 0)) {
        if (!u.step || u.step === 1) return [x0, y0]; // reach the top-left corner, press
        if (u.step === 2) {
          const e = minJerk(u.p); // drag to the far corner
          return [x0 + (x1 - x0) * e, y0 + (y1 - y0) * e];
        }
        return [x1, y1]; // let go
      }
      if (u.kind === "text") {
        // glide between letters rather than stepping (same line only)
        let c = this.caretAt(u, u.typed);
        const c2 = this.caretAt(u, Math.min(u.total, Math.floor(u.typed) + 1));
        if (c2.y === c.y) c = { x: c.x + (c2.x - c.x) * (u.typed % 1), y: c.y, h: c.h };
        n.beamH = c.h; // the text cursor matches the size of the line being typed
        if (u.phase === 0) return [R.x + c.x + 2, R.y + c.y + c.h * 0.5]; // click at the start
        return [R.x + c.x + Math.max(6, c.h * 0.14), R.y + c.y + c.h * 0.5 + Math.min(4, c.h * 0.08)];
      }
      if (u.kind === "glyph") return [R.x + R.w / 2, R.y + R.h / 2];
      const c = easeInOut(clamp(u.p, 0, 1));
      if (u.kind === "control") return [R.x + R.w * c, R.y + R.h * 0.55];
      return [R.x + R.w * 0.62, R.y + R.h * c]; // media: rides the line that brings the image in
    }

    // the corner of a shape being dragged out: wherever the pointer actually is
    dragCorner(u, R) {
      if (u.step === 3 || u.phase === 1) return [R.x + R.w, R.y + R.h];
      const e = minJerk(clamp(u.p, 0, 1));
      let fx = e;
      let fy = e;
      const n = u.lead;
      if (n && n.unit === u && n.attached) {
        const x0 = clamp(R.x, 4, this.W - 4);
        const y0 = clamp(R.y, 4, this.H - 4);
        const x1 = clamp(R.x + R.w, 4, this.W - 4);
        const y1 = clamp(R.y + R.h, 4, this.H - 4);
        fx = x1 - x0 > 1 ? clamp((n.x - x0) / (x1 - x0), 0, 1) : e;
        fy = y1 - y0 > 1 ? clamp((n.y - y0) / (y1 - y0), 0, 1) : e;
      }
      return [R.x + R.w * fx, R.y + R.h * fy];
    }

    // where a nib is headed this frame and why; a new "why" starts a new move
    goalOf(n, rects) {
      const R = n.unit && rects.get(n.unit);
      if (R) return { key: n.unit, p: this.workPoint(n, n.unit, R), work: true };
      return { key: "free", free: true, work: false };
    }

    stepSwarm(rects) {
      const dt = this.dt;
      const W = this.W;
      const H = this.H;
      const want = this.nextSpot(rects, this.env.view());
      if (!this.anchor) this.anchor = [W / 2, H * 0.45];
      const ak = 1 - Math.exp(-dt * 1.6);
      this.anchor[0] += (want[0] - this.anchor[0]) * ak;
      this.anchor[1] += (want[1] - this.anchor[1]) * ak;
      this.freeCount = this.nibs.filter((n) => !n.unit || !rects.get(n.unit)).length;
      const cx = clamp(this.anchor[0], 150, Math.max(150, W - 150));
      const cy = clamp(this.anchor[1], 130, Math.max(130, H - 170));
      // after the build the swarm keeps you company: it trails just behind your own pointer
      const M0 = this.mouse;
      const fx = M0 ? M0.x + 34 : W / 2;
      const fy = M0 ? M0.y + 30 : H / 2;
      const pace = 0.75 + 0.25 * this.speed;
      for (const n of this.nibs) {
        n.vis = this.time < n.born ? 0 : Math.min(1, n.vis + dt / 0.4);
        const ox = n.x;
        const oy = n.y;
        let working = false;
        if (this.outro) {
          n.goal = "free";
          this.fly(n, fx, fy, dt, true);
        } else {
          const G = this.goalOf(n, rects);
          working = G.work;
          if (G.free) {
            n.goal = "free";
            this.fly(n, cx, cy, dt, false);
          } else {
          n.flying = false;
          if (G.key !== n.goal) {
            // plan a new move: a gentle arc, longer for longer trips (like a hand)
            n.goal = G.key;
            const dx = G.p[0] - n.x;
            const dy = G.p[1] - n.y;
            const d = Math.hypot(dx, dy);
            const bend = d * (0.08 + Math.random() * 0.14) * (Math.random() < 0.8 ? n.hand : -n.hand);
            n.move = d < 4 ? null : {
              sx: n.x, sy: n.y, t: 0,
              dur: ((0.32 + 0.15 * Math.log2(1 + d / 50)) * (0.9 + Math.random() * 0.25)) / pace,
              bx: (-dy / (d || 1)) * bend, by: (dx / (d || 1)) * bend,
            };
            n.attached = false;
          } else if (working && n.last && Math.hypot(G.p[0] - n.last[0], G.p[1] - n.last[1]) > 40) {
            // the work point leapt (a new line, the next edge): hop there in a quick, eased move
            const d = Math.hypot(G.p[0] - n.x, G.p[1] - n.y);
            n.move = { sx: n.x, sy: n.y, t: 0, hop: true, dur: (0.16 + 0.05 * Math.log2(1 + d / 50)) / pace, bx: 0, by: -Math.min(24, d * 0.12) };
          }
          n.last = G.p;
          let px = G.p[0];
          let py = G.p[1];
          const M = n.move;
          if (M && M.t < 1) {
            M.t = Math.min(1, M.t + dt / M.dur);
            const e = minJerk(M.t);
            const cx = (M.sx + px) / 2 + M.bx;
            const cy = (M.sy + py) / 2 + M.by;
            const i = 1 - e;
            px = i * i * M.sx + 2 * i * e * cx + e * e * px;
            py = i * i * M.sy + 2 * i * e * cy + e * e * py;
          }
          if (working && !n.attached && (!M || M.t >= 0.9)) n.attached = true;
          n.near = working && Math.hypot(G.p[0] - n.x, G.p[1] - n.y) < 6; // really there (a click lands under the tip)
          // follow the plan through a soft spring, so even jumps in the plan come out smooth
          // (on the job it holds tight, so it stays right on the caret or the line it traces)
          const k = 1 - Math.exp(-dt * (working && n.attached ? 34 : 10));
          n.x += (px - n.x) * k;
          n.y += (py - n.y) * k;
          if (!working) {
            // keep a little personal space while travelling
            for (const m of this.nibs) {
              if (m === n || m.flying) continue;
              const ex = n.x - m.x;
              const ey = n.y - m.y;
              const q2 = ex * ex + ey * ey;
              if (q2 < 484 && q2 > 0.01) {
                const q = Math.sqrt(q2);
                n.x += (ex / q) * (22 - q) * Math.min(1, dt * 3);
                n.y += (ey / q) * (22 - q) * Math.min(1, dt * 3);
              }
            }
          }
          }
        }
        // velocity (smoothed) drives a gentle lean into the direction of travel
        const iv = 1 / Math.max(dt, 1e-3);
        const vk = 1 - Math.exp(-dt * 8);
        n.vx += ((n.x - ox) * iv - n.vx) * vk;
        n.vy += ((n.y - oy) * iv - n.vy) * vk;
        // a pointer keeps its shape; it only tilts a touch into a sideways move
        n.ang += (clamp(n.vx / 2400, -0.26, 0.26) - n.ang) * (1 - Math.exp(-dt * 6));
        if (n.press > 0) n.press = Math.max(0, n.press - dt);
        // the lead of a line being typed becomes a text cursor
        const typing = working && n.attached && n.unit.kind === "text" && n.unit.phase === 1;
        n.tool += ((typing ? 1 : 0) - n.tool) * (1 - Math.exp(-dt * 9));
      }
    }

    drawSwarm(g, alpha) {
      // (with reduced motion the swarm leaves once the page is built; otherwise it stays with you)
      const fade = this.outro && reduced() ? 1 - easeInOut(this.outro.t) : 1;
      // a classic pointer, its tip (the hotspot) at 0,0
      const P = this.ptr || (this.ptr = new Path2D("M0 0 L0 17.6 L4.5 13.6 L7.4 20.2 L10.8 18.7 L7.9 12.3 L13.8 12.2 Z"));
      for (const n of this.nibs) {
        const a = alpha * n.vis * fade;
        if (a < 0.02) continue;
        if (n.tool > 0.02) this.drawIBeam(g, n, a * n.tool);
        if (n.tool > 0.98) continue;
        const dip = n.press > 0 ? 1 - 0.14 * Math.sin((1 - n.press / 0.18) * Math.PI) : 1;
        const k = 1.18 * dip * (1 - 0.4 * n.tool);
        g.save();
        g.globalAlpha = a * (1 - n.tool);
        g.translate(n.x, n.y);
        g.rotate(n.ang);
        g.scale(k, k);
        g.shadowColor = "rgba(15,23,42,0.3)";
        g.shadowBlur = 5;
        g.shadowOffsetY = 1.5;
        g.fillStyle = n.color;
        g.fill(P);
        g.shadowColor = "transparent";
        g.lineJoin = "round";
        g.lineWidth = 1.5 / k;
        g.strokeStyle = "#fff";
        g.stroke(P);
        if (n.alt) {
          g.beginPath();
          g.arc(15.5, 19.5, 5, 0, TAU);
          g.fillStyle = n.color;
          g.fill();
          g.stroke();
          g.beginPath();
          g.moveTo(13, 19.5);
          g.lineTo(18, 19.5);
          g.moveTo(15.5, 17);
          g.lineTo(15.5, 22);
          g.lineWidth = 1.6 / k;
          g.stroke();
        }
        g.restore();
      }
      g.globalAlpha = 1;
    }

    // a text cursor (I-beam) in the nib's colour, with a light edge so it reads on any page
    drawIBeam(g, n, a) {
      const s = n.size;
      const h = clamp((n.beamH || 20) * 0.46, 8, 30) * (0.7 + 0.3 * n.tool);
      const w = clamp(h * 0.36, 3, 7) * Math.min(1.2, s);
      g.save();
      g.globalAlpha = a;
      g.translate(n.x, n.y);
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      g.moveTo(-w, -h);
      g.quadraticCurveTo(0, -h + 1.5, 0, -h + 3);
      g.quadraticCurveTo(0, -h + 1.5, w, -h);
      g.moveTo(0, -h + 3);
      g.lineTo(0, h - 3);
      g.moveTo(-w, h);
      g.quadraticCurveTo(0, h - 1.5, 0, h - 3);
      g.quadraticCurveTo(0, h - 1.5, w, h);
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.lineWidth = 4.4;
      g.stroke();
      g.strokeStyle = n.color;
      g.lineWidth = 2.2;
      g.stroke();
      g.restore();
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
      if (this.outro && this.outro.off) {
        if (reduced()) return;
        this.stepSwarm(new Map());
        this.drawSwarm(g, 1);
        return;
      }

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
      this.stepSwarm(rects); // pointers first, so a shape being dragged sits exactly under its pointer
      for (const u of this.active) if (u.kind === "dup" && u.step === 3 && u.state === 1) this.dragCopy(u);
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
        hl.addColorStop(0, rgba(INK, 0));
        hl.addColorStop(0.5, rgba(INK, 0.75));
        hl.addColorStop(1, rgba(INK, 0));
        g.fillStyle = hl;
        g.fillRect(v.x, e - 1, v.w, 2);
      }
      if (this.pulses && this.pulses.length) {
        g.strokeStyle = INK;
        g.lineWidth = 1.5;
        for (const p of this.pulses) {
          p.t += this.dt;
          const k = p.t / 0.36;
          g.globalAlpha = 0.55 * (1 - k);
          g.beginPath();
          g.arc(p.x, p.y, 3 + 13 * easeOut(Math.min(1, k)), 0, TAU);
          g.stroke();
        }
        g.globalAlpha = 1;
        this.pulses = this.pulses.filter((p) => p.t < 0.36);
      }
      const sheetA = this.intro < 1 ? clamp((this.intro - 0.5) / 0.5, 0, 1) : 1;
      this.drawSwarm(g, sheetA);
    }

    roundPath(g, x, y, w, h, r) {
      g.beginPath();
      if (g.roundRect && r && r.some((k) => k > 0.5)) g.roundRect(x, y, w, h, r);
      else g.rect(x, y, w, h);
    }

    // the marks a designer would see: the shape being dragged out, its size, its
    // selection handles, the text frame and caret. All in one selection blue.
    mark(g, u, R) {
      const { x, y, w, h } = R;
      g.lineWidth = 1.5;
      g.strokeStyle = INK;
      if (u.kind === "dup") {
        if (!u.src || !u.step) return;
        const S = u.src.getBoundingClientRect();
        const q = (u.step === 3 && u.ghost ? u.ghost.el : u.el).getBoundingClientRect(); // fresh: the copy moved this frame
        const C = { x: q.left, y: q.top, w: q.width, h: q.height };
        if (u.step <= 2) {
          // the original, selected
          g.strokeRect(Math.round(S.left) + 0.5, Math.round(S.top) + 0.5, Math.round(S.width), Math.round(S.height));
          this.handles(g, S.left, S.top, S.width, S.height);
          this.sizeBadge(g, S.left, S.top, S.width, S.height, 1);
          return;
        }
        if (u.step === 3) {
          g.globalAlpha = 0.6;
          g.setLineDash([4, 3]);
          g.strokeRect(Math.round(S.left) + 0.5, Math.round(S.top) + 0.5, Math.round(S.width), Math.round(S.height));
          g.setLineDash([]);
          g.globalAlpha = 1;
          g.strokeRect(Math.round(C.x) + 0.5, Math.round(C.y) + 0.5, Math.round(C.w), Math.round(C.h));
          this.measure(g, { x: S.left, y: S.top, w: S.width, h: S.height }, C);
          return;
        }
        g.strokeRect(Math.round(C.x) + 0.5, Math.round(C.y) + 0.5, Math.round(C.w), Math.round(C.h));
        this.handles(g, C.x, C.y, C.w, C.h);
        this.sizeBadge(g, C.x, C.y, C.w, C.h, 1);
        return;
      }
      if (u.kind === "box" || u.kind === "media" || u.kind === "control") {
        if (u.phase === 0) {
          if (!u.step || u.step === 1) return;
          const [cx, cy] = this.dragCorner(u, R);
          const dw = Math.max(1, cx - x);
          const dh = Math.max(1, cy - y);
          const held = u.step === 3;
          g.fillStyle = rgba(INK, u.kind === "box" ? 0.05 : 0.08);
          if (held) this.roundPath(g, x, y, w, h, u.rad);
          else {
            g.beginPath();
            g.rect(x, y, dw, dh);
          }
          g.fill();
          if (held) this.roundPath(g, x + 0.75, y + 0.75, w - 1.5, h - 1.5, u.rad);
          else {
            g.beginPath();
            g.rect(x + 0.75, y + 0.75, dw - 1.5, dh - 1.5);
          }
          g.stroke();
          if (u.kind === "media" && held && w > 28 && h > 28) this.cross(g, x, y, w, h, 0.35);
          this.sizeBadge(g, x, y, dw, dh, 1);
          if (held) {
            this.handles(g, x, y, w, h);
            if (u.label) this.tag(g, u.label, x, y, 1);
          }
          return;
        }
        if (u.kind === "box") {
          // let go: the selection lingers while the real box fills in
          const a = 1 - easeOut(clamp(u.p, 0, 1));
          g.globalAlpha = a;
          this.roundPath(g, x + 0.75, y + 0.75, w - 1.5, h - 1.5, u.rad);
          g.stroke();
          this.handles(g, x, y, w, h);
          if (u.label) this.tag(g, u.label, x, y, a);
          g.globalAlpha = 1;
          return;
        }
        // media and form controls come in behind a line the pointer rides
        const k = easeInOut(clamp(u.p, 0, 1));
        g.save();
        g.beginPath();
        if (u.kind === "control") g.rect(x + w * k, y, w * (1 - k), h);
        else g.rect(x, y + h * k, w, h * (1 - k));
        g.clip();
        g.fillStyle = rgba(INK, 0.08);
        this.roundPath(g, x, y, w, h, u.rad);
        g.fill();
        if (u.kind === "media" && w > 28 && h > 28) this.cross(g, x, y, w, h, 0.35);
        g.restore();
        g.globalAlpha = 1 - k * 0.7;
        this.roundPath(g, x + 0.75, y + 0.75, w - 1.5, h - 1.5, u.rad);
        g.stroke();
        g.globalAlpha = 1;
        g.fillStyle = INK;
        if (u.kind === "control") g.fillRect(x + w * k - 1, y, 2, h);
        else g.fillRect(x, y + h * k - 1, w, 2);
        return;
      }
      if (u.kind === "text") {
        if (u.phase === 0) return;
        const L0 = u.lines[0];
        const L1 = u.lines[u.lines.length - 1];
        const lx = Math.min(...u.lines.map((L) => L.x));
        const bx = x + lx - 4;
        const bw = Math.max(...u.lines.map((L) => L.x + L.w)) - lx + 8;
        g.globalAlpha = 0.55;
        g.lineWidth = 1;
        g.strokeRect(Math.round(bx) + 0.5, Math.round(y + L0.y - 3) + 0.5, Math.round(bw), Math.round(L1.y + L1.h - L0.y + 6));
        g.globalAlpha = 1;
        const c = this.caretAt(u, u.typed);
        g.fillStyle = INK;
        g.fillRect(Math.round(x + c.x + 1), y + c.y + 1, Math.max(2, Math.min(3, u.fs / 16)), c.h - 2);
        return;
      }
      if (u.kind === "glyph") {
        if (u.phase === 0) return;
        const k = easeOut(clamp(u.p, 0, 1));
        g.globalAlpha = 1 - k;
        g.beginPath();
        g.rect(x - 2.5, y - 2.5, w + 5, h + 5);
        g.stroke();
        g.globalAlpha = 1;
      }
    }

    // the gap between two shapes, the way a design tool shows it while you drag
    measure(g, a, b) {
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      let p0;
      let p1;
      if (oy > 4) {
        const yy = Math.max(a.y, b.y) + oy / 2;
        const [l, r] = a.x < b.x ? [a, b] : [b, a];
        if (r.x - (l.x + l.w) < 2) return;
        p0 = [l.x + l.w, yy];
        p1 = [r.x, yy];
      } else if (ox > 4) {
        const xx = Math.max(a.x, b.x) + ox / 2;
        const [t, d] = a.y < b.y ? [a, b] : [b, a];
        if (d.y - (t.y + t.h) < 2) return;
        p0 = [xx, t.y + t.h];
        p1 = [xx, d.y];
      } else return;
      const gap = Math.round(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
      g.save();
      g.strokeStyle = MEASURE;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(p0[0], p0[1]);
      g.lineTo(p1[0], p1[1]);
      const vert = p0[0] === p1[0];
      for (const p of [p0, p1]) {
        if (vert) {
          g.moveTo(p[0] - 4, p[1]);
          g.lineTo(p[0] + 4, p[1]);
        } else {
          g.moveTo(p[0], p[1] - 4);
          g.lineTo(p[0], p[1] + 4);
        }
      }
      g.stroke();
      const label = String(gap);
      g.font = `600 10.5px ${SANS}`;
      const tw = g.measureText(label).width;
      const mx = (p0[0] + p1[0]) / 2;
      const my = (p0[1] + p1[1]) / 2;
      g.fillStyle = MEASURE;
      this.roundPath(g, Math.round(mx - tw / 2 - 5), Math.round(my - 8), tw + 10, 16, [3, 3, 3, 3]);
      g.fill();
      g.fillStyle = "#fff";
      g.textBaseline = "middle";
      g.fillText(label, Math.round(mx - tw / 2), Math.round(my));
      g.restore();
    }

    // an image placeholder's diagonals
    cross(g, x, y, w, h, a) {
      g.save();
      g.globalAlpha = a;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w, y + h);
      g.moveTo(x + w, y);
      g.lineTo(x, y + h);
      g.stroke();
      g.restore();
    }

    // a layer name above the selection: "Card  412 × 280"
    tag(g, text, x, y, a) {
      if (a <= 0.01 || y < 4 || y > this.H - 20) return;
      g.font = `600 10.5px ${SANS}`;
      const tw = g.measureText(text).width;
      const px = Math.round(clamp(x, 4, this.W - tw - 18));
      const py = Math.round(y - 21 < 2 ? y + 5 : y - 21);
      g.globalAlpha = a;
      g.fillStyle = INK;
      this.roundPath(g, px, py, tw + 12, 17, [3, 3, 3, 3]);
      g.fill();
      g.fillStyle = "#fff";
      g.textBaseline = "middle";
      g.fillText(text, px + 6, py + 9);
      g.globalAlpha = 1;
    }

    // live size readout under the shape while it's dragged out
    sizeBadge(g, x, y, w, h, a) {
      if (w < 24 && h < 24) return;
      const text = `${Math.round(w)} × ${Math.round(h)}`;
      g.font = `600 10.5px ${SANS}`;
      const tw = g.measureText(text).width;
      const bx = Math.round(clamp(x + w / 2 - tw / 2 - 6, 4, this.W - tw - 16));
      const by = Math.round(y + h + 8 > this.H - 80 ? y + h - 25 : y + h + 8);
      g.globalAlpha = a;
      g.fillStyle = INK;
      this.roundPath(g, bx, by, tw + 12, 17, [3, 3, 3, 3]);
      g.fill();
      g.fillStyle = "#fff";
      g.textBaseline = "middle";
      g.fillText(text, bx + 6, by + 9);
      g.globalAlpha = 1;
    }

    handles(g, x, y, w, h) {
      g.save();
      g.fillStyle = "#fff";
      g.strokeStyle = INK;
      g.lineWidth = 1.25;
      const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
      if (w > 60 && h > 40) pts.push([x + w / 2, y], [x + w / 2, y + h], [x, y + h / 2], [x + w, y + h / 2]);
      for (const [hx, hy] of pts) {
        g.beginPath();
        g.rect(Math.round(hx - 3.5) + 0.5, Math.round(hy - 3.5) + 0.5, 7, 7);
        g.fill();
        g.stroke();
      }
      g.restore();
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
      this.unshiftAll();
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
