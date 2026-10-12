/* Theme switch: follows the system setting until the visitor picks one, then remembers it. */
(function () {
  var root = document.documentElement;
  var KEY = 'northlink-theme';
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);

  var sys = window.matchMedia('(prefers-color-scheme: dark)');
  function current() {
    var t = root.getAttribute('data-theme');
    return t || (sys.matches ? 'dark' : 'light');
  }
  function label(btn) {
    var next = current() === 'dark' ? 'light' : 'dark';
    btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
  }
  document.addEventListener('DOMContentLoaded', function () {
    var btns = document.querySelectorAll('[data-theme-toggle]');
    btns.forEach(function (btn) {
      label(btn);
      btn.addEventListener('click', function () {
        var next = current() === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem(KEY, next); } catch (e) {}
        btns.forEach(label);
      });
    });
    sys.addEventListener('change', function () { btns.forEach(label); });
  });
})();
