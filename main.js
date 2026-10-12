/* Progressive enhancement only. The page is complete without this file. */
(function () {
  "use strict";

  /* Header gets a hairline once the page scrolls. */
  var header = document.querySelector(".site-header");
  var sentinel = document.querySelector(".scroll-sentinel");
  if (header && sentinel && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      header.classList.toggle("is-scrolled", !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  /* Copy email, with a selection fallback. */
  var copyBtn = document.querySelector(".copy-btn");
  var status = document.getElementById("copy-status");
  var emailNode = document.getElementById("email-text");
  if (!copyBtn) { return; }
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
  function fallback() {
    if (emailNode && window.getSelection) {
      var range = document.createRange();
      range.selectNodeContents(emailNode);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    say(mac ? "Email selected. Press ⌘C to copy." : "Email selected. Press Ctrl+C to copy.", 4000);
  }
  copyBtn.addEventListener("click", function () {
    var text = copyBtn.getAttribute("data-copy");
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () {
        copyBtn.classList.add("is-copied");
        say("Email copied.", 2000);
      }, fallback);
    } else {
      fallback();
    }
  });
})();
