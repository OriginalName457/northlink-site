/* ==========================================================================
   Northlink
   Loaded in <head> without defer: the first line sets html.js before first
   paint, everything else waits for DOMContentLoaded. No dependencies and no
   network requests. Every loop pauses off-screen and while the tab is hidden.
   Without this file the page is complete: every artifact shows its finished
   state and the services list is a plain accordion.
   ========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');

  const hasIO = 'IntersectionObserver' in window;
  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hoverMQ = window.matchMedia('(hover: hover) and (pointer: fine)');
  const token = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  const ms = (name) => {
    const v = token(name);
    return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000;
  };
  const onChange = (mq, fn) => {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  };

  /* ---------- Page visibility ---------- */
  const visibilityHooks = new Set();
  const syncHidden = () => {
    root.classList.toggle('is-hidden', document.hidden);
    visibilityHooks.forEach((fn) => fn());
  };
  document.addEventListener('visibilitychange', syncHidden);

  /* ---------- Timeline: timed steps that pause and resume ---------- */
  const createTimeline = (steps) => {
    let index = 0;
    let elapsed = 0;
    let startedAt = 0;
    let timer = 0;
    let started = false;
    let active = false;

    const tick = () => {
      timer = 0;
      const now = elapsed + (performance.now() - startedAt);
      while (index < steps.length && steps[index].at <= now + 4) steps[index++].run();
      if (index < steps.length) timer = window.setTimeout(tick, steps[index].at - now);
    };
    const pause = () => {
      if (!timer) return;
      window.clearTimeout(timer);
      timer = 0;
      elapsed += performance.now() - startedAt;
    };
    const resume = () => {
      if (!started || !active || timer || index >= steps.length) return;
      startedAt = performance.now();
      tick();
    };
    return {
      play() { pause(); index = 0; elapsed = 0; started = true; resume(); },
      setActive(on) { active = on; if (on) resume(); else pause(); },
      get started() { return started; },
    };
  };

  /* Runs `timeline` only while `el` is on screen and the tab is visible.
     Starts it the first time `startRatio` of the element is in view. */
  const gateTimeline = (el, timeline, startRatio) => {
    let inView = false;
    const sync = () => timeline.setActive(inView && !document.hidden);
    visibilityHooks.add(sync);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        inView = entry.isIntersecting;
        if (!timeline.started && entry.intersectionRatio >= startRatio) timeline.play();
        sync();
      });
    }, { threshold: [0, startRatio] });
    io.observe(el);
  };

  /* ---------- Status chip ---------- */
  const setStatus = (wrap, name) => {
    if (!wrap) return;
    wrap.querySelectorAll('[data-state]').forEach((chip) => {
      const on = chip.dataset.state === name;
      chip.classList.toggle('is-current', on);
      if (on) chip.removeAttribute('aria-hidden');
      else chip.setAttribute('aria-hidden', 'true');
    });
  };

  const makeTyping = () => {
    const t = document.createElement('span');
    t.className = 'typing';
    t.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i += 1) t.appendChild(document.createElement('i'));
    return t;
  };

  /* ---------- Sequenced artifacts (ticket, incident, handover) ----------
     Markup carries the finished state. JS hides the steps, then plays them.
     data-step            a row that appears
     data-typing          show typing dots for 700ms before it appears
     data-gap="ms"        pause after this row (default from the card)
     data-status-on="x"   switch the status chip when this row appears */
  const setupSequence = (card) => {
    const steps = Array.from(card.querySelectorAll('[data-step]'));
    if (!steps.length) return;
    const statusWrap = card.querySelector('[data-status]');
    const foot = card.querySelector('[data-seq-foot]');
    const replay = card.querySelector('[data-replay]');
    const initial = card.dataset.statusStart || '';
    const finalState = statusWrap ? statusWrap.dataset.status : '';
    const lead = Number(card.dataset.lead || 300);
    const defaultGap = Number(card.dataset.gap || 1000);
    const typingMs = 700;

    steps.forEach((s) => { if (s.hasAttribute('data-typing')) s.prepend(makeTyping()); });

    const reset = () => {
      card.classList.add('is-resetting', 'is-seq');
      steps.forEach((s) => s.classList.remove('is-in', 'is-typing'));
      if (foot) foot.classList.remove('is-in');
      setStatus(statusWrap, initial);
      void card.offsetWidth;
      card.classList.remove('is-resetting');
    };

    const timeline = [{ at: 0, run: reset }];
    let t = lead;
    steps.forEach((s, i) => {
      if (s.hasAttribute('data-typing')) {
        timeline.push({ at: t, run: () => s.classList.add('is-typing') });
        t += typingMs;
      }
      const status = s.dataset.statusOn;
      timeline.push({
        at: t,
        run: () => {
          s.classList.remove('is-typing');
          s.classList.add('is-in');
          if (status) setStatus(statusWrap, status);
        },
      });
      if (i < steps.length - 1) t += Number(s.dataset.gap || defaultGap);
    });
    t += 300;
    timeline.push({
      at: t,
      run: () => {
        if (foot) foot.classList.add('is-in');
        if (finalState) setStatus(statusWrap, finalState);
      },
    });

    const tl = createTimeline(timeline);
    reset(); // hide steps now so the first frame does not flash the finished state
    gateTimeline(card, tl, Number(card.dataset.startRatio || 0.4));

    if (replay) {
      replay.hidden = false;
      replay.addEventListener('click', () => tl.play());
    }
  };

  /* ---------- Week grid + live clock ---------- */
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const formatTime = (d) => {
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
  };
  const grids = [];
  const updateGrids = () => {
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    const hour = now.getHours();
    const label = `Your time: ${DAYS[day]} ${formatTime(now)}`;
    grids.forEach((g) => {
      const row = g.rows[day];
      const cell = row ? row.querySelectorAll('.wg-cell')[hour] : null;
      if (cell && cell !== g.current) {
        if (g.current) g.current.classList.remove('is-now');
        cell.classList.add('is-now');
        g.current = cell;
        g.rows.forEach((r, i) => {
          const d = r.querySelector('.wg-day');
          if (d) d.classList.toggle('is-today', i === day);
        });
      }
      if (g.clock) g.clock.textContent = label;
    });
  };
  let clockTimer = 0;
  const scheduleClock = () => {
    window.clearTimeout(clockTimer);
    clockTimer = 0;
    if (document.hidden || !grids.length) return;
    updateGrids();
    clockTimer = window.setTimeout(scheduleClock, 60000 - (Date.now() % 60000) + 50);
  };
  visibilityHooks.add(scheduleClock);

  const setupWeekGrid = (el) => {
    const rows = Array.from(el.querySelectorAll('.wg-row'));
    rows.forEach((r) => {
      r.querySelectorAll('.wg-cell').forEach((c, i) => c.style.setProperty('--c', String(i)));
    });
    grids.push({ rows, clock: el.querySelector('[data-wg-time]'), current: null });
    if (!hasIO) { el.classList.add('is-in'); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { el.classList.add('is-in'); io.disconnect(); }
      });
    }, { threshold: 0.3 });
    io.observe(el);
  };

  /* ---------- Ticker ---------- */
  const setupTicker = (el) => {
    const track = el.querySelector('.ticker-track');
    const list = el.querySelector('.ticker-list');
    if (!track || !list) return;
    const clone = list.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.removeAttribute('aria-labelledby');
    track.appendChild(clone);
    el.classList.add('is-running');
  };

  /* ---------- Accordions (services on small screens, FAQ) ----------
     Height animates with grid rows. Closing waits for the transition
     before the native details element hides its content. */
  const setupAccordion = (d) => {
    const summary = d.querySelector('summary');
    const body = d.querySelector('.acc-body');
    if (!summary || !body) return;
    if (d.open) d.setAttribute('data-state', 'open');
    let timer = 0;
    summary.addEventListener('click', (e) => {
      e.preventDefault();
      window.clearTimeout(timer);
      if (d.getAttribute('data-state') === 'open') {
        d.setAttribute('data-state', 'closed');
        if (reduceMQ.matches) { d.open = false; return; }
        timer = window.setTimeout(() => {
          if (d.getAttribute('data-state') === 'closed') d.open = false;
        }, ms('--dur-ui') + 40);
      } else {
        d.open = true;
        void body.offsetHeight; // start from the closed row height
        d.setAttribute('data-state', 'open');
      }
    });
    // Find-in-page or a fragment can open a closed details element directly.
    d.addEventListener('toggle', () => {
      if (d.open && d.getAttribute('data-state') !== 'open') d.setAttribute('data-state', 'open');
    });
  };

  /* ---------- Services: vertical tabs on wide screens ----------
     Hover (after a short rest), focus, click or arrow keys move one shared
     highlight and crossfade the panel. Keyboard moves are instant. */
  const setupServices = (svc) => {
    const tabsWrap = svc.querySelector('.svc-tabs');
    const tabs = Array.from(svc.querySelectorAll('.svc-tab'));
    const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
    const hl = svc.querySelector('.svc-hl');
    if (!tabsWrap || !tabs.length || !hl || panels.some((p) => !p)) return;
    const deskMQ = window.matchMedia('(min-width: 60rem)');
    let index = 0;
    let enhanced = false;
    let intent = 0;

    /* Final geometry of tab i once only it is expanded. Measured from the
       current layout minus each description's current height, so it is
       right even halfway through a transition. */
    const target = (i) => {
      let top = 0;
      for (let k = 0; k < i; k += 1) {
        const desc = tabs[k].querySelector('.svc-desc');
        top += tabs[k].offsetHeight - desc.offsetHeight;
      }
      const desc = tabs[i].querySelector('.svc-desc');
      const inner = tabs[i].querySelector('.svc-desc-in');
      const height = tabs[i].offsetHeight - desc.offsetHeight + inner.scrollHeight;
      return { top, height };
    };
    const placeHighlight = () => {
      const g = target(index);
      hl.style.transform = `translateY(${g.top}px)`;
      hl.style.height = `${g.height}px`;
    };
    const select = (i, opts = {}) => {
      if (opts.instant) svc.classList.add('is-instant', 'is-placing');
      index = i;
      tabs.forEach((t, k) => {
        const on = k === i;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        panels[k].classList.toggle('is-active', on);
        panels[k].hidden = false;
        panels[k].inert = !on;
        panels[k].setAttribute('aria-hidden', on ? 'false' : 'true');
      });
      placeHighlight();
      if (opts.focus) tabs[i].focus();
      if (opts.instant) {
        void svc.offsetWidth;
        window.requestAnimationFrame(() => svc.classList.remove('is-instant', 'is-placing'));
      }
    };
    const mode = () => {
      if (deskMQ.matches && !enhanced) {
        enhanced = true;
        tabsWrap.hidden = false;
        svc.classList.add('is-enhanced');
        select(index, { instant: true });
      } else if (!deskMQ.matches && enhanced) {
        enhanced = false;
        tabsWrap.hidden = true;
        svc.classList.remove('is-enhanced');
      }
    };

    tabs.forEach((t, k) => {
      t.addEventListener('click', () => { if (index !== k) select(k); });
      t.addEventListener('mouseenter', () => {
        if (!hoverMQ.matches || index === k) return;
        window.clearTimeout(intent);
        intent = window.setTimeout(() => select(k), ms('--intent'));
      });
      t.addEventListener('mouseleave', () => window.clearTimeout(intent));
      t.addEventListener('keydown', (e) => {
        const n = tabs.length;
        let next = null;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (k + 1) % n;
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (k - 1 + n) % n;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = n - 1;
        if (next !== null) { e.preventDefault(); select(next, { focus: true, instant: true }); }
      });
    });
    mode();
    onChange(deskMQ, mode);
    let queued = false;
    window.addEventListener('resize', () => {
      if (!enhanced || queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        if (!enhanced) return;
        svc.classList.add('is-placing');
        placeHighlight();
        window.requestAnimationFrame(() => svc.classList.remove('is-placing'));
      });
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (enhanced) select(index, { instant: true }); });
    }
  };

  /* ---------- Toasts, after Sonner ----------
     Newest at the front, older ones tucked behind, auto-dismiss that pauses
     while the tab is hidden. */
  const SVGNS = 'http://www.w3.org/2000/svg';
  let toaster = null;
  let toasts = [];
  const restack = () => {
    toasts.forEach((t, i) => {
      t.el.style.setProperty('--index', String(i));
      t.el.setAttribute('data-hidden', i > 2 ? 'true' : 'false');
    });
  };
  const dismiss = (t) => {
    if (t.gone) return;
    t.gone = true;
    window.clearTimeout(t.timer);
    toasts = toasts.filter((x) => x !== t);
    t.el.setAttribute('data-removed', 'true');
    restack();
    window.setTimeout(() => t.el.remove(), ms('--dur-ui') + 60);
  };
  const toast = (title, desc) => {
    if (!toaster) return;
    const front = toasts[0];
    if (front && front.title === title && front.desc === desc) {
      window.clearTimeout(front.timer);
      front.remaining = 4000;
      front.resume();
      return;
    }
    const el = document.createElement('li');
    el.className = 'toast';
    el.setAttribute('data-mounted', 'false');
    const icon = document.createElementNS(SVGNS, 'svg');
    icon.setAttribute('viewBox', '0 0 20 20');
    const c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('cx', '10'); c.setAttribute('cy', '10'); c.setAttribute('r', '9');
    c.setAttribute('class', 'toast-icon-bg');
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', 'M6 10.4l2.6 2.6L14 7.6');
    p.setAttribute('class', 'toast-icon-check');
    icon.append(c, p);
    const text = document.createElement('span');
    const t1 = document.createElement('span');
    t1.className = 'toast-title';
    t1.textContent = title;
    text.appendChild(t1);
    if (desc) {
      const t2 = document.createElement('span');
      t2.className = 'toast-desc';
      t2.textContent = ` ${desc}`;
      text.appendChild(t2);
    }
    el.append(icon, text);
    toaster.appendChild(el);

    const t = { el, title, desc, remaining: 4000, start: 0, timer: 0, gone: false };
    toasts.unshift(t);
    restack();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => el.setAttribute('data-mounted', 'true')));
    t.resume = () => { t.start = Date.now(); t.timer = window.setTimeout(() => dismiss(t), t.remaining); };
    t.pause = () => { window.clearTimeout(t.timer); t.remaining -= Date.now() - t.start; };
    t.resume();
  };
  visibilityHooks.add(() => {
    toasts.forEach((t) => { if (document.hidden) t.pause(); else t.resume(); });
  });

  /* ---------- Copy address ---------- */
  const setupCopy = (btn) => {
    const status = document.getElementById('copy-status');
    const emailNode = document.getElementById('email-text');
    btn.hidden = false;
    const announce = (msg) => {
      if (!status) return;
      status.textContent = '';
      window.setTimeout(() => { status.textContent = msg; }, 30);
    };
    const fallback = () => {
      if (emailNode && window.getSelection) {
        const range = document.createRange();
        range.selectNodeContents(emailNode);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      const msg = mac ? 'Press ⌘C to copy.' : 'Press Ctrl+C to copy.';
      toast('Address selected.', msg);
      announce(`Address selected. ${msg}`);
    };
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-copy');
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
          toast('Address copied.', text);
          announce('Address copied.');
        }, fallback);
      } else {
        fallback();
      }
    });
  };

  /* ---------- Init ---------- */
  const init = () => {
    syncHidden();
    toaster = document.querySelector('.toaster');
    document.querySelectorAll('[data-weekgrid]').forEach(setupWeekGrid);
    scheduleClock();
    document.querySelectorAll('[data-ticker]').forEach(setupTicker);
    document.querySelectorAll('[data-acc] > details').forEach(setupAccordion);
    document.querySelectorAll('[data-svc]').forEach(setupServices);
    document.querySelectorAll('.copy-btn').forEach(setupCopy);

    const reveals = document.querySelectorAll('.reveal');
    const showAll = () => reveals.forEach((el) => el.classList.add('is-in'));
    window.addEventListener('beforeprint', showAll);
    if (!hasIO) { showAll(); return; }

    const revealIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealIO.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach((el) => revealIO.observe(el));

    const loopIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-paused', !entry.isIntersecting));
    });
    document.querySelectorAll('[data-loop]').forEach((el) => loopIO.observe(el));

    document.querySelectorAll('[data-sequence]').forEach(setupSequence);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
