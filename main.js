/* Progressive enhancement only. The page is complete and readable without this file.
   Every duration and curve used here is read from the motion tokens in styles.css. */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var hoverMQ = window.matchMedia("(hover: hover) and (pointer: fine)");

  function token(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
  function ms(name) {
    var v = token(name);
    return v.indexOf("ms") > -1 ? parseFloat(v) : parseFloat(v) * 1000;
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function onChange(mq, fn) {
    if (mq.addEventListener) { mq.addEventListener("change", fn); } else if (mq.addListener) { mq.addListener(fn); }
  }

  /* ---------------------------------------------------------------------
     Reveals (once). Anything already on screen is marked before the hidden
     state exists, so nothing flashes out and back in. */
  var revealEls = Array.prototype.slice.call(document.querySelectorAll(".reveal, .always, .steps"));
  var vh = window.innerHeight || root.clientHeight;
  var hasIO = "IntersectionObserver" in window;
  function show(el) { el.classList.add("is-in"); }
  if (hasIO) {
    revealEls.forEach(function (el) { if (el.getBoundingClientRect().top < vh * 0.85) { show(el); } });
  }
  root.classList.add("js");
  if (hasIO) {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { show(e.target); revealIO.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.2 });
    revealEls.forEach(function (el) { if (!el.classList.contains("is-in")) { revealIO.observe(el); } });
  } else {
    revealEls.forEach(show);
  }
  window.addEventListener("beforeprint", function () { revealEls.forEach(show); });

  /* ---------------------------------------------------------------------
     Header material after scroll */
  var header = document.querySelector(".site-header");
  var sentinel = document.querySelector(".scroll-sentinel");
  if (header && sentinel && hasIO) {
    new IntersectionObserver(function (entries) {
      header.classList.toggle("is-scrolled", !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  /* ---------------------------------------------------------------------
     24-hour dial: shows the visitor's local time. The hand sweeps from
     midnight to now on load, the time counts along with it, then the hand
     moves once a minute. */
  (function dial() {
    var fig = document.querySelector(".dial");
    if (!fig) { return; }
    var hand = fig.querySelector(".dial-hand");
    var timeEl = document.getElementById("dial-time");
    var labelEl = document.getElementById("dial-label");
    var capEl = document.getElementById("dial-cap");
    var current = 0;

    function minutesNow() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
    function parts(mins) {
      var h = Math.floor(mins / 60) % 24, m = mins % 60;
      return [(h % 12 || 12) + ":" + (m < 10 ? "0" : "") + m, h < 12 ? "AM" : "PM"];
    }
    function fmt(mins) { var p = parts(mins); return p[0] + " " + p[1]; }
    function angle(mins) { return mins / 1440 * 360; }
    var numEl = document.createElement("span"), apEl = document.createElement("span");
    numEl.className = "t-num"; apEl.className = "t-ap";
    function writeTime(mins) {
      var p = parts(mins);
      if (numEl.parentNode !== timeEl) { timeEl.textContent = ""; timeEl.appendChild(numEl); timeEl.appendChild(apEl); }
      numEl.textContent = p[0]; apEl.textContent = p[1];
    }
    function caption(mins) { capEl.textContent = "A 24-hour clock showing your time, " + fmt(mins) + ". We're on."; }
    function place(mins) {
      var a = angle(mins);
      while (a < current - 180) { a += 360; } // keep turning forward past midnight
      current = a;
      hand.style.transform = "rotate(" + a + "deg)";
    }

    var now = minutesNow();
    labelEl.textContent = "Right now";
    caption(now);

    function startTicking() {
      fig.classList.add("is-ticking");
      function tick() {
        var m = minutesNow();
        writeTime(m); caption(m); place(m);
      }
      var wait = 60000 - (Date.now() % 60000) + 50;
      window.setTimeout(function () { tick(); window.setInterval(tick, 60000); }, wait);
      document.addEventListener("visibilitychange", function () { if (!document.hidden) { tick(); } });
    }

    if (reduceMQ.matches || !hand.animate) {
      writeTime(now); place(now);
      fig.classList.add("is-live");
      startTicking();
      return;
    }

    writeTime(0);
    fig.classList.add("is-live");
    var target = angle(now);
    var anim = hand.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(" + target + "deg)" }],
      { duration: ms("--dur-sweep"), delay: ms("--stagger") * 6, easing: token("--ease-in-out"), fill: "both" }
    );
    var raf;
    function follow() {
      var p = anim.effect.getComputedTiming().progress;
      if (typeof p === "number") { writeTime(Math.round(p * now)); }
      raf = window.requestAnimationFrame(follow);
    }
    raf = window.requestAnimationFrame(follow);
    anim.finished.then(function () {
      window.cancelAnimationFrame(raf);
      writeTime(now);
      current = target;
      hand.style.transform = "rotate(" + target + "deg)";
      anim.cancel();
      startTicking();
    }, function () { window.cancelAnimationFrame(raf); });
  })();

  /* ---------------------------------------------------------------------
     Incident story. Large screens: the stage is sticky and scroll position
     picks the active step. Smaller screens: the step nearest the middle of
     the viewport is active. Reduced motion: every step shown, nothing moves. */
  (function story() {
    var section = document.querySelector(".story");
    if (!section || reduceMQ.matches) { return; }
    var track = section.querySelector(".story-track");
    var steps = Array.prototype.slice.call(section.querySelectorAll(".story-step"));
    var fill = section.querySelector(".story-fill");
    var rail = section.querySelector(".story-rail");
    var nodes = steps.map(function (s) { return s.querySelector(".step-node"); });
    var stickyMQ = window.matchMedia("(min-width: 60rem) and (min-height: 640px)");
    var clock = section.querySelector(".sc-time");
    var scNum = section.querySelector(".sc-num");
    var scStatus = section.querySelector(".sc-status");
    var scLabel = section.querySelector(".sc-label");
    var shown = 0;
    var clockAnims = [];

    /* Text morph for the big clock: old value leaves, new value arrives,
       in the direction the reader is scrolling. */
    function swapClock(i) {
      if (i < 0 || i === shown || !clock) { return; }
      var dir = i > shown ? 1 : -1;
      shown = i;
      var step = steps[i];
      var rise = token("--rise"), blur = "blur(" + token("--blur") + ")";
      /* Start from wherever the previous swap left the clock, so fast scrolling
         retargets the motion instead of snapping back to full opacity. */
      var cs = getComputedStyle(clock);
      var from = { opacity: cs.opacity, transform: cs.transform, filter: cs.filter === "none" ? "blur(0)" : cs.filter };
      clockAnims.forEach(function (a) { a.cancel(); });
      var out = clock.animate(
        [from,
         { opacity: 0, transform: "translateY(calc(" + rise + " * " + (-dir) + "))", filter: blur }],
        { duration: ms("--dur-hover"), easing: token("--ease-out"), fill: "forwards" });
      clockAnims = [out];
      out.onfinish = function () {
        scNum.textContent = step.getAttribute("data-time");
        scLabel.textContent = step.getAttribute("data-status");
        scStatus.setAttribute("data-tone", step.getAttribute("data-tone"));
        var inn = clock.animate(
          [{ opacity: 0, transform: "translateY(calc(" + rise + " * " + dir + "))", filter: blur },
           { opacity: 1, transform: "none", filter: "blur(0)" }],
          { duration: ms("--dur-ui"), easing: token("--ease-out"), fill: "forwards" });
        clockAnims = [inn];
        out.cancel();
      };
    }
    var fractions = [];
    var active = -2;
    var ticking = false;

    function layout() {
      section.classList.toggle("is-sticky", stickyMQ.matches);
      var centers = nodes.map(function (n) { return n.offsetTop + n.offsetHeight / 2 + n.parentNode.offsetTop; });
      var first = centers[0], last = centers[centers.length - 1];
      rail.style.top = first + "px";
      rail.style.bottom = "auto";
      rail.style.height = (last - first) + "px";
      fractions = centers.map(function (c) { return (c - first) / (last - first); });
      active = -2;
      update();
    }
    function setActive(i) {
      if (i === active) { return; }
      active = i;
      steps.forEach(function (s, k) {
        s.classList.toggle("is-active", k === i);
        s.classList.toggle("is-past", k < i);
      });
      fill.style.transform = "scaleY(" + (i < 0 ? 0 : fractions[i]) + ")";
      swapClock(i);
    }
    function update() {
      ticking = false;
      var h = window.innerHeight;
      if (stickyMQ.matches) {
        var r = track.getBoundingClientRect();
        var p = clamp(-r.top / Math.max(1, r.height - h), 0, 1);
        setActive(Math.min(steps.length - 1, Math.floor(p * steps.length)));
      } else {
        var idx = -1;
        steps.forEach(function (s, k) { if (s.getBoundingClientRect().top < h * 0.62) { idx = k; } });
        setActive(idx);
      }
    }
    function onScroll() { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }

    section.classList.add("is-live");
    layout();
    window.addEventListener("scroll", onScroll, { passive: true });
    var relayout = false;
    window.addEventListener("resize", function () {
      if (relayout) { return; }
      relayout = true;
      window.requestAnimationFrame(function () { relayout = false; layout(); });
    });
    onChange(stickyMQ, layout);
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(layout); }
  })();

  /* ---------------------------------------------------------------------
     Services: on desktop the list becomes tabs. Hover, focus or click moves
     one shared highlight and crossfades the detail panel. */
  (function services() {
    var svc = document.querySelector(".svc");
    if (!svc) { return; }
    var list = svc.querySelector(".svc-list");
    var items = Array.prototype.slice.call(svc.querySelectorAll(".svc-item"));
    var panels = items.map(function (it) { return document.getElementById(it.getAttribute("data-panel")); });
    var hl = svc.querySelector(".svc-hl");
    var deskMQ = window.matchMedia("(min-width: 60rem)");
    var index = 0;
    var enhanced = false;
    var intent = 0;

    function select(i, focus) {
      index = i;
      items.forEach(function (it, k) {
        var on = k === i;
        it.setAttribute("aria-selected", on ? "true" : "false");
        it.tabIndex = on ? 0 : -1;
        panels[k].classList.toggle("is-active", on);
        panels[k].inert = !on;
        panels[k].setAttribute("aria-hidden", on ? "false" : "true");
        panels[k].tabIndex = on ? 0 : -1;
      });
      hl.style.transform = "translateY(" + items[i].offsetTop + "px)";
      if (focus) { items[i].focus(); }
    }
    function enhance() {
      enhanced = true;
      svc.classList.add("is-enhanced", "is-placing");
      list.setAttribute("role", "tablist");
      list.setAttribute("aria-orientation", "vertical");
      items.forEach(function (it, k) {
        it.setAttribute("role", "tab");
        it.setAttribute("aria-controls", panels[k].id);
        panels[k].setAttribute("role", "tabpanel");
      });
      select(index, false);
      window.requestAnimationFrame(function () { window.requestAnimationFrame(function () { svc.classList.remove("is-placing"); }); });
    }
    function unenhance() {
      enhanced = false;
      svc.classList.remove("is-enhanced");
      list.removeAttribute("role");
      list.removeAttribute("aria-orientation");
      items.forEach(function (it, k) {
        ["role", "aria-controls", "aria-selected", "tabindex"].forEach(function (a) { it.removeAttribute(a); });
        ["role", "aria-hidden", "tabindex"].forEach(function (a) { panels[k].removeAttribute(a); });
        panels[k].inert = false;
      });
    }
    function mode() { if (deskMQ.matches) { enhance(); } else if (enhanced) { unenhance(); } }

    items.forEach(function (it, k) {
      it.addEventListener("click", function () { if (enhanced) { select(k, false); } });
      it.addEventListener("focus", function () { if (enhanced && index !== k) { select(k, false); } });
      /* Hover switches only after the pointer rests briefly, so crossing the list
         on the way to the panel doesn't flick through every service. */
      it.addEventListener("mouseenter", function () {
        if (!enhanced || !hoverMQ.matches || index === k) { return; }
        window.clearTimeout(intent);
        intent = window.setTimeout(function () { select(k, false); }, ms("--intent"));
      });
      it.addEventListener("mouseleave", function () { window.clearTimeout(intent); });
      it.addEventListener("keydown", function (e) {
        if (!enhanced) { return; }
        var n = items.length, next = null;
        if (e.key === "ArrowDown" || e.key === "ArrowRight") { next = (k + 1) % n; }
        else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { next = (k - 1 + n) % n; }
        else if (e.key === "Home") { next = 0; }
        else if (e.key === "End") { next = n - 1; }
        if (next !== null) { e.preventDefault(); select(next, true); }
      });
    });
    mode();
    onChange(deskMQ, mode);
    var resizing = false;
    window.addEventListener("resize", function () {
      if (!enhanced || resizing) { return; }
      resizing = true;
      window.requestAnimationFrame(function () {
        resizing = false;
        if (!enhanced) { return; }
        svc.classList.add("is-placing");
        select(index, false);
        window.requestAnimationFrame(function () { svc.classList.remove("is-placing"); });
      });
    });
  })();

  /* ---------------------------------------------------------------------
     FAQ: animate open and close with grid rows. Close waits for the
     transition before the native details element hides its content. */
  (function faq() {
    var all = Array.prototype.slice.call(document.querySelectorAll(".faq details"));
    all.forEach(function (d) {
      if (d.open) { d.setAttribute("data-state", "open"); }
      var summary = d.querySelector("summary");
      var body = d.querySelector(".faq-body");
      var timer;
      summary.addEventListener("click", function (e) {
        e.preventDefault();
        window.clearTimeout(timer);
        if (d.getAttribute("data-state") === "open") {
          d.setAttribute("data-state", "closed");
          if (reduceMQ.matches) { d.open = false; return; }
          var done = function () { if (d.getAttribute("data-state") === "closed") { d.open = false; } };
          timer = window.setTimeout(done, ms("--dur-ui") + 40);
        } else {
          d.open = true;
          void body.offsetHeight; // start from the closed row height
          d.setAttribute("data-state", "open");
        }
      });
    });
  })();

  /* ---------------------------------------------------------------------
     Toasts, built by hand after Sonner: newest at the front, older ones
     tucked behind, auto-dismiss that pauses while the tab is hidden. */
  var toaster = document.querySelector(".toaster");
  var toasts = [];
  var SVGNS = "http://www.w3.org/2000/svg";
  function restack() {
    toasts.forEach(function (t, i) {
      t.el.style.setProperty("--index", i);
      t.el.setAttribute("data-hidden", i > 2 ? "true" : "false");
    });
  }
  function dismiss(t) {
    if (t.gone) { return; }
    t.gone = true;
    window.clearTimeout(t.timer);
    toasts = toasts.filter(function (x) { return x !== t; });
    t.el.setAttribute("data-removed", "true");
    restack();
    window.setTimeout(function () { if (t.el.parentNode) { t.el.parentNode.removeChild(t.el); } }, ms("--dur-ui") + 60);
  }
  function toast(title, desc) {
    if (!toaster) { return; }
    /* Same message already in front: restart its timer instead of stacking a copy */
    var front = toasts[0];
    if (front && front.title === title && front.desc === desc) {
      window.clearTimeout(front.timer);
      front.remaining = 4000;
      front.resume();
      return;
    }
    var el = document.createElement("li");
    el.className = "toast";
    el.setAttribute("data-mounted", "false");
    var icon = document.createElementNS(SVGNS, "svg");
    icon.setAttribute("width", "18"); icon.setAttribute("height", "18"); icon.setAttribute("viewBox", "0 0 20 20");
    var c = document.createElementNS(SVGNS, "circle");
    c.setAttribute("cx", "10"); c.setAttribute("cy", "10"); c.setAttribute("r", "9"); c.setAttribute("fill", "#12A150");
    var p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", "M6 10.4l2.6 2.6L14 7.6"); p.setAttribute("fill", "none"); p.setAttribute("stroke", "#fff");
    p.setAttribute("stroke-width", "1.8"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
    icon.appendChild(c); icon.appendChild(p);
    var text = document.createElement("span");
    var t1 = document.createElement("span"); t1.className = "toast-title"; t1.textContent = title;
    text.appendChild(t1);
    if (desc) { var t2 = document.createElement("span"); t2.className = "toast-desc"; t2.textContent = " " + desc; text.appendChild(t2); }
    el.appendChild(icon); el.appendChild(text);
    toaster.appendChild(el);

    var t = { el: el, title: title, desc: desc, remaining: 4000, start: 0, timer: 0, gone: false };
    toasts.unshift(t);
    restack();
    window.requestAnimationFrame(function () { window.requestAnimationFrame(function () { el.setAttribute("data-mounted", "true"); }); });
    function run() { t.start = Date.now(); t.timer = window.setTimeout(function () { dismiss(t); }, t.remaining); }
    t.pause = function () { window.clearTimeout(t.timer); t.remaining -= Date.now() - t.start; };
    t.resume = run;
    run();
  }
  document.addEventListener("visibilitychange", function () {
    toasts.forEach(function (t) { if (document.hidden) { t.pause(); } else { t.resume(); } });
  });

  /* ---------------------------------------------------------------------
     Copy email */
  var copyBtn = document.querySelector(".copy-btn");
  var status = document.getElementById("copy-status");
  var emailNode = document.getElementById("email-text");
  if (copyBtn) {
    copyBtn.hidden = false;
    var announce = function (msg) { if (status) { status.textContent = ""; window.setTimeout(function () { status.textContent = msg; }, 30); } };
    var fallback = function () {
      if (emailNode && window.getSelection) {
        var range = document.createRange();
        range.selectNodeContents(emailNode);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      var msg = mac ? "Press ⌘C to copy." : "Press Ctrl+C to copy.";
      toast("Email selected.", msg);
      announce("Email selected. " + msg);
    };
    copyBtn.addEventListener("click", function () {
      var text = copyBtn.getAttribute("data-copy");
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () {
          toast("Email copied.", text);
          announce("Email copied.");
        }, fallback);
      } else {
        fallback();
      }
    });
  }
})();
