/* photo-editor.js — Telegraaf Horen Product Foto Editor */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  const staat = {
    origineelBlob: null,        // raw uploaded image
    vrijgemaaktBlob: null,      // bg-removed PNG blob
    vrijgemaaktImg: null,       // HTMLImageElement of bg-removed
    achtergrond: 'transparent',
    schaduw: 'geen',
    schaduwIntensiteit: 35,
    schaduwVervaging: 20,
    badge: 'geen',
    badgePlaats: 'rechts-boven',
    logo: false,
    logoPlaats: 'links-onder',
  };

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const uploadZone      = document.getElementById('uploadZone');
  const bestandInput    = document.getElementById('bestandInput');
  const canvasWrapper   = document.getElementById('canvasWrapper');
  const canvas          = document.getElementById('resultCanvas');
  const ctx             = canvas.getContext('2d');
  const progressOverlay = document.getElementById('progressOverlay');
  const progressTekst   = document.getElementById('progressTekst');
  const voortgangFill   = document.getElementById('voortgangFill');
  const editPanel       = document.getElementById('editPanel');
  const nieuwFotoKnop   = document.getElementById('nieuwFotoKnop');
  const kleurKiezer     = document.getElementById('kleurKiezer');
  const schaduwOpties   = document.getElementById('schaduwOpties');
  const badgePlaatsing  = document.getElementById('badgePlaatsing');
  const logoPlaatsingEl = document.getElementById('logoPlaatsing');
  const logoToggle      = document.getElementById('logoToggle');
  const schaduwInt      = document.getElementById('schaduwIntensiteit');
  const schaduwVerv     = document.getElementById('schaduwVervaging');

  // ── Upload handlers ────────────────────────────────────────────────────────
  uploadZone.addEventListener('click', () => bestandInput.click());
  uploadZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') bestandInput.click(); });

  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const bestand = e.dataTransfer.files[0];
    if (bestand) verwerkBestand(bestand);
  });

  bestandInput.addEventListener('change', () => {
    if (bestandInput.files[0]) verwerkBestand(bestandInput.files[0]);
  });

  nieuwFotoKnop.addEventListener('click', resetEditor);

  // ── Background removal ─────────────────────────────────────────────────────
  async function verwerkBestand(bestand) {
    if (!bestand.type.startsWith('image/')) {
      alert('Selecteer een afbeeldingsbestand (JPG, PNG, HEIC).');
      return;
    }
    if (bestand.size > 20 * 1024 * 1024) {
      alert('Bestand is te groot (max 20 MB).');
      return;
    }

    staat.origineelBlob = bestand;

    // Show canvas, hide upload zone
    uploadZone.style.display = 'none';
    canvasWrapper.style.display = 'block';
    toonProgress('Afbeelding laden…', 10);

    try {
      // Draw original first for immediate feedback
      const origUrl = URL.createObjectURL(bestand);
      const origImg = await laadAfbeelding(origUrl);
      tekenCanvas(origImg);
      URL.revokeObjectURL(origUrl);

      toonProgress('AI verwijdert achtergrond…', 30);

      // Run background removal
      const config = {
        progress: (sleutel, voortgang) => {
          if (sleutel === 'compute:inference') {
            const pct = Math.round(30 + voortgang * 60);
            toonProgress('Achtergrond verwijderen…', pct);
          }
        },
        output: { format: 'image/png', quality: 1 }
      };

      const resultaatBlob = await imglyRemoveBg(bestand, config);
      staat.vrijgemaaktBlob = resultaatBlob;

      toonProgress('Bijna klaar…', 95);
      const url = URL.createObjectURL(resultaatBlob);
      const img = await laadAfbeelding(url);
      URL.revokeObjectURL(url);

      staat.vrijgemaaktImg = img;
      verbergProgress();
      tekenCanvasMetEffecten();

      // Show editor
      editPanel.classList.add('zichtbaar');
      nieuwFotoKnop.style.display = 'flex';

    } catch (fout) {
      console.error('[FotoEditor] BG removal fout:', fout);
      verbergProgress();
      // Fallback: show original without bg removal
      const origUrl = URL.createObjectURL(bestand);
      const origImg = await laadAfbeelding(origUrl);
      staat.vrijgemaaktImg = origImg;
      URL.revokeObjectURL(origUrl);
      tekenCanvasMetEffecten();
      editPanel.classList.add('zichtbaar');
      nieuwFotoKnop.style.display = 'flex';
      toonMelding('Achtergrond kon niet worden verwijderd. Bewerk de originele foto.');
    }
  }

  // ── Canvas rendering ───────────────────────────────────────────────────────
  const CANVAS_MAX = 1200; // max export width/height

  function tekenCanvas(img) {
    const ratio = img.naturalHeight / img.naturalWidth;
    const breedte = Math.min(img.naturalWidth, CANVAS_MAX);
    canvas.width  = breedte;
    canvas.height = Math.round(breedte * ratio);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  function tekenCanvasMetEffecten() {
    const img = staat.vrijgemaaktImg;
    if (!img) return;

    const ratio = img.naturalHeight / img.naturalWidth;
    const W = Math.min(img.naturalWidth, CANVAS_MAX);
    const H = Math.round(W * ratio);
    canvas.width  = W;
    canvas.height = H;

    ctx.clearRect(0, 0, W, H);

    // 1. Achtergrond
    tekenAchtergrond(W, H);

    // 2. Schaduw + product
    tekenProductMetSchaduw(img, W, H);

    // 3. Badge
    if (staat.badge !== 'geen') tekenBadge(W, H);

    // 4. Logo
    if (staat.logo) tekenLogo(W, H);
  }

  function tekenAchtergrond(W, H) {
    const bg = staat.achtergrond;
    if (bg === 'transparent') return;

    if (bg.startsWith('gradient-')) {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      if (bg === 'gradient-blauw-teal') {
        grad.addColorStop(0, '#12243E');
        grad.addColorStop(1, '#3AA6B9');
      } else {
        grad.addColorStop(0, '#f0f4f8');
        grad.addColorStop(1, '#dde3ec');
      }
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = bg;
    }
    ctx.fillRect(0, 0, W, H);
  }

  function tekenProductMetSchaduw(img, W, H) {
    const s = staat.schaduw;
    const intens = staat.schaduwIntensiteit / 100;
    const blur   = staat.schaduwVervaging;

    // Margin so shadow doesn't clip
    const marge = s !== 'geen' ? Math.ceil(blur * 2) : 0;
    const prodW = W - marge * 2;
    const prodH = H - marge * 2;
    const prodX = marge;
    const prodY = marge;

    if (s === 'geen') {
      ctx.drawImage(img, 0, 0, W, H);
      return;
    }

    // Draw product into offscreen canvas to get its silhouette
    const offscreen = document.createElement('canvas');
    offscreen.width  = W;
    offscreen.height = H;
    const offCtx = offscreen.getContext('2d');
    offCtx.drawImage(img, prodX, prodY, prodW, prodH);

    // Configure shadow
    ctx.save();
    if (s === 'zacht') {
      ctx.shadowColor   = `rgba(0,0,0,${intens})`;
      ctx.shadowBlur    = blur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.round(H * 0.04);
    } else if (s === 'hard') {
      ctx.shadowColor   = `rgba(0,0,0,${intens})`;
      ctx.shadowBlur    = Math.max(4, blur * 0.3);
      ctx.shadowOffsetX = Math.round(W * 0.02);
      ctx.shadowOffsetY = Math.round(H * 0.04);
    } else if (s === 'zwevend') {
      ctx.shadowColor   = `rgba(0,0,0,${intens})`;
      ctx.shadowBlur    = blur * 1.5;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.round(H * 0.08);
    }

    ctx.drawImage(offscreen, 0, 0);
    ctx.restore();
  }

  // ── Badge rendering ────────────────────────────────────────────────────────
  const BADGE_STIJLEN = {
    nieuw:       { tekst: '✦ Nieuw',       bg: '#27AE60', fg: '#fff' },
    aanbieding:  { tekst: '🏷 Aanbieding', bg: '#e74c3c', fg: '#fff' },
    bestseller:  { tekst: '★ Bestseller',  bg: '#E8961A', fg: '#fff' },
    tip:         { tekst: '💡 Tip',        bg: '#3AA6B9', fg: '#fff' },
  };

  function tekenBadge(W, H) {
    const stijl = BADGE_STIJLEN[staat.badge];
    if (!stijl) return;

    const schaal = W / 600;
    const fz     = Math.round(22 * schaal);
    const pad    = Math.round(10 * schaal);
    const radius = Math.round(8 * schaal);

    ctx.save();
    ctx.font = `bold ${fz}px -apple-system, sans-serif`;
    const tekstBreedte = ctx.measureText(stijl.tekst).width;
    const bW = tekstBreedte + pad * 2.5;
    const bH = fz + pad * 1.6;

    const [bx, by] = badgePlaats(staat.badgePlaats, W, H, bW, bH, Math.round(16 * schaal));

    // Pill background
    ctx.beginPath();
    ctx.moveTo(bx + radius, by);
    ctx.lineTo(bx + bW - radius, by);
    ctx.arcTo(bx + bW, by, bx + bW, by + bH, radius);
    ctx.lineTo(bx + bW, by + bH - radius);
    ctx.arcTo(bx + bW, by + bH, bx + bW - radius, by + bH, radius);
    ctx.lineTo(bx + radius, by + bH);
    ctx.arcTo(bx, by + bH, bx, by + bH - radius, radius);
    ctx.lineTo(bx, by + radius);
    ctx.arcTo(bx, by, bx + radius, by, radius);
    ctx.closePath();
    ctx.fillStyle = stijl.bg;
    ctx.fill();

    // Text
    ctx.fillStyle = stijl.fg;
    ctx.textBaseline = 'middle';
    ctx.fillText(stijl.tekst, bx + pad * 1.25, by + bH / 2);
    ctx.restore();
  }

  function badgePlaats(positie, W, H, bW, bH, marge) {
    const map = {
      'links-boven':   [marge,         marge],
      'midden-boven':  [(W - bW) / 2,  marge],
      'rechts-boven':  [W - bW - marge, marge],
      'links-midden':  [marge,          (H - bH) / 2],
      'midden':        [(W - bW) / 2,   (H - bH) / 2],
      'rechts-midden': [W - bW - marge, (H - bH) / 2],
      'links-onder':   [marge,          H - bH - marge],
      'midden-onder':  [(W - bW) / 2,   H - bH - marge],
      'rechts-onder':  [W - bW - marge, H - bH - marge],
    };
    return map[positie] || [marge, marge];
  }

  // ── Logo rendering ─────────────────────────────────────────────────────────
  function tekenLogo(W, H) {
    const schaal  = W / 600;
    const logoB   = Math.round(160 * schaal);
    const logoH   = Math.round(32 * schaal);
    const marge   = Math.round(18 * schaal);
    const fz      = Math.round(13 * schaal);
    const [lx, ly] = badgePlaats(staat.logoPlaats, W, H, logoB, logoH, marge);

    ctx.save();
    // Semi-transparent pill background
    ctx.fillStyle = 'rgba(18,36,62,0.75)';
    const r = Math.round(6 * schaal);
    ctx.beginPath();
    ctx.moveTo(lx + r, ly);
    ctx.lineTo(lx + logoB - r, ly);
    ctx.arcTo(lx + logoB, ly, lx + logoB, ly + logoH, r);
    ctx.lineTo(lx + logoB, ly + logoH - r);
    ctx.arcTo(lx + logoB, ly + logoH, lx + logoB - r, ly + logoH, r);
    ctx.lineTo(lx + r, ly + logoH);
    ctx.arcTo(lx, ly + logoH, lx, ly + logoH - r, r);
    ctx.lineTo(lx, ly + r);
    ctx.arcTo(lx, ly, lx + r, ly, r);
    ctx.closePath();
    ctx.fill();

    // Logo text
    ctx.fillStyle = '#3AA6B9';
    ctx.font      = `bold ${fz}px -apple-system, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('TELEGRAAF', lx + Math.round(8 * schaal), ly + logoH / 2 - fz * 0.15);

    ctx.fillStyle = '#D1B18A';
    ctx.font      = `${fz}px -apple-system, sans-serif`;
    const offset = ctx.measureText('TELEGRAAF ').width;
    ctx.fillText('HOREN', lx + Math.round(8 * schaal) + offset, ly + logoH / 2 - fz * 0.15);
    ctx.restore();
  }

  // ── Controls ───────────────────────────────────────────────────────────────

  // Background swatches
  document.querySelectorAll('.kleur-swatch').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.kleur-swatch').forEach(s => s.classList.remove('actief'));
      el.classList.add('actief');
      staat.achtergrond = el.dataset.kleur;
      tekenCanvasMetEffecten();
    });
  });

  kleurKiezer.addEventListener('input', () => {
    document.querySelectorAll('.kleur-swatch').forEach(s => s.classList.remove('actief'));
    staat.achtergrond = kleurKiezer.value;
    tekenCanvasMetEffecten();
  });

  // Shadow pills
  document.querySelectorAll('#schaduwKeuze .keuze-pill').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#schaduwKeuze .keuze-pill').forEach(p => p.classList.remove('actief'));
      el.classList.add('actief');
      staat.schaduw = el.dataset.schaduw;
      schaduwOpties.style.display = staat.schaduw === 'geen' ? 'none' : 'block';
      tekenCanvasMetEffecten();
    });
  });

  schaduwInt.addEventListener('input', () => {
    staat.schaduwIntensiteit = parseInt(schaduwInt.value, 10);
    document.getElementById('intensiteitWaarde').textContent = schaduwInt.value + '%';
    tekenCanvasMetEffecten();
  });

  schaduwVerv.addEventListener('input', () => {
    staat.schaduwVervaging = parseInt(schaduwVerv.value, 10);
    document.getElementById('vervagingWaarde').textContent = schaduwVerv.value + 'px';
    tekenCanvasMetEffecten();
  });

  // Badge buttons
  document.querySelectorAll('#badgeKeuze .badge-knop').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#badgeKeuze .badge-knop').forEach(b => b.classList.remove('actief'));
      el.classList.add('actief');
      staat.badge = el.dataset.badge;
      badgePlaatsing.style.display = staat.badge === 'geen' ? 'none' : 'block';
      tekenCanvasMetEffecten();
    });
  });

  // Badge position grid
  document.querySelectorAll('#positieGrid .positie-cel').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#positieGrid .positie-cel').forEach(c => c.classList.remove('actief'));
      el.classList.add('actief');
      staat.badgePlaats = el.dataset.pos;
      tekenCanvasMetEffecten();
    });
  });

  // Logo toggle
  logoToggle.addEventListener('change', () => {
    staat.logo = logoToggle.checked;
    logoPlaatsingEl.style.display = staat.logo ? 'block' : 'none';
    tekenCanvasMetEffecten();
  });

  // Logo position grid
  document.querySelectorAll('#logoPlaatsingGrid .positie-cel').forEach((el) => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#logoPlaatsingGrid .positie-cel').forEach(c => c.classList.remove('actief'));
      el.classList.add('actief');
      staat.logoPlaats = el.dataset.lpos;
      tekenCanvasMetEffecten();
    });
  });

  // ── Download ───────────────────────────────────────────────────────────────
  document.getElementById('downloadPNG').addEventListener('click', () => {
    downloadCanvas('png', 'product-foto.png');
  });

  document.getElementById('downloadJPG').addEventListener('click', () => {
    downloadCanvas('jpeg', 'product-foto.jpg');
  });

  function downloadCanvas(formaat, bestandsnaam) {
    const mime = 'image/' + formaat;
    const kwaliteit = formaat === 'jpeg' ? 0.93 : undefined;

    // For JPG with transparent background, add white bg first
    if (formaat === 'jpeg' && staat.achtergrond === 'transparent') {
      const tijdelijk = document.createElement('canvas');
      tijdelijk.width  = canvas.width;
      tijdelijk.height = canvas.height;
      const tCtx = tijdelijk.getContext('2d');
      tCtx.fillStyle = '#ffffff';
      tCtx.fillRect(0, 0, tijdelijk.width, tijdelijk.height);
      tCtx.drawImage(canvas, 0, 0);
      trigger(tijdelijk.toDataURL(mime, kwaliteit), bestandsnaam);
    } else {
      trigger(canvas.toDataURL(mime, kwaliteit), bestandsnaam);
    }
  }

  function trigger(dataUrl, naam) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = naam;
    a.click();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function laadAfbeelding(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  function toonProgress(tekst, pct) {
    progressOverlay.classList.add('actief');
    progressTekst.textContent = tekst;
    voortgangFill.style.width = pct + '%';
  }

  function verbergProgress() {
    progressOverlay.classList.remove('actief');
    voortgangFill.style.width = '0%';
  }

  function toonMelding(tekst) {
    const el = document.createElement('p');
    el.style.cssText = 'color:#E8961A;font-size:.85rem;text-align:center;margin:8px 0;';
    el.textContent = tekst;
    canvasWrapper.insertAdjacentElement('afterend', el);
    setTimeout(() => el.remove(), 6000);
  }

  function resetEditor() {
    staat.origineelBlob   = null;
    staat.vrijgemaaktBlob = null;
    staat.vrijgemaaktImg  = null;
    staat.achtergrond     = 'transparent';
    staat.schaduw         = 'geen';
    staat.badge           = 'geen';
    staat.logo            = false;

    uploadZone.style.display = '';
    canvasWrapper.style.display = 'none';
    editPanel.classList.remove('zichtbaar');
    nieuwFotoKnop.style.display = 'none';
    bestandInput.value = '';

    // Reset UI state
    document.querySelectorAll('.kleur-swatch').forEach(s => s.classList.remove('actief'));
    document.querySelector('.kleur-swatch.kleur-transparant').classList.add('actief');
    document.querySelectorAll('#schaduwKeuze .keuze-pill').forEach(p => p.classList.remove('actief'));
    document.querySelector('[data-schaduw="geen"]').classList.add('actief');
    document.querySelectorAll('#badgeKeuze .badge-knop').forEach(b => b.classList.remove('actief'));
    document.querySelector('[data-badge="geen"]').classList.add('actief');
    schaduwOpties.style.display = 'none';
    badgePlaatsing.style.display = 'none';
    logoPlaatsingEl.style.display = 'none';
    logoToggle.checked = false;
  }

})();
