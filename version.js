// The site version at the bottom of every page ([data-pcmt-version]), set on the backend (Patch notes tab, Current version)
// and kept in Supabase site_settings (key 'version'). The last one seen is remembered so it shows straight away next time.
// league.js loads this on the built pages; the hand-written pages load it themselves.
// Patch notes window: when staff update the version with a "What's new" note (site_settings key 'version_note':
// { version, text, at }), every visitor gets it once in a window over whatever page they're on. Seen notes are kept in
// localStorage 'pcmt-patch-seen' (the note's `at`), so it shows once per browser. Not on the backend.
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

  // ---------- patch notes window ----------
  var onBackend = /(^|\/)backend\.html$/.test(location.pathname);
  function seen(at) { try { return localStorage.getItem('pcmt-patch-seen') === at; } catch (e) { return true; } }
  function markSeen(at) { try { localStorage.setItem('pcmt-patch-seen', at); } catch (e) {} }
  function patchWindow(note, preview) {
    if (!note || !String(note.text || '').trim()) return;
    if (!preview && (onBackend || !note.at || seen(note.at))) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded', function () { patchWindow(note, preview); }); return; }
    if (document.getElementById('pcmt-patch')) return;
    var back = document.createElement('div'), prev = document.activeElement;
    back.id = 'pcmt-patch';
    back.style.cssText = 'position:fixed;inset:0;z-index:2147483100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,9,10,.72)';
    var box = document.createElement('div');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'pcmt-patch-h');
    box.style.cssText = 'width:100%;max-width:560px;max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;' +
      'padding:26px 26px 22px;border-radius:14px;border:1px solid #3a4f53;background:#111a1c;color:#eaf4f4;box-shadow:0 24px 70px rgba(0,0,0,.55);' +
      "font-family:'National Park',system-ui,sans-serif;line-height:1.55;font-size:15px";
    var k = document.createElement('p');
    k.style.cssText = 'margin:0;font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#a5dcdd';
    k.textContent = 'fantasy.pcmt.gg has been updated';
    var h = document.createElement('h2');
    h.id = 'pcmt-patch-h';
    h.style.cssText = "margin:0;font-family:'Cabin Sketch',cursive;font-weight:700;font-size:32px;line-height:1.1";
    h.textContent = note.version ? 'Patch Notes ' + note.version : 'Patch Notes';
    box.appendChild(k); box.appendChild(h);
    String(note.text).replace(/\r/g, '').split(/\n\s*\n/).forEach(function (para) {   // one paragraph per blank line
      if (!para.trim()) return;
      var p = document.createElement('p');
      p.style.cssText = 'margin:0;white-space:pre-line;overflow-wrap:anywhere';
      p.textContent = para.trim();
      box.appendChild(p);
    });
    var ok = document.createElement('button');
    ok.type = 'button'; ok.textContent = 'OK';
    ok.style.cssText = 'align-self:flex-end;min-height:48px;padding:0 28px;border-radius:10px;border:0;background:#a5dcdd;color:#000;font:inherit;font-weight:700;letter-spacing:.06em;cursor:pointer';
    box.appendChild(ok);
    back.appendChild(box);
    function close() {
      if (!preview) markSeen(note.at);
      back.remove(); document.removeEventListener('keydown', key, true);
      try { if (prev && prev.focus) prev.focus(); } catch (e) {}
    }
    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') { e.preventDefault(); ok.focus(); }   // the only control in the window
    }
    ok.addEventListener('click', close);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    if (!preview) markSeen(note.at);   // counts as seen once it's up, even if the page is closed without pressing OK
    setTimeout(function () { try { ok.focus({ preventScroll: true }); } catch (e) {} }, 0);
  }
  window.PCMT_SHOW_PATCH = function (note) { patchWindow(note, true); };   // the backend's Preview button

  fetch(URL0 + '/rest/v1/site_settings?select=key,value&key=in.(version,version_note)', { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) {
      var by = {};
      (rows || []).forEach(function (r) { by[r.key] = r.value; });
      if (by.version) window.PCMT_SET_VERSION(by.version);
      var note = null;
      try { note = typeof by.version_note === 'string' ? JSON.parse(by.version_note) : by.version_note; } catch (e) {}
      // Wait for the page's own loading screen to finish before showing it.
      if (note) setTimeout(function () { patchWindow(note); }, 1600);
    })
    .catch(function () {});
})();
