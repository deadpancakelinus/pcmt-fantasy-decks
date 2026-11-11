// The site version at the bottom of every page ([data-pcmt-version]), set on the backend (Patch notes tab, Current version)
// and kept in Supabase site_settings (key 'version'). The last one seen is remembered so it shows straight away next time.
// league.js loads this on the built pages; the hand-written pages load it themselves.
(function () {
  'use strict';
  if (window.PCMT_VERSION_JS) return;
  window.PCMT_VERSION_JS = true;
  var URL0 = 'https://wwrsavqipkxvdsxcemos.supabase.co', KEY = 'sb_publishable_e8v-uyAo4fnvwJCHUVA5FQ_LXR6yYM7';
  var v = null;
  try { v = localStorage.getItem('pcmt-version'); } catch (e) {}
  function apply() {
    if (!v) return;
    var t = 'Version ' + v, els = document.querySelectorAll('[data-pcmt-version]');
    for (var i = 0; i < els.length; i++) if (els[i].textContent !== t) els[i].textContent = t;
  }
  window.PCMT_SET_VERSION = function (x) {   // the backend calls this after saving, so its own page updates too
    v = String(x || '').trim() || v; try { localStorage.setItem('pcmt-version', v); } catch (e) {} apply();
  };
  // The built pages draw their footer after this runs, and can redraw it: put the version back whenever they do.
  if (window.MutationObserver) new MutationObserver(function () { if (v) apply(); }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
  fetch(URL0 + '/rest/v1/site_settings?select=value&key=eq.version', { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) { if (rows && rows[0] && rows[0].value) window.PCMT_SET_VERSION(rows[0].value); })
    .catch(function () {});
})();
