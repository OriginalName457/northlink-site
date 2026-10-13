/* Assessment questionnaire.
   Opens from any [data-assess] link or #assessment. Without JS (or <dialog>),
   those links fall back to their mailto: href. Answers are kept on this device
   until sent, then posted to FormSubmit, which emails them to us. */
(function () {
  'use strict';

  const DRAFT_KEY = 'northlink-assessment';
  const QUESTION_STEPS = 6;

  /* ---------- Email check ----------
     Catches addresses that can't work and common domain typos, so we can reply.
     Returns '' when fine, 'suggest' when a typo fix was offered, or a message.
     A suggestion is offered once; sending the same address again goes through. */
  const DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com', 'live.com', 'msn.com', 'comcast.net', 'protonmail.com', 'me.com'];
  const EMAIL_RE = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[A-Za-z]{2,}$/;
  const dist = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[a.length][b.length];
  };
  const suggestEmail = (v) => {
    const at = v.lastIndexOf('@');
    if (at < 1) return '';
    const user = v.slice(0, at);
    const typed = v.slice(at + 1).toLowerCase();
    const dom = typed.replace(/\.(con|cmo|ocm|comm|cm|vom|xom)$/, '.com');
    if (DOMAINS.includes(dom)) return dom === typed ? '' : `${user}@${dom}`;
    let best = '';
    let bestD = 3;
    DOMAINS.forEach((k) => { const n = dist(dom, k); if (n < bestD) { bestD = n; best = k; } });
    if (best && bestD <= 2) return `${user}@${best}`;
    return dom !== typed ? `${user}@${dom}` : '';
  };
  const offered = new WeakMap();
  const checkEmail = (input, err) => {
    const v = input.value.trim();
    input.value = v;
    if (!v) return 'Enter your email so we can reply.';
    if (!EMAIL_RE.test(v)) return 'That email doesn\'t look right. Check it so we can reply.';
    const sug = suggestEmail(v);
    if (sug && offered.get(input) !== v) {
      offered.set(input, v);
      if (err) {
        err.textContent = 'Did you mean ';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'msg-fix';
        b.textContent = sug;
        b.addEventListener('click', () => {
          input.value = sug;
          err.hidden = true;
          input.removeAttribute('aria-invalid');
          input.focus();
        });
        err.append(b, document.createTextNode('?'));
      }
      return 'suggest';
    }
    return '';
  };
  const showErr = (input, err, msg) => {
    if (!err) return;
    if (msg && msg !== 'suggest') err.textContent = msg;
    err.hidden = !msg;
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  };

  const init = () => {
    const dlg = document.getElementById('assess');
    if (!dlg || typeof dlg.showModal !== 'function') return;

    const root = document.documentElement;
    const form = dlg.querySelector('form');
    const steps = Array.from(dlg.querySelectorAll('[data-as-step]'));
    const body = dlg.querySelector('.as-body');
    const stage = dlg.querySelector('.as-stage');
    const bar = dlg.querySelector('.as-bar');
    const count = dlg.querySelector('[data-as-count]');
    const foot = dlg.querySelector('[data-as-foot]');
    const back = dlg.querySelector('[data-as-back]');
    const next = dlg.querySelector('[data-as-next]');
    const fail = dlg.querySelector('[data-as-fail]');
    const reviewEl = dlg.querySelector('[data-as-review]');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
    let current = 0;
    let busy = false;
    let sent = false;

    /* ---------- Answers ---------- */
    const rawValues = () => {
      const fd = new FormData(form);
      const out = {};
      for (const [k, v] of fd.entries()) {
        if (k === '_honey') continue;
        const val = String(v).trim();
        if (!val) continue;
        if (form.querySelector(`input[type="checkbox"][name="${k}"]`)) (out[k] = out[k] || []).push(val);
        else out[k] = val;
      }
      return out;
    };
    /* A "Something else" answer is replaced by what they typed, e.g. "Zoho Mail". */
    const values = () => {
      const out = rawValues();
      Object.keys(out).filter((k) => k.endsWith('__other')).forEach((k) => {
        const base = k.slice(0, -'__other'.length);
        const detail = out[k];
        delete out[k];
        const swap = (v) => (v === 'Something else' ? detail : v);
        if (Array.isArray(out[base])) out[base] = out[base].map(swap);
        else if (out[base]) out[base] = swap(out[base]);
      });
      return out;
    };
    const saveDraft = () => {
      if (sent) return;
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: rawValues(), step: current })); } catch (e) {}
    };
    const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} };
    const restoreDraft = () => {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) {}
      if (!d || !d.v) return 0;
      Object.keys(d.v).forEach((k) => {
        const v = d.v[k];
        const els = form.querySelectorAll(`[name="${k}"]`);
        els.forEach((el) => {
          if (el.type === 'radio' || el.type === 'checkbox') el.checked = [].concat(v).includes(el.value);
          else el.value = v;
        });
      });
      return Math.min(Number(d.step) || 0, QUESTION_STEPS - 1);
    };

    /* ---------- Conditional fields ---------- */
    const syncConditional = (animate) => {
      dlg.querySelectorAll('[data-show-when]').forEach((el) => {
        const picked = Array.from(form.querySelectorAll(`input[name="${el.dataset.showWhen}"]:checked`)).map((i) => i.value);
        const show = el.dataset.showValues.split('|').some((v) => picked.includes(v));
        if (show === !el.hidden) return;
        el.hidden = !show;
        if (show && animate) {
          if (!reduce.matches) {
            el.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE });
          }
          const input = el.querySelector('.as-input');
          if (input && window.matchMedia('(hover: hover) and (pointer: fine)').matches) input.focus({ preventScroll: true });
        }
      });
    };

    /* ---------- Validation ---------- */
    const setErr = (wrap, msg) => {
      const err = wrap.querySelector(':scope > .as-err');
      const input = wrap.classList.contains('as-field') ? wrap.querySelector('.as-input') : null;
      if (err) { err.textContent = msg || ''; err.hidden = !msg; }
      if (input) {
        if (msg) { input.setAttribute('aria-invalid', 'true'); if (err) { err.id = err.id || `${input.id}-err`; input.setAttribute('aria-describedby', err.id); } }
        else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
      }
    };
    const validate = (stepEl) => {
      let first = null;
      stepEl.querySelectorAll('.as-field').forEach((wrap) => {
        const input = wrap.querySelector('.as-input');
        if (!input || wrap.hidden) return;
        const v = input.value.trim();
        let msg = '';
        if (input.type === 'email') {
          msg = checkEmail(input, wrap.querySelector('.as-err'));
          if (msg === 'suggest') showErr(input, wrap.querySelector('.as-err'), msg);
          else setErr(wrap, msg);
        } else {
          if (input.required && !v) msg = 'Please fill this in.';
          setErr(wrap, msg);
        }
        if (msg && !first) first = input;
      });
      stepEl.querySelectorAll('[data-group][data-required]').forEach((fs) => {
        const ok = fs.querySelector('input:checked');
        setErr(fs, ok ? '' : (fs.querySelector('input[type="checkbox"]') ? 'Pick at least one.' : 'Pick one.'));
        if (!ok && !first) first = fs.querySelector('input');
      });
      if (first) {
        first.focus({ preventScroll: true });
        (first.closest('.as-field, .as-q') || first).scrollIntoView({ block: 'nearest', behavior: reduce.matches ? 'auto' : 'smooth' });
        if (!reduce.matches) {
          stepEl.animate(
            [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }],
            { duration: 320, easing: 'ease-out' });
        }
      }
      return !first;
    };

    /* ---------- Review ---------- */
    const SECTIONS = [
      { step: 0, name: 'Contact', rows: [['Organization', 'org'], ['Name', 'name'], ['Role', 'role'], ['Email', 'email'], ['Phone', 'phone']] },
      { step: 1, name: 'Team', rows: [['People on computers', 'staff'], ['Locations', 'locations'], ['Remote or field', 'remote']] },
      { step: 2, name: 'Systems', rows: [['Email and files', 'platform'], ['Also uses', 'uses'], ['Computers', 'computers']] },
      { step: 3, name: 'IT today', rows: [['Handled by', 'current'], ['Agreement ends', 'ends'], ["What isn't working", 'issues']] },
      { step: 4, name: 'Needs', rows: [['Help with', 'needs'], ['Sensitive records', 'sensitive']] },
      { step: 5, name: 'Timing', rows: [['Start', 'start'], ['Best way to reach', 'contact'], ['Notes', 'notes']] },
    ];
    const show = (v) => (Array.isArray(v) ? v.join(', ') : v);
    const el = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    const renderReview = () => {
      const v = values();
      reviewEl.textContent = '';
      const head = el('div', 'as-review-head');
      head.append(el('span', 'as-review-org', v.org || 'Your organization'));
      const chip = el('span', 'chip chip--accent');
      chip.append(el('span', 'chip-dot'), document.createTextNode('Ready to send'));
      head.append(chip);
      reviewEl.append(head);
      SECTIONS.forEach((sec) => {
        const rows = sec.rows.filter(([, k]) => v[k]);
        if (!rows.length) return;
        const box = el('div', 'as-sec');
        const sh = el('div', 'as-sec-head');
        sh.append(el('span', 'as-sec-name', sec.name));
        const edit = el('button', 'as-edit', 'Edit');
        edit.type = 'button';
        edit.setAttribute('aria-label', `Edit ${sec.name.toLowerCase()}`);
        edit.addEventListener('click', () => go(sec.step));
        sh.append(edit);
        const dl = el('dl');
        rows.forEach(([label, k]) => {
          const r = el('div', 'as-row');
          r.append(el('dt', '', label), el('dd', '', show(v[k])));
          dl.append(r);
        });
        box.append(sh, dl);
        reviewEl.append(box);
      });
    };

    /* ---------- Email payload ---------- */
    const summary = (v) => {
      const parts = [
        v.org,
        v.staff && `${v.staff} people on computers`,
        v.locations && `${v.locations} location${v.locations === '1' ? '' : 's'}`,
        v.platform && `${v.platform}${v.uses ? ` + ${v.uses.join(', ')}` : ''}`,
        v.current && `IT today: ${v.current}${v.ends ? ` (agreement ends ${v.ends})` : ''}`,
        v.needs && `Needs: ${v.needs.join(', ')}`,
        v.start && `Start: ${v.start}`,
      ];
      return parts.filter(Boolean).join(' · ');
    };
    const payload = () => {
      const v = values();
      const out = {
        _subject: `Assessment request: ${v.org || 'New organization'}${v.staff ? ` (${v.staff} people)` : ''}`,
        _template: 'table',
        _captcha: 'false',
        _honey: form.elements._honey.value,
        Summary: summary(v),
      };
      SECTIONS.forEach((sec) => sec.rows.forEach(([label, k]) => {
        if (!v[k]) return;
        if (k === 'email') out.email = v[k]; // FormSubmit uses this field as reply-to
        else out[label] = show(v[k]);
      }));
      out.Submitted = new Date().toLocaleString();
      return out;
    };
    const mailtoHref = () => {
      const p = payload();
      const lines = Object.keys(p).filter((k) => !k.startsWith('_')).map((k) => `${k === 'email' ? 'Email' : k}: ${p[k]}`);
      return `mailto:${dlg.dataset.mailto}?subject=${encodeURIComponent(p._subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
    };

    /* ---------- Steps ---------- */
    const animateHeight = (from) => {
      if (reduce.matches) return;
      const to = stage.offsetHeight;
      if (Math.abs(to - from) < 2) return;
      body.style.setProperty('overflow', 'hidden');
      stage.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 300, easing: EASE })
        .finished.then(() => body.style.removeProperty('overflow'), () => {});
    };
    const chrome = () => {
      const isQ = current < QUESTION_STEPS;
      const isReview = current === QUESTION_STEPS;
      const isDone = current === QUESTION_STEPS + 1;
      count.textContent = isQ ? `Step ${current + 1} of ${QUESTION_STEPS}` : (isReview ? 'Review' : 'Sent');
      bar.style.setProperty('--as-p', String(isQ ? (current + 1) / (QUESTION_STEPS + 1) : 1));
      back.hidden = current === 0 || isDone;
      foot.hidden = isDone;
      next.textContent = isReview ? 'Send to Northlink' : 'Continue';
      dlg.setAttribute('aria-labelledby', `as-t${current + 1}`);
    };
    const go = (to, opts) => {
      if (to === current) return;
      const dir = to > current ? 1 : -1;
      const fromEl = steps[current];
      const toEl = steps[to];
      const h = stage.offsetHeight;
      fail.hidden = true;
      if (to === QUESTION_STEPS) renderReview();
      fromEl.hidden = true;
      toEl.hidden = false;
      current = to;
      chrome();
      body.scrollTop = 0;
      if (!reduce.matches) {
        toEl.animate(
          [{ opacity: 0, transform: `translateX(${dir * 16}px)`, filter: 'blur(2px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
          { duration: 320, easing: EASE });
      }
      animateHeight(h);
      if (!(opts && opts.noFocus)) {
        const firstInput = toEl.querySelector('.as-input, input:not([type="hidden"])');
        if (firstInput && window.matchMedia('(hover: hover) and (pointer: fine)').matches && to < QUESTION_STEPS) firstInput.focus({ preventScroll: true });
        else toEl.focus({ preventScroll: true });
      }
      saveDraft();
    };

    const send = async () => {
      if (busy) return;
      busy = true;
      next.setAttribute('aria-busy', 'true');
      next.textContent = '';
      next.append(el('span', 'as-spin'), document.createTextNode('Sending'));
      fail.hidden = true;
      let ok = false;
      try {
        const res = await fetch(dlg.dataset.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload()),
        });
        const j = await res.json().catch(() => ({}));
        ok = res.ok && String(j.success) === 'true';
      } catch (e) { ok = false; }
      busy = false;
      next.removeAttribute('aria-busy');
      if (ok) {
        sent = true;
        clearDraft();
        const first = (values().name || '').split(/\s+/)[0];
        dlg.querySelector('[data-as-first]').textContent = first ? `, ${first}` : '';
        go(QUESTION_STEPS + 1, { noFocus: true });
        const done = dlg.querySelector('[data-as-done]');
        requestAnimationFrame(() => requestAnimationFrame(() => done.classList.add('is-in')));
        dlg.querySelector('.as-done [data-as-close]').focus({ preventScroll: true });
      } else {
        chrome();
        dlg.querySelector('[data-as-mailto]').setAttribute('href', mailtoHref());
        fail.hidden = false;
      }
    };

    const advance = () => {
      if (current < QUESTION_STEPS) {
        if (!validate(steps[current])) return;
        go(current + 1);
      } else if (current === QUESTION_STEPS) {
        send();
      }
    };

    /* ---------- Open and close ---------- */
    let lastTrigger = null;
    const open = (trigger) => {
      if (dlg.open) return;
      lastTrigger = trigger || document.activeElement;
      if (sent) reset();
      root.classList.add('as-lock');
      dlg.showModal();
      requestAnimationFrame(() => requestAnimationFrame(() => dlg.classList.add('is-open')));
      const firstInput = steps[current].querySelector('.as-input');
      if (firstInput && window.matchMedia('(hover: hover) and (pointer: fine)').matches) firstInput.focus({ preventScroll: true });
      else steps[current].focus({ preventScroll: true });
    };
    const close = () => {
      if (!dlg.open || !dlg.classList.contains('is-open')) { if (dlg.open) dlg.close(); return; }
      dlg.classList.remove('is-open');
      const finish = () => {
        dlg.close();
        root.classList.remove('as-lock');
        if (location.hash === '#assessment') history.replaceState(null, '', location.pathname + location.search);
        if (lastTrigger && lastTrigger.focus) lastTrigger.focus({ preventScroll: true });
      };
      if (reduce.matches) finish(); else window.setTimeout(finish, 200);
    };
    const reset = () => {
      form.reset();
      sent = false;
      steps.forEach((s, i) => { s.hidden = i !== 0; });
      dlg.querySelector('[data-as-done]').classList.remove('is-in');
      dlg.querySelectorAll('.as-err').forEach((e) => { e.hidden = true; });
      current = 0;
      syncConditional();
      chrome();
    };

    /* ---------- Wiring ---------- */
    document.querySelectorAll('[data-assess]').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); open(a); });
    });
    dlg.querySelectorAll('[data-as-close]').forEach((b) => b.addEventListener('click', close));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('click', (e) => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) close();
    });
    next.addEventListener('click', advance);
    back.addEventListener('click', () => { if (current > 0) go(current - 1); });
    form.addEventListener('submit', (e) => { e.preventDefault(); advance(); });
    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing || e.shiftKey) return;
      const t = e.target;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'A') return;
      e.preventDefault();
      advance();
    });
    form.addEventListener('change', (e) => {
      syncConditional(true);
      const wrap = e.target.closest('[data-group]');
      if (wrap && wrap.querySelector('input:checked')) setErr(wrap, '');
      saveDraft();
    });
    form.addEventListener('input', (e) => {
      const wrap = e.target.closest('.as-field');
      if (wrap && e.target.getAttribute('aria-invalid') === 'true' && e.target.value.trim()) setErr(wrap, '');
      saveDraft();
    });

    const start = restoreDraft();
    syncConditional();
    if (start) { steps[0].hidden = true; steps[start].hidden = false; current = start; }
    chrome();
    if (location.hash === '#assessment') open();
    window.addEventListener('hashchange', () => { if (location.hash === '#assessment') open(); });
  };

  /* ---------- Quick request under the hero ---------- */
  const initQuick = () => {
    const form = document.querySelector('[data-quick]');
    const dlg = document.getElementById('assess');
    if (!form || !dlg) return;
    const done = document.querySelector('[data-quick-done]');
    const btn = form.querySelector('.quick-send');
    const status = form.querySelector('.quick-status');
    const fields = Array.from(form.querySelectorAll('.as-field'));
    const check = () => {
      let first = null;
      fields.forEach((wrap) => {
        const input = wrap.querySelector('.as-input');
        const err = wrap.querySelector('.as-err');
        const v = input.value.trim();
        let msg = '';
        if (input.type === 'email') msg = checkEmail(input, err);
        else if (input.required && !v) msg = 'Please fill this in.';
        showErr(input, err, msg);
        if (msg && !first) first = input;
      });
      if (first) first.focus();
      return !first;
    };
    form.addEventListener('input', (e) => {
      if (e.target.getAttribute('aria-invalid') === 'true' && e.target.value.trim()) {
        e.target.removeAttribute('aria-invalid');
        const err = e.target.closest('.as-field').querySelector('.as-err');
        err.hidden = true;
      }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (btn.getAttribute('aria-busy') === 'true' || !check()) return;
      const v = Object.fromEntries(new FormData(form).entries());
      const payload = {
        _subject: `Quick assessment request: ${v.org.trim()}`,
        _template: 'table',
        _captcha: 'false',
        _honey: v._honey || '',
        Summary: `${v.name.trim()} at ${v.org.trim()} wants a free assessment. Email them to set up a time.`,
        Name: v.name.trim(),
        Organization: v.org.trim(),
        email: v.email.trim(),
        Phone: (v.phone || '').trim() || 'Not given',
        Submitted: new Date().toLocaleString(),
      };
      btn.setAttribute('aria-busy', 'true');
      btn.textContent = 'Sending';
      status.textContent = ''; status.classList.remove('is-error');
      let ok = false;
      try {
        const res = await fetch(dlg.dataset.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        const j = await res.json().catch(() => ({}));
        ok = res.ok && String(j.success) === 'true';
      } catch (err) { ok = false; }
      btn.removeAttribute('aria-busy');
      btn.textContent = 'Send request';
      if (ok) {
        const first = payload.Name.split(/\s+/)[0];
        done.querySelector('[data-quick-first]').textContent = first ? `, ${first}` : '';
        done.querySelector('[data-quick-email]').textContent = payload.email;
        form.hidden = true;
        done.hidden = false;
        done.focus({ preventScroll: true });
        requestAnimationFrame(() => requestAnimationFrame(() => done.classList.add('is-in')));
      } else {
        const body = Object.keys(payload).filter((k) => !k.startsWith('_')).map((k) => `${k === 'email' ? 'Email' : k}: ${payload[k]}`).join('\n');
        status.classList.add('is-error');
        status.textContent = 'That didn\'t go through. ';
        const a = document.createElement('a');
        a.href = `mailto:${dlg.dataset.mailto}?subject=${encodeURIComponent(payload._subject)}&body=${encodeURIComponent(body)}`;
        a.textContent = 'Send it by email instead';
        status.append(a, document.createTextNode('.'));
      }
    });
  };

  /* ---------- Contact message ---------- */
  const initMsg = () => {
    const form = document.querySelector('[data-msg]');
    const dlg = document.getElementById('assess');
    if (!form || !dlg) return;
    const email = form.querySelector('#m-email');
    const text = form.querySelector('#m-text');
    const emailErr = form.querySelector('#m-email-err');
    const textErr = form.querySelector('#m-text-err');
    const btn = form.querySelector('.msg-send');
    const status = form.querySelector('.msg-status');
    const done = form.querySelector('[data-msg-done]');
    const live = Array.from(form.children).filter((c) => c !== done);
    form.addEventListener('input', (e) => {
      if (e.target.getAttribute('aria-invalid') === 'true') showErr(e.target, e.target === email ? emailErr : textErr, '');
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (btn.getAttribute('aria-busy') === 'true') return;
      const eMsg = checkEmail(email, emailErr);
      showErr(email, emailErr, eMsg);
      const tMsg = text.value.trim() ? '' : 'Write your message.';
      showErr(text, textErr, tMsg);
      if (eMsg) { email.focus(); return; }
      if (tMsg) { text.focus(); return; }
      const payload = {
        _subject: `Website message from ${email.value}`,
        _template: 'table',
        _captcha: 'false',
        _honey: form.elements._honey.value,
        email: email.value,
        Message: text.value.trim(),
        Submitted: new Date().toLocaleString(),
      };
      btn.setAttribute('aria-busy', 'true');
      btn.textContent = 'Sending';
      status.textContent = '';
      status.classList.remove('is-error');
      let ok = false;
      try {
        const res = await fetch(dlg.dataset.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        const j = await res.json().catch(() => ({}));
        ok = res.ok && String(j.success) === 'true';
      } catch (err) { ok = false; }
      btn.removeAttribute('aria-busy');
      btn.textContent = 'Send message';
      if (ok) {
        done.querySelector('[data-msg-email]').textContent = payload.email;
        live.forEach((c) => { c.hidden = true; });
        done.hidden = false;
        done.focus({ preventScroll: true });
        requestAnimationFrame(() => requestAnimationFrame(() => done.classList.add('is-in')));
      } else {
        status.classList.add('is-error');
        status.textContent = 'That didn\'t go through. ';
        const a = document.createElement('a');
        a.href = `mailto:${dlg.dataset.mailto}?subject=${encodeURIComponent('Website message')}&body=${encodeURIComponent(payload.Message)}`;
        a.textContent = 'Email us instead';
        status.append(a, document.createTextNode('.'));
      }
    });
  };

  const boot = () => { init(); initQuick(); initMsg(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
