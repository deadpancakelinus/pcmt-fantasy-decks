// The Freshbatch window: opens from "Freshbatch" in every page footer (any element with data-freshbatch).
// Plays the Freshbatch animation (no sound, on a loop) above the team credits.
(function () {
  var TEAM = 'Liam, Clutch, Markus, and Linus';
  var THANKS = 'Night, Sting, and Toxic';
  var dlg = null, film = null, opener = null;

  function build() {
    var css = document.createElement('style');
    css.textContent =
      // Frosted glass: the page shows through, blurred.
      '.fb-dlg{width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 32px);padding:0;border:1px solid rgba(255,255,255,.18);border-radius:20px;color:#eaf4f4;overflow:auto;' +
      'background:linear-gradient(145deg,rgba(255,255,255,.14),rgba(255,255,255,.04) 45%,rgba(165,220,221,.08));' +
      '-webkit-backdrop-filter:blur(22px) saturate(160%);backdrop-filter:blur(22px) saturate(160%);' +
      'box-shadow:0 24px 80px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.22)}' +
      '.fb-dlg::backdrop{background:rgba(5,10,12,.25)}' +
      '@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.fb-dlg{background:rgba(23,33,36,.96)}}' +
      '.fb-film{margin:12px 12px 0;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.25)}' +
      '.fb-film{aspect-ratio:16/9;background:#f7ecdc}' +
      '.fb-film video{display:block;width:100%;height:100%;object-fit:cover}' +
      '.fb-body{padding:22px;display:flex;flex-direction:column;gap:12px;font-family:"Space Grotesk",system-ui,sans-serif}' +
      '.fb-k{font:400 12px/1 "JetBrains Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:#c4d4d4;margin:0}' +
      '.fb-names{margin:0;font:700 28px/1.15 "Cabin Sketch",cursive;color:#eaf4f4}' +
      '.fb-thanks{margin:6px 0 0;font-size:16px;line-height:1.5;color:#c4d4d4}' +
      '.fb-thanks b{color:#a5dcdd;font-weight:600}' +
      '.fb-close{align-self:flex-start;margin-top:6px;min-height:44px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.08);color:#eaf4f4;font:600 13px/1 "JetBrains Mono",monospace;cursor:pointer}' +
      '.fb-close:hover{border-color:#a5dcdd}.fb-close:focus-visible{outline:none;border-color:#a5dcdd;box-shadow:0 0 0 3px rgba(165,220,221,.3)}' +
      '[data-freshbatch]{font:inherit;font-weight:700;color:#eaf4f4;background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(165,220,221,.5);text-underline-offset:3px}' +
      '[data-freshbatch]:hover{color:#a5dcdd}[data-freshbatch]:focus-visible{outline:2px solid #a5dcdd;outline-offset:2px;border-radius:2px}';
    document.head.appendChild(css);
    dlg = document.createElement('dialog');
    dlg.className = 'fb-dlg';
    dlg.setAttribute('aria-labelledby', 'fb-title');
    dlg.innerHTML =
      '<div class="fb-film"><video src="media/freshbatch-intro.mp4" muted loop playsinline preload="none" aria-label="Freshbatch animation"></video></div>' +
      '<div class="fb-body">' +
      '<p class="fb-k" id="fb-title">Freshbatch is</p>' +
      '<p class="fb-names">' + TEAM + '</p>' +
      '<p class="fb-thanks">Special thanks to <b>' + THANKS + '</b></p>' +
      '<button type="button" class="fb-close">Close</button>' +
      '</div>';
    document.body.appendChild(dlg);
    film = dlg.querySelector('video');
    dlg.querySelector('.fb-close').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });   // click outside the window
    dlg.addEventListener('close', function () { film.pause(); if (opener && opener.focus) opener.focus(); });
  }

  function open(btn) {
    if (!dlg) build();
    opener = btn;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    dlg.querySelector('.fb-close').focus();
    film.muted = true;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {   // no motion: just the logo frame
      film.preload = 'auto';
      film.addEventListener('loadedmetadata', function () { film.currentTime = Math.max(0, film.duration - 0.05); }, { once: true });
      film.load();
      return;
    }
    var p = film.play();
    if (p && p.catch) p.catch(function () {});
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-freshbatch]');
    if (b) { e.preventDefault(); open(b); }
  });
})();
