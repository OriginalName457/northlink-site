/* Progressive enhancement only. The page is complete without this file. */
(function () {
  "use strict";
  var doc = document.documentElement;

  /* ---- Scroll reveals: once, with a safety timeout ----
     Measure first, then add html.js. Anything already on screen gets .is-in
     before the hidden state exists, so it never fades out and back in. */
  var reveals = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  function show(el) { el.classList.add("is-in"); }
  var hasIO = "IntersectionObserver" in window;
  var vh = window.innerHeight || doc.clientHeight;

  if (hasIO) {
    reveals.forEach(function (el) {
      if (el.getBoundingClientRect().top < vh * 0.9) { show(el); }
    });
  }
  doc.classList.add("js");

  if (hasIO && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          show(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.15 });

    reveals.forEach(function (el) {
      if (!el.classList.contains("is-in")) { io.observe(el); }
    });

    // Tall elements can never reach 15% visibility on short screens; this catches them too.
    window.setTimeout(function () {
      reveals.forEach(function (el) {
        if (!el.classList.contains("is-in") && el.getBoundingClientRect().top < (window.innerHeight || vh)) { show(el); }
      });
    }, 2500);
    window.addEventListener("load", function () {
      window.setTimeout(function () {
        // If the observer never fires (old engines, print preview), show everything.
        if (!document.querySelector(".reveal.is-in")) { reveals.forEach(show); }
      }, 2500);
    });
    window.addEventListener("beforeprint", function () { reveals.forEach(show); });
  } else {
    reveals.forEach(show);
  }

  /* ---- Sticky nav scrolled state ---- */
  var header = document.querySelector(".site-header");
  var sentinel = document.querySelector(".scroll-sentinel");
  if (header && sentinel && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      header.classList.toggle("is-scrolled", !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  /* ---- Mobile menu ---- */
  var menuBtn = document.querySelector(".menu-btn");
  var sheet = document.getElementById("menu-sheet");
  if (menuBtn && sheet) {
    menuBtn.hidden = false;
    var label = menuBtn.querySelector(".menu-label");

    function setOpen(open, returnFocus) {
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      sheet.classList.toggle("is-open", open);
      doc.classList.toggle("menu-open", open);
      if (label) { label.textContent = open ? "Close" : "Menu"; }
      if (open) {
        var first = sheet.querySelector("a");
        if (first) { first.focus({ preventScroll: true }); }
      } else if (returnFocus) {
        menuBtn.focus({ preventScroll: true });
      }
    }
    function isOpen() { return menuBtn.getAttribute("aria-expanded") === "true"; }

    menuBtn.addEventListener("click", function () { setOpen(!isOpen(), false); });
    sheet.addEventListener("click", function (e) {
      if (e.target.closest("a")) { setOpen(false, false); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) { setOpen(false, true); }
      if (e.key === "Tab" && isOpen()) {
        // Keep focus inside the button + sheet while open.
        var items = [menuBtn].concat(Array.prototype.slice.call(sheet.querySelectorAll("a")));
        var firstEl = items[0], lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    });
    document.addEventListener("click", function (e) {
      if (isOpen() && !sheet.contains(e.target) && !menuBtn.contains(e.target)) { setOpen(false, false); }
    });
    var wide = window.matchMedia("(min-width: 64rem)");
    var onWide = function () { if (wide.matches && isOpen()) { setOpen(false, false); } };
    if (wide.addEventListener) { wide.addEventListener("change", onWide); }
  }

  /* ---- Copy email, with a selection fallback ---- */
  var copyBtn = document.querySelector(".copy-btn");
  var status = document.getElementById("copy-status");
  var emailNode = document.getElementById("email-text");
  if (copyBtn) {
    copyBtn.hidden = false;
    var timer;

    function say(text, ms) {
      if (status) { status.textContent = text; }
      clearTimeout(timer);
      timer = setTimeout(function () {
        copyBtn.classList.remove("is-copied");
        if (status) { status.textContent = ""; }
      }, ms);
    }
    function selectEmail() {
      if (!emailNode || !window.getSelection) { return; }
      var range = document.createRange();
      range.selectNodeContents(emailNode);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    function copied() {
      copyBtn.classList.add("is-copied");
      say("Email copied.", 2000);
    }
    function fallback() {
      // The button label never changes here, so its width stays put.
      selectEmail();
      var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      say(mac ? "Email selected. Press ⌘C to copy." : "Email selected. Press Ctrl+C to copy.", 4000);
    }

    copyBtn.addEventListener("click", function () {
      var text = copyBtn.getAttribute("data-copy");
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(copied, fallback);
      } else {
        fallback();
      }
    });
  }
})();
