/*
 * Swarmline (Swarm Rebuild engine by Dhvanil Patel): page-world helper.
 *
 * Runs in the page's own JavaScript world (chrome.scripting world: "MAIN"), because
 * animation libraries such as GSAP keep their state in page globals that the content
 * script can't see. Defines window.__swarmSettle(phase):
 *
 *   "settle"  - put scroll-reveal and intro animations in their finished state so the
 *               snapshot sees the page as a reader would after scrolling through it, and
 *               describe every endlessly looping animation (marquees, floating badges) on
 *               its element as data-swarm-anim so the rebuild can keep it moving.
 *   "restore" - give scroll-linked (scrub) animations back to their ScrollTrigger and
 *               remove the data-swarm-anim markers.
 *
 * Pinned scroll sequences are left alone: their "finished" state is a different layout.
 */
(() => {
  "use strict";
  if (window.__swarmSettle) return;

  const ATTR = "data-swarm-anim";
  const SAMPLES = 24;
  let undo = [];
  let marked = [];

  // our own overlay lives in a (closed) shadow root under <swarmline-layer>
  function ours(el) {
    let n = el;
    while (n) {
      if (n.localName === "swarmline-layer") return true;
      const r = n.getRootNode && n.getRootNode();
      n = r && r !== document && r.host ? r.host : n.parentElement;
    }
    return false;
  }

  // the whole transform, including the individual translate / rotate / scale properties
  function fullTransform(cs) {
    let s = "";
    if (cs.translate && cs.translate !== "none") s += `translate(${cs.translate.split(" ").slice(0, 2).join(",")}) `;
    if (cs.rotate && cs.rotate !== "none" && /^-?[\d.]+deg$/.test(cs.rotate)) s += `rotate(${cs.rotate}) `;
    if (cs.scale && cs.scale !== "none") s += `scale(${cs.scale.split(" ").slice(0, 2).join(",")}) `;
    if (cs.transform && cs.transform !== "none") s += cs.transform;
    return s.trim() || "none";
  }

  function stateOf(el) {
    const cs = getComputedStyle(el);
    return { m: fullTransform(cs), o: parseFloat(cs.opacity) };
  }

  const linear = (m) => {
    const x = new DOMMatrix(m === "none" ? undefined : m);
    return [x.a, x.b, x.c, x.d].map((v) => Math.round(v * 1e4));
  };

  // Where the element turns around, in viewport px: its untransformed box + transform-origin.
  function originOf(el) {
    const st = el.style;
    const keep = ["transform", "translate", "rotate", "scale"].map((p) => [p, st.getPropertyValue(p), st.getPropertyPriority(p)]);
    for (const [p] of keep) st.setProperty(p, "none", "important"); // beats animations too
    const r = el.getBoundingClientRect();
    const o = getComputedStyle(el).transformOrigin.split(" ").map(parseFloat);
    for (const [p, v, pr] of keep) {
      if (v) st.setProperty(p, v, pr);
      else st.removeProperty(p);
    }
    return { x: r.left + (o[0] || 0), y: r.top + (o[1] || 0), sx: scrollX, sy: scrollY };
  }

  // Sample one cycle of an endless animation by seeking it, then put it back exactly
  // where it was. Everything happens synchronously, so nothing on screen ever moves.
  // seek(ms) shows the animation `ms` wall-clock milliseconds into the sampled cycle;
  // `phase` is where it is right now on that same scale.
  function describe(el, cycle, phase, seek, restore) {
    if (!(cycle > 16) || el.hasAttribute(ATTR)) return false;
    const now = stateOf(el);
    const frames = [];
    try {
      for (let k = 0; k <= SAMPLES; k++) {
        seek((cycle * k) / SAMPLES);
        const s = stateOf(el);
        frames.push({ f: k / SAMPLES, m: s.m, o: s.o });
      }
    } finally {
      restore();
    }
    const moves = frames.some((f) => f.m !== frames[0].m || Math.abs(f.o - frames[0].o) > 0.01);
    if (!moves) return false;
    const l0 = linear(frames[0].m).join();
    const turns = frames.some((f) => linear(f.m).join() !== l0);
    const origin = turns ? originOf(el) : null;
    el.setAttribute(ATTR, JSON.stringify({ cycle, phase, at: performance.now(), now, frames, origin }));
    marked.push(el);
    return true;
  }

  function settleCss(stats) {
    if (!document.getAnimations) return;
    for (const a of document.getAnimations()) {
      const eff = a.effect;
      const el = eff && eff.target;
      if (!el || ours(el)) continue;
      let t;
      try {
        t = eff.getComputedTiming();
      } catch (_) {
        continue;
      }
      if (t.iterations !== Infinity) {
        // a one-off entrance (fade-in, slide-up, transition): jump to the end
        if (a.playState === "running" || (a.playState === "paused" && a.currentTime === 0)) {
          try {
            a.finish();
            stats.css++;
          } catch (_) {}
        }
        continue;
      }
      if (a.playState !== "running" || eff.pseudoElement) continue;
      const tm = eff.getTiming();
      const dur = typeof tm.duration === "number" ? tm.duration : t.duration;
      const t0 = a.currentTime;
      if (t0 == null || !(dur > 0)) continue;
      const r = a.playbackRate || 1;
      const ar = Math.abs(r);
      const cyc = dur * (/alternate/.test(tm.direction || "") ? 2 : 1); // in animation time
      const into = (((t0 - (tm.delay || 0)) % cyc) + cyc) % cyc;
      const phase = (r > 0 ? into : (cyc - into) % cyc) / ar; // wall-clock ms into the cycle
      const base = t0 - phase * r;
      if (describe(el, cyc / ar, phase, (ms) => (a.currentTime = base + ms * r), () => (a.currentTime = t0))) stats.loops++;
    }
  }

  function settleGsap(stats) {
    const g = window.gsap;
    if (!g || !g.globalTimeline) return;
    const ST = window.ScrollTrigger || (g.core && g.core.globals && g.core.globals().ScrollTrigger);
    const owned = new Set();
    if (ST && ST.getAll) {
      for (const st of ST.getAll()) {
        const a = st.animation;
        if (a) owned.add(a);
        if (!a || !st.enabled) continue;
        if (st.pin || (st.vars && st.vars.pin)) {
          stats.pinned++;
          continue;
        }
        try {
          if (st.vars && st.vars.scrub) {
            // scroll-linked: unhook it while we read the page, re-hook it afterwards
            st.disable(false);
            undo.push(() => st.enable(false));
            stats.scrub++;
          }
          a.reversed(false);
          a.progress(1);
          stats.gsap++;
        } catch (_) {}
      }
    }
    let kids = [];
    try {
      kids = g.globalTimeline.getChildren(false, true, true);
    } catch (_) {}
    for (const a of kids) {
      if (owned.has(a) || a.scrollTrigger) continue;
      try {
        if (a.paused()) continue; // parked on purpose (hover effects and the like)
        if (a.repeat() === -1) {
          if (!a.isActive()) continue;
          const targets = a.targets ? a.targets().filter((t) => t instanceof Element) : [];
          if (!targets.length) continue;
          const ts = Math.abs(a.timeScale()) || 1;
          const cyc = (a.duration() + a.repeatDelay()) * (a.yoyo() ? 2 : 1); // seconds of tween time
          if (!(cyc > 0)) continue;
          const tt = a.totalTime();
          const into = ((tt % cyc) + cyc) % cyc;
          const base = tt - into;
          const seek = (ms) => a.totalTime(base + (ms / 1000) * ts, true);
          for (const el of targets) {
            if (ours(el)) continue;
            if (describe(el, (cyc / ts) * 1000, (into / ts) * 1000, seek, () => a.totalTime(tt, true))) stats.loops++;
          }
        } else if (a.progress() < 1) {
          // intro timelines still playing (or waiting on a delay)
          a.progress(1);
          stats.gsap++;
        }
      } catch (_) {}
    }
  }

  // Reveal-on-scroll libraries that keep content hidden until it scrolls into view.
  function settleReveal(stats) {
    for (const el of document.querySelectorAll(".wow")) {
      if (el.style.visibility === "hidden" || getComputedStyle(el).visibility === "hidden") {
        el.style.visibility = "visible";
        el.style.animationName = "none";
        stats.reveal++;
      }
    }
    for (const el of document.querySelectorAll("[data-aos]:not(.aos-animate)")) {
      el.classList.add("aos-animate");
      stats.reveal++;
    }
    for (const el of document.querySelectorAll("[data-sal]:not(.sal-animate)")) {
      el.classList.add("sal-animate");
      stats.reveal++;
    }
  }

  window.__swarmSettle = function (phase) {
    if (phase === "restore") {
      const u = undo;
      undo = [];
      for (const f of u.reverse()) {
        try {
          f();
        } catch (_) {}
      }
      for (const el of marked) el.removeAttribute(ATTR);
      marked = [];
      return { restored: u.length };
    }
    const stats = { gsap: 0, scrub: 0, pinned: 0, css: 0, reveal: 0, loops: 0 };
    try {
      settleReveal(stats);
    } catch (_) {}
    try {
      settleGsap(stats);
    } catch (_) {}
    // after GSAP, so CSS animations its callbacks just started are finished too
    try {
      settleCss(stats);
    } catch (_) {}
    return stats;
  };
})();
