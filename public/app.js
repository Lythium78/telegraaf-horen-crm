/* ============================================================
   Telegraaf Horen CRM - Frontend Applicatie
   ============================================================ */

// ============================================================
// STATE
// ============================================================
let huidigeSecties  = 'dashboard';
let leads           = [];
let contacts        = [];
let taken           = [];
let bestellingen    = [];
let currentUser     = null;

// Klanten detail state
let huidigKlantId   = null;
let huidigLeadId    = null;
let bevestigCallback = null;

// Pipeline filter staat
let pipelineFilter  = 'alle';

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await laadHuidigeGebruiker();
  setupNavigatie();
  setupModals();
  setupFormulieren();
  setupFilters();
  await laadDashboard();
}

// ============================================================
// API HELPER
// ============================================================
async function apiFetch(url, opties = {}) {
  const standaard = {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opties.headers || {}) }
  };
  const resp = await fetch(url, { ...standaard, ...opties });
  if (resp.status === 401) {
    window.location.href = '/login';
    return null;
  }
  return resp;
}

// ============================================================
// BEVEILIGING
// ============================================================
function escapeHtml(tekst) {
  if (tekst === null || tekst === undefined) return '';
  const kaart = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(tekst).replace(/[&<>"']/g, t => kaart[t]);
}

// ============================================================
// DATUM HELPERS
// ============================================================
function formatDatum(datumStr) {
  if (!datumStr) return '-';
  const d = new Date(datumStr);
  if (isNaN(d)) return '-';
  const dag   = String(d.getDate()).padStart(2, '0');
  const maand = String(d.getMonth() + 1).padStart(2, '0');
  const jaar  = d.getFullYear();
  return `${dag}-${maand}-${jaar}`;
}

function formatDatumTijd(datumStr) {
  if (!datumStr) return '-';
  const d = new Date(datumStr);
  if (isNaN(d)) return '-';
  const dag   = String(d.getDate()).padStart(2, '0');
  const maand = String(d.getMonth() + 1).padStart(2, '0');
  const jaar  = d.getFullYear();
  const uur   = String(d.getHours()).padStart(2, '0');
  const min   = String(d.getMinutes()).padStart(2, '0');
  return `${dag}-${maand}-${jaar} ${uur}:${min}`;
}

function vandaagIso() {
  return new Date().toISOString().split('T')[0];
}

function datumIsVerlopen(datumStr) {
  if (!datumStr) return false;
  return new Date(datumStr) < new Date(vandaagIso());
}

// ============================================================
// TOAST NOTIFICATIES
// ============================================================
function toonToast(bericht, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = bericht;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-weggaan');
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

// ============================================================
// BEVESTIGINGSDIALOOG
// ============================================================
function toonBevestiging(vraag, tekst, callback) {
  document.getElementById('bevestig-vraag').textContent = vraag;
  document.getElementById('bevestig-tekst').textContent = tekst;
  bevestigCallback = callback;
  openModal('bevestig-dialoog');
}

// ============================================================
// MODALS
// ============================================================
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function sluitModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

function setupModals() {
  // Alle sluit-knoppen
  document.querySelectorAll('.modal-sluit, .modal-annuleer').forEach(knop => {
    knop.addEventListener('click', () => {
      const modalId = knop.dataset.modal;
      if (modalId) sluitModal(modalId);
    });
  });

  // Klik buiten modal sluit hem
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) sluitModal(modal.id);
    });
  });

  // Bevestigingsdialoog knoppen
  document.getElementById('bevestig-ja').addEventListener('click', () => {
    sluitModal('bevestig-dialoog');
    if (bevestigCallback) bevestigCallback();
    bevestigCallback = null;
  });

  document.getElementById('bevestig-nee').addEventListener('click', () => {
    sluitModal('bevestig-dialoog');
    bevestigCallback = null;
  });
}

// ============================================================
// NAVIGATIE
// ============================================================
function setupNavigatie() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const sectie = item.dataset.section;
      schakelSectie(sectie);
    });
  });

  document.getElementById('btn-uitloggen').addEventListener('click', async () => {
    await apiFetch('/logout');
    window.location.href = '/login';
  });
}

async function schakelSectie(sectie) {
  // Verberg alle secties
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Toon gewenste sectie
  const sEl = document.getElementById(`section-${sectie}`);
  const nEl = document.querySelector(`.nav-item[data-section="${sectie}"]`);
  if (sEl) sEl.classList.add('active');
  if (nEl) nEl.classList.add('active');

  huidigeSecties = sectie;

  // Laad sektie data
  switch (sectie) {
    case 'dashboard':    await laadDashboard(); break;
    case 'leads':        await laadLeads(); break;
    case 'klanten':      await laadKlanten(); break;
    case 'taken':        await laadTaken(); break;
    case 'bestellingen': await laadBestellingen(); break;
    case 'nazorg':       await laadNazorg(); break;
  }
}

// ============================================================
// HUIDIGE GEBRUIKER
// ============================================================
async function laadHuidigeGebruiker() {
  try {
    const resp = await apiFetch('/api/mij');
    if (!resp) return;
    const data = await resp.json();
    if (data.success) {
      currentUser = data.data;
      document.getElementById('sidebar-user-name').textContent = currentUser.naam;
      const avatar = document.getElementById('user-avatar');
      avatar.textContent = currentUser.naam.charAt(0).toUpperCase();
    }
  } catch (err) {
    console.error('[APP] Fout bij laden gebruiker:', err);
  }
}

// ============================================================
// DASHBOARD
// ============================================================
async function laadDashboard() {
  // Datum tonen
  const nu = new Date();
  const opties = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('dashboard-datum').textContent = nu.toLocaleDateString('nl-NL', opties);

  // Stats
  try {
    const resp = await apiFetch('/api/stats');
    if (!resp) return;
    const data = await resp.json();
    if (data.success) {
      const s = data.data;
      const setnr = (id, waarde) => {
        const el = document.querySelector(`#${id} .stat-number`);
        if (el) el.textContent = waarde ?? '-';
      };
      setnr('stat-leads',       s.actieve_leads ?? '-');
      setnr('stat-klanten',     s.totaal_klanten ?? '-');
      setnr('stat-taken',       s.open_taken ?? '-');
      setnr('stat-bestellingen', s.bestellingen_in_behandeling ?? '-');
    }
  } catch (err) {
    console.error('[APP] Fout bij laden stats:', err);
  }

  // Aankomende nazorg
  try {
    const resp = await apiFetch('/api/nazorg/aankomend');
    if (!resp) return;
    const data = await resp.json();
    const container = document.getElementById('dashboard-nazorg');
    if (data.success && data.data && data.data.length > 0) {
      const rijen = data.data.slice(0, 5).map(r => `
        <div class="taak-rij">
          <span class="taak-titel">${escapeHtml(r.contact_naam || r.naam || '-')}</span>
          <span class="rij-info">${escapeHtml(r.merk || '')} ${escapeHtml(r.type || '')}</span>
          <span class="taak-deadline">${formatDatum(r.checkup_datum || r.herinnering_datum)}</span>
        </div>
      `).join('');
      container.innerHTML = rijen;
    } else {
      container.innerHTML = '<p class="lege-staat">Geen aankomende nazorg</p>';
    }
  } catch (err) {
    console.error('[APP] Fout bij laden nazorg:', err);
    document.getElementById('dashboard-nazorg').innerHTML = '<p class="lege-staat">Kon nazorg niet laden</p>';
  }

  // Mijn taken vandaag
  await laadDashboardTaken();
}

async function laadDashboardTaken() {
  const container = document.getElementById('dashboard-taken');
  try {
    const resp = await apiFetch('/api/taken');
    if (!resp) return;
    const data = await resp.json();
    if (!data.success) { container.innerHTML = '<p class="lege-staat">Kon taken niet laden</p>'; return; }

    const mijnTaken = data.data.filter(t =>
      t.status !== 'afgerond' &&
      (!t.eigenaar_id || (currentUser && t.eigenaar_id === currentUser.id))
    ).slice(0, 6);

    if (mijnTaken.length === 0) {
      container.innerHTML = '<p class="lege-staat">Geen open taken voor vandaag</p>';
      return;
    }

    container.innerHTML = mijnTaken.map(t => {
      const verlopen = t.deadline && datumIsVerlopen(t.deadline);
      return `
        <div class="taak-rij">
          <span class="badge badge-${escapeHtml(t.status)}">${statusTaakLabel(t.status)}</span>
          <span class="taak-titel">${escapeHtml(t.titel)}</span>
          <span class="taak-deadline ${verlopen ? 'verlopen' : ''}">${t.deadline ? formatDatum(t.deadline) : ''}</span>
          <button class="btn btn-small btn-secondary" data-taak-id="${t.id}" data-actie="afronden">Afronden</button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-actie="afronden"]').forEach(knop => {
      knop.addEventListener('click', () => taakAfronden(Number(knop.dataset.taakId)));
    });
  } catch (err) {
    console.error('[APP] Fout bij laden taken dashboard:', err);
    container.innerHTML = '<p class="lege-staat">Kon taken niet laden</p>';
  }
}

// ============================================================
// LEADS
// ============================================================
function setupFilters() {
  // Pipeline klikken
  document.querySelectorAll('.pipeline-fase').forEach(fase => {
    fase.addEventListener('click', () => {
      pipelineFilter = fase.dataset.fase;
      document.querySelectorAll('.pipeline-fase').forEach(f => f.classList.remove('actief'));
      fase.classList.add('actief');
      renderLeadsLijst();
    });
  });

  // Zoekbalk leads
  document.getElementById('leads-zoek').addEventListener('input', renderLeadsLijst);
  document.getElementById('leads-filter-herkomst').addEventListener('change', renderLeadsLijst);

  // Zoekbalk klanten
  document.getElementById('klanten-zoek').addEventListener('input', renderKlantenLijst);

  // Taken filter
  document.getElementById('taken-filter-status').addEventListener('change', laadTaken);

  // Bestellingen filter
  document.getElementById('bestellingen-filter-status').addEventListener('change', laadBestellingen);
}

async function laadLeads() {
  try {
    const resp = await apiFetch('/api/leads');
    if (!resp) return;
    const data = await resp.json();
    if (data.success) {
      leads = data.data;
      updatePipelineTellers();
      renderLeadsLijst();
    } else {
      document.getElementById('leads-lijst').innerHTML = '<p class="lege-staat">Kon leads niet laden</p>';
    }
  } catch (err) {
    console.error('[APP] Fout bij laden leads:', err);
    document.getElementById('leads-lijst').innerHTML = '<p class="lege-staat">Fout bij het laden</p>';
  }
}

function updatePipelineTellers() {
  const fasen = ['alle', 'lead', 'gekwalificeerd', 'intake_gepland', 'klant', 'inactief'];
  fasen.forEach(fase => {
    const aantal = fase === 'alle' ? leads.length : leads.filter(l => l.status === fase).length;
    const el = document.getElementById(`pipe-${fase}`);
    if (el) el.textContent = aantal;
  });
}

function renderLeadsLijst() {
  const zoekterm = document.getElementById('leads-zoek').value.toLowerCase().trim();
  const herkomstFilter = document.getElementById('leads-filter-herkomst').value;
  const container = document.getElementById('leads-lijst');

  let gefilterd = leads;

  if (pipelineFilter !== 'alle') {
    gefilterd = gefilterd.filter(l => l.status === pipelineFilter);
  }

  if (zoekterm) {
    gefilterd = gefilterd.filter(l => (l.naam || '').toLowerCase().includes(zoekterm));
  }

  if (herkomstFilter) {
    gefilterd = gefilterd.filter(l => l.herkomst === herkomstFilter);
  }

  if (gefilterd.length === 0) {
    container.innerHTML = '<p class="lege-staat">Geen leads gevonden</p>';
    return;
  }

  container.innerHTML = gefilterd.map(lead => `
    <div class="lijst-rij" data-lead-id="${lead.id}">
      <span class="rij-naam">${escapeHtml(lead.naam)}</span>
      <div class="rij-meta">
        ${lead.herkomst ? `<span class="badge badge-herkomst">${escapeHtml(lead.herkomst)}</span>` : ''}
        <span class="badge badge-${escapeHtml(lead.status)}">${statusPipelineLabel(lead.status)}</span>
        ${lead.telefoon ? `<span class="rij-info">${escapeHtml(lead.telefoon)}</span>` : ''}
        <span class="rij-info">${formatDatum(lead.aangemaakt_op || lead.datum)}</span>
      </div>
      <div class="rij-acties">
        <button class="btn btn-small btn-secondary" data-actie="bewerken" data-id="${lead.id}">Bewerken</button>
        <button class="btn btn-small btn-danger" data-actie="verwijderen" data-id="${lead.id}">Verwijderen</button>
      </div>
    </div>
  `).join('');

  // Events op de rijen
  container.querySelectorAll('.lijst-rij').forEach(rij => {
    rij.addEventListener('click', (e) => {
      if (e.target.closest('[data-actie]')) return;
      // TODO: detail panel leads (toekomstige uitbreiding)
    });
  });

  container.querySelectorAll('[data-actie="bewerken"]').forEach(knop => {
    knop.addEventListener('click', (e) => {
      e.stopPropagation();
      bewerkLead(Number(knop.dataset.id));
    });
  });

  container.querySelectorAll('[data-actie="verwijderen"]').forEach(knop => {
    knop.addEventListener('click', (e) => {
      e.stopPropagation();
      verwijderLead(Number(knop.dataset.id));
    });
  });
}

function statusPipelineLabel(status) {
  const labels = {
    lead: 'Lead',
    gekwalificeerd: 'Gekwalificeerd',
    intake_gepland: 'Intake Gepland',
    klant: 'Geworden Klant',
    inactief: 'Inactief'
  };
  return labels[status] || escapeHtml(status);
}

// ============================================================
// LEADS FORMULIER
// ============================================================
function setupFormulieren() {
  // Lead formulier
  document.getElementById('btn-nieuwe-lead').addEventListener('click', () => {
    document.getElementById('form-lead').reset();
    document.getElementById('lead-id').value = '';
    document.getElementById('modal-lead-titel').textContent = 'Nieuwe Lead';
    document.getElementById('lead-datum').value = vandaagIso();
    openModal('modal-lead');
  });

  document.getElementById('form-lead').addEventListener('submit', async (e) => {
    e.preventDefault();
    await slaLeadOp();
  });

  // Klant formulier
  document.getElementById('btn-nieuwe-klant').addEventListener('click', () => {
    document.getElementById('form-klant').reset();
    document.getElementById('klant-id').value = '';
    document.getElementById('modal-klant-titel').textContent = 'Nieuwe Klant';
    openModal('modal-klant');
  });

  document.getElementById('form-klant').addEventListener('submit', async (e) => {
    e.preventDefault();
    await slaKlantOp();
  });

  // Klant detail knoppen
  document.getElementById('btn-klant-bewerken').addEventListener('click', () => {
    if (huidigKlantId) bewerkKlant(huidigKlantId);
  });

  document.getElementById('btn-klant-verwijderen').addEventListener('click', () => {
    if (huidigKlantId) verwijderKlant(huidigKlantId);
  });

  document.getElementById('btn-klant-sluiten').addEventListener('click', () => {
    document.getElementById('klant-detail').classList.add('verborgen');
    document.querySelectorAll('.klant-kaart').forEach(k => k.classList.remove('geselecteerd'));
    huidigKlantId = null;
  });

  // Detail tabs klanten
  document.querySelectorAll('.detail-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabNaam = tab.dataset.tab;
      document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('actief'));
      document.querySelectorAll('.detail-tab-inhoud').forEach(i => i.classList.remove('actief'));
      tab.classList.add('actief');
      const inhoudEl = document.getElementById(`tab-${tabNaam}`);
      if (inhoudEl) inhoudEl.classList.add('actief');

      if (huidigKlantId) {
        if (tabNaam === 'hoortoestellen') laadHoortoestellen(huidigKlantId);
        if (tabNaam === 'notities') laadKlantNotities(huidigKlantId);
        if (tabNaam === 'bestellingen-klant') laadKlantBestellingen(huidigKlantId);
      }
    });
  });

  // Hoortoestel formulier
  document.getElementById('btn-nieuw-hoortoestel').addEventListener('click', () => {
    document.getElementById('form-hoortoestel').reset();
    document.getElementById('hoortoestel-id').value = '';
    document.getElementById('modal-hoortoestel-titel').textContent = 'Hoortoestel Toevoegen';
    openModal('modal-hoortoestel');
  });

  document.getElementById('form-hoortoestel').addEventListener('submit', async (e) => {
    e.preventDefault();
    await slaHoortoestelOp();
  });

  // Notitie formulier
  document.getElementById('btn-nieuwe-notitie-klant').addEventListener('click', () => {
    document.getElementById('form-notitie').reset();
    document.getElementById('notitie-resource-type').value = 'contact';
    document.getElementById('notitie-resource-id').value = huidigKlantId;
    document.getElementById('modal-notitie-titel').textContent = 'Notitie Toevoegen';
    openModal('modal-notitie');
  });

  document.getElementById('form-notitie').addEventListener('submit', async (e) => {
    e.preventDefault();
    await slaNotitieOp();
  });

  // Taak formulier
  document.getElementById('btn-nieuwe-taak').addEventListener('click', () => {
    document.getElementById('form-taak').reset();
    document.getElementById('taak-id').value = '';
    document.getElementById('modal-taak-titel').textContent = 'Nieuwe Taak';
    vulKlantenInTaakSelect();
    openModal('modal-taak');
  });

  document.getElementById('form-taak').addEventListener('submit', async (e) => {
    e.preventDefault();
    await slaTaakOp();
  });

  // Bestelling formulier
  document.getElementById('btn-regel-toevoegen').addEventListener('click', voegBestellingRegelToe);

  document.getElementById('bestelling-regels').addEventListener('click', (e) => {
    if (e.target.classList.contains('regel-verwijder')) {
      const regels = document.getElementById('bestelling-regels');
      if (regels.children.length > 1) {
        e.target.closest('.bestelling-regel').remove();
      }
    }
  });

  document.getElementById('form-bestelling').addEventListener('submit', async (e) => {
    e.preventDefault();
    await slaBestellingOp();
  });

  // Bestelling vanuit klantdetail
  document.getElementById('btn-nieuwe-bestelling-klant').addEventListener('click', () => {
    if (!huidigKlantId) return;
    const klant = contacts.find(c => c.id === huidigKlantId);
    openBestellingModal(huidigKlantId, klant ? klant.naam : '');
  });
}

async function slaLeadOp() {
  const id = document.getElementById('lead-id').value;
  const payload = {
    naam:     document.getElementById('lead-naam').value.trim(),
    telefoon: document.getElementById('lead-telefoon').value.trim(),
    email:    document.getElementById('lead-email').value.trim(),
    herkomst: document.getElementById('lead-herkomst').value,
    status:   document.getElementById('lead-status').value,
    datum:    document.getElementById('lead-datum').value,
    notitie:  document.getElementById('lead-notitie').value.trim()
  };

  if (!payload.naam) { toonToast('Naam is verplicht', 'fout'); return; }

  try {
    const methode = id ? 'PUT' : 'POST';
    const url = id ? `/api/leads/${id}` : '/api/leads';
    const resp = await apiFetch(url, { method: methode, body: JSON.stringify(payload) });
    if (!resp) return;
    const data = await resp.json();
    if (data.success) {
      sluitModal('modal-lead');
      toonToast(id ? 'Lead bijgewerkt' : 'Lead aangemaakt', 'succes');
      await laadLeads();
    } else {
      toonToast('Fout: ' + (data.error || 'Onbekende fout'), 'fout');
    }
  } catch (err) {
    console.error('[APP] Fout bij opslaan lead:', err);
    toonToast('Fout bij het opslaan', 'fout');
  }
}

function bewerkLead(id) {
  const lead = leads.find(l => l.id === id);
  if (!lead) return;
  document.getElementById('lead-id').value = lead.id;
  document.getElementById('lead-naam').value = lead.naam || '';
  document.getElementById('lead-telefoon').value = lead.telefoon || '';
  document.getElementById('lead-email').value = lead.email || '';
  document.getElementById('lead-herkomst').value = lead.herkomst || '';
  document.getElementById('lead-status').value = lead.status || 'lead';
  document.getElementById('lead-datum').value = (lead.datum || lead.aangemaakt_op || '').substring(0, 10);
  document.getElementById('lead-notitie').value = lead.notitie || '';
  document.getElementById('modal-lead-titel').textContent = 'Lead Bewerken';
  openModal('modal-lead');
}

function verwijderLead(id) {
  const lead = leads.find(l => l.id === id);
  if (!lead) return;
  toonBevestiging(
    'Lead verwijderen?',
    `Weet u zeker dat u "${lead.naam}" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`,
    async () => {
      try {
        const resp = await apiFetch(`/api/leads/${id}`, { method: 'DELETE' });
        if (!resp) return;
        const data = await resp.json();
        if (data.success) {
          toonToast('Lead verwijderd', 'succes');
          await laadLeads();
        } else {
          toonToast('Fout: ' + (data.error || 'Onbekende fout'), 'fout');
        }
      } catch (err) {
        toonToast('Fout bij verwijderen', 'fout');
      }
    }
  );
}

// ============================================================
// KLANTEN
// ============================================================
async function laadKlanten() {
  try {
    const resp = await apiFetch('/api/contacts');
    if (!resp) return;
    const data = await resp.json();
    if (data.success) {
      contacts = data.data;
      renderKlantenLijst();
    } else {
      document.getElementById('klanten-lijst').innerHTML = '<p class="lege-staat">Kon klanten niet laden</p>';
    }
  } catch (err) {
    console.error('[APP] Fout bij laden klanten:', err);
    document.getElementById('klanten-lijst').innerHTML = '<p class="lege-staat">Fout bij het laden</p>';
  }
}

function renderKlantenLijst() {
  const zoekterm = document.getElementById('klanten-zoek').value.toLowerCase().trim();
  const container = document.getElementById('klanten-lijst');

  let gefilterd = contacts;
  if (zoekterm) {
    gefilterd = gefilterd.filter(c =>
      (c.naam || '').toLowerCase().includes(zoekterm) ||
      (c.klantnummer_extern || '').toLowerCase().includes(zoekterm) ||
      (c.email || '').toLowerCase().includes(zoekterm)
    );
  }

  if (gefilterd.length === 0) {
    container.innerHTML = '<p class="lege-staat">Geen klanten gevonden</p>';
    return;
  }

  container.innerHTML = gefilterd.map(klant => `
    <div class="klant-kaart ${huidigKlantId === klant.id ? 'geselecteerd' : ''}"
         data-klant-id="${klant.id}">
      <div class="klant-kaart-naam">${escapeHtml(klant.naam)}</div>
      <div class="klant-kaart-sub">
        ${klant.klantnummer_extern ? escapeHtml(klant.klantnummer_extern) + ' &bull; ' : ''}
        ${klant.telefoonnummer ? escapeHtml(klant.telefoonnummer) : ''}
        ${klant.mobiel ? (klant.telefoonnummer ? ' / ' : '') + escapeHtml(klant.mobiel) : ''}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.klant-kaart').forEach(kaart => {
    kaart.addEventListener('click', () => {
      const id = Number(kaart.dataset.klantId);
      toonKlantDetail(id);
    });
  });
}

function toonKlantDetail(id) {
  huidigKlantId = id;
  const klant = contacts.find(c => c.id === id);
  if (!klant) return;

  // Markeer kaart
  document.querySelectorAll('.klant-kaart').forEach(k => k.classList.remove('geselecteerd'));
  const kaart = document.querySelector(`.klant-kaart[data-klant-id="${id}"]`);
  if (kaart) kaart.classList.add('geselecteerd');

  // Toon detail panel
  const panel = document.getElementById('klant-detail');
  panel.classList.remove('verborgen');

  // Header
  document.getElementById('klant-detail-naam').textContent = klant.naam;
  const sub = [klant.klantnummer_extern, klant.woonplaats].filter(Boolean).join(' - ');
  document.getElementById('klant-detail-klantnummer').textContent = sub;

  // Reset naar profiel tab
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('actief'));
  document.querySelectorAll('.detail-tab-inhoud').forEach(i => i.classList.remove('actief'));
  document.querySelector('.detail-tab[data-tab="profiel"]').classList.add('actief');
  document.getElementById('tab-profiel').classList.add('actief');

  // Profiel vullen
  renderKlantProfiel(klant);
}

function renderKlantProfiel(klant) {
  const velden = [
    { label: 'Aanhef',           waarde: klant.aanhef },
    { label: 'Naam',             waarde: klant.naam },
    { label: 'Geboortedatum',    waarde: formatDatum(klant.geboortedatum) },
    { label: 'Telefoonnummer',   waarde: klant.telefoonnummer },
    { label: 'Mobiel',           waarde: klant.mobiel },
    { label: 'E-mailadres',      waarde: klant.email },
    { label: 'Adres',            waarde: klant.adres },
    { label: 'Postcode',         waarde: klant.postcode },
    { label: 'Woonplaats',       waarde: klant.woonplaats },
    { label: 'Huisarts',         waarde: klant.huisarts },
    { label: 'Voorschrijver',    waarde: klant.voorschrijver },
    { label: 'Extern klantnummer', waarde: klant.klantnummer_extern },
    { label: 'Aangemaakt op',    waarde: formatDatumTijd(klant.aangemaakt_op) }
  ];

  const notitiesVeld = klant.notities ? `
    <div class="profiel-veld" style="grid-column: 1 / -1;">
      <span class="profiel-label">Notities</span>
      <span class="profiel-waarde">${escapeHtml(klant.notities)}</span>
    </div>` : '';

  document.getElementById('klant-profiel-inhoud').innerHTML =
    velden.map(v => `
      <div class="profiel-veld">
        <span class="profiel-label">${escapeHtml(v.label)}</span>
        <span class="${v.waarde ? 'profiel-waarde' : 'profiel-waarde-leeg'}">
          ${v.waarde ? escapeHtml(String(v.waarde)) : 'Niet ingevuld'}
        </span>
      </div>
    `).join('') + notitiesVeld;
}

async function slaKlantOp() {
  const id = document.getElementById('klant-id').value;
  const payload = {
    naam:               document.getElementById('klant-naam').value.trim(),
    aanhef:             document.getElementById('klant-aanhef').value,
    geboortedatum:      document.getElementById('klant-geboortedatum').value || null,
    telefoonnummer:     document.getElementById('klant-telefoon').value.trim(),
    mobiel:             document.getElementById('klant-mobiel').value.trim(),
    email:              document.getElementById('klant-email').value.trim(),
    adres:              document.getElementById('klant-adres').value.trim(),
    postcode:           document.getElementById('klant-postcode').value.trim(),
    woonplaats:         document.getElementById('klant-woonplaats').value.trim(),
    huisarts:           document.getElementById('klant-huisarts').value.trim(),
    voorschrijver:      document.getElementById('klant-voorschrijver').value.trim(),
    klantnummer_extern: document.getElementById('klant-klantnummer-extern').value.trim(),
    notities:           document.getElementById('klant-notities').value.trim()
  };

  if (!payload.naam) { toonToast('Naam is verplicht', 'fout'); return; }

  try {
    const methode = id ? 'PUT' : 'POST';
    const url = id ? `/api/contacts/${id}` : '/api/contacts';
    const resp = await apiFetch(url, { method: methode, body: JSON.stringify(payload) });
    if (!resp) return;
    const data = await resp.json();
    if (data.success) {
      sluitModal('modal-klant');
      toonToast(id ? 'Klant bijgewerkt' : 'Klant aangemaakt', 'succes');
      await laadKlanten();
      if (id) toonKlantDetail(Number(id));
    } else {
      toonToast('Fout: ' + (data.error || 'Onbekende fout'), 'fout');
    }
  } catch (err) {
    console.error('[APP] Fout bij opslaan klant:', err);
    toonToast('Fout bij het opslaan', 'fout');
  }
}

function bewerkKlant(id) {
  const klant = contacts.find(c => c.id === id);
  if (!klant) return;
  document.getElementById('klant-id').value = klant.id;
  document.getElementById('klant-aanhef').value = klant.aanhef || '';
  document.getElementById('klant-naam').value = klant.naam || '';
  document.getElementById('klant-geboortedatum').value = (klant.geboortedatum || '').substring(0, 10);
  document.getElementById('klant-telefoon').value = klant.telefoonnummer || '';
  document.getElementById('klant-mobiel').value = klant.mobiel || '';
  document.getElementById('klant-email').value = klant.email || '';
  document.getElementById('klant-adres').value = klant.adres || '';
  document.getElementById('klant-postcode').value = klant.postcode || '';
  document.getElementById('klant-woonplaats').value = klant.woonplaats || '';
  document.getElementById('klant-huisarts').value = klant.huisarts || '';
  document.getElementById('klant-voorschrijver').value = klant.voorschrijver || '';
  document.getElementById('klant-klantnummer-extern').value = klant.klantnummer_extern || '';
  document.getElementById('klant-notities').value = klant.notities || '';
  document.getElementById('modal-klant-titel').textContent = 'Klant Bewerken';
  openModal('modal-klant');
}

function verwijderKlant(id) {
  const klant = contacts.find(c => c.id === id);
  if (!klant) return;
  toonBevestiging(
    'Klant verwijderen?',
    `Weet u zeker dat u "${klant.naam}" wilt verwijderen? Alle bijbehorende hoortoestellen en bestellingen worden ook verwijderd.`,
    async () => {
      try {
        const resp = await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' });
        if (!resp) return;
        const data = await resp.json();
        if (data.success) {
          toonToast('Klant verwijderd', 'succes');
          huidigKlantId = null;
          document.getElementById('klant-detail').classList.add('verborgen');
          await laadKlanten();
        } else {
          toonToast('Fout: ' + (data.error || 'Onbekende fout'), 'fout');
        }
      } catch (err) {
        toonToast('Fout bij verwijderen', 'fout');
      }
    }
  );
}

// ============================================================
// HOORTOESTELLEN
// ============================================================
async function laadHoortoestellen(contactId) {
  const container = document.getElementById('hoortoestellen-inhoud');
  container.innerHTML = '<p class="laden-tekst">Laden...</p>';
  try {
    const resp = await apiFetch(`/api/contacts/${contactId}/hoortoestellen`);
    if (!resp) return;
    const data = await resp.json();
    if (!data.success) { container.innerHTML = '<p class="lege-staat">Kon hoortoestellen niet laden</p>'; return; }
    if (!data.data || data.data.length === 0) {
      container.innerHTML = '<p class="lege-staat">Nog geen hoortoestellen gekoppeld</p>';
      return;
    }
    container.innerHTML = data.data.map(ht => `
      <div class="hoortoestel-kaart">
        <div class="hoortoestel-info">
          <div class="hoortoestel-naam">${escapeHtml(ht.merk || '')} ${escapeHtml(ht.type || '')}</div>
          <div class="hoortoestel-detail">
            ${ht.serienummer_links ? `<span>Serienr. L: ${escapeHtml(ht.serienummer_links)}</span><br>` : ''}
            ${ht.serienummer_rechts ? `<span>Serienr. R: ${escapeHtml(ht.serienummer_rechts)}</span><br>` : ''}
            ${ht.kleur ? `<span>Kleur: ${escapeHtml(ht.kleur)}</span><br>` : ''}
            ${ht.leverdatum ? `<span>Geleverd: ${formatDatum(ht.leverdatum)}</span><br>` : ''}
            ${ht.factuurdatum ? `<span>Factuur: ${formatDatum(ht.factuurdatum)}</span>` : ''}
          </div>
        </div>
        <div class="hoortoestel-acties">
          <button class="btn btn-small btn-secondary" data-actie="bewerken" data-ht-id="${ht.id}">Bewerken</button>
          <button class="btn btn-small btn-danger" data-actie="verwijderen" data-ht-id="${ht.id}">Verwijderen</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('[data-actie="bewerken"]').forEach(knop => {
      knop.addEventListener('click', () => bewerkHoortoestel(Number(knop.dataset.htId), data.data));
    });

    container.querySelectorAll('[data-actie="verwijderen"]').forEach(knop => {
      knop.addEventListener('click', () => verwijderHoortoestel(Number(knop.dataset.htId)));
    });
  } catch (err) {
    console.error('[APP] Fout bij laden hoortoestellen:', err);
    container.innerHTML = '<p class="lege-staat">Fout bij het laden</p>';
  }
}

async function slaHoortoestelOp() {
  if (!huidigKlantId) return;
  const id = document.getElementById('hoortoestel-id').value;
  const payload = {
    merk:               document.getElementById('hoortoestel-merk').value.trim(),
    type:               document.getElementById('hoortoestel-type').value.trim(),
    serienummer_links:  document.getElementById('hoortoestel-serienummer-links').value.trim(),
    serienummer_rechts: document.getElementById('hoortoestel-serienummer-rechts').value.trim(),
    kleur:              document.getElementById('hoortoestel-kleur').value.trim(),
    leverdatum:         document.getElementById('hoortoestel-leverdatum').value || null,
    factuurdatum:       document.getElementById('hoortoestel-factuurdatum').value || null
  };

  try {
    const methode = id ? 'PUT' : 'POST';
    const url = id ? `/api/hoortoestellen/${id}` : `/api/contacts/${huidigKlantId}/hoortoestellen`;
    const resp = await apiFetch(url, { method: methode, body: JSON.stringify(payload) });
    if (!resp) return;
    const data = await resp.json();
    if (data.success) {
      sluitModal('modal-hoortoestel');
      toonToast(id ? 'Hoortoestel bijgewerkt' : 'Hoortoestel toegevoegd', 'succes');
      await laadHoortoestellen(huidigKlantId);
    } else {
      toonToast('Fout: ' + (data.error || 'Onbekende fout'), 'fout');
    }
  } catch (err) {
    console.error('[APP] Fout bij opslaan hoortoestel:', err);
    toonToast('Fout bij het opslaan', 'fout');
  }
}

function bewerkHoortoestel(id, lijst) {
  const ht = lijst.find(h => h.id === id);
  if (!ht) return;
  document.getElementById('hoortoestel-id').value = ht.id;
  document.getElementById('hoortoestel-merk').value = ht.merk || '';
  document.getElementById('hoortoestel-type').value = ht.type || '';
  document.getElementById('hoortoestel-serienummer-links').value = ht.serienummer_links || '';
  document.getElementById('hoortoestel-serienummer-rechts').value = ht.serienummer_rechts || '';
  document.getElementById('hoortoestel-kleur').value = ht.kleur || '';
  document.getElementById('hoortoestel-leverdatum').value = (ht.leverdatum || '').substring(0, 10);
  document.getElementById('hoortoestel-factuurdatum').value = (ht.factuurdatum || '').substring(0, 10);
  document.getElementById('modal-hoortoestel-titel').textContent = 'Hoortoestel Bewerken';
  openModal('modal-hoortoestel');
}

function verwijderHoortoestel(id) {
  toonBevestiging(
    'Hoortoestel verwijderen?',
    'Weet u zeker dat u dit hoortoestel wilt verwijderen?',
    async () => {
      try {
        const resp = await apiFetch(`/api/hoortoestellen/${id}`, { method: 'DELETE' });
        if (!resp) return;
        const data = await resp.json();
        if (data.success) {
          toonToast('Hoortoestel verwijderd', 'succes');
          await laadHoortoestellen(huidigKlantId);
        } else {
          toonToast('Fout: ' + (data.error || 'Onbekende fout'), 'fout');
        }
      } catch (err) {
        toonToast('Fout bij verwijderen', 'fout');
      }
    }
  );
}

// ============================================================
// NOTITIES
// ============================================================
async function laadKlantNotities(contactId) {
  const container = document.getElementById('klant-notities-inhoud');
  container.innerHTML = '<p class="laden-tekst">Laden...</p>';
  try {
    const resp = await apiFetch(`/api/contacts/${contactId}/notities`);
    if (!resp) return;
    const data = await resp.json();
    if (!data.success) { container.innerHTML = '<p class="lege-staat">Kon notities niet laden</p>'; return; }
    if (!data.data || data.data.length === 0) {
      container.innerHTML = '<p class="lege-staat">Nog geen notities</p>';
      return;
    }
    container.innerHTML = data.data.map(n => `
      <div class="notitie-item">
        <div class="notitie-header">
          <span class="notitie-meta">${formatDatumTijd(n.aangemaakt_op)}${n.auteur ? ' &bull; ' + escapeHtml(n.auteur) : ''}</span>
          <button class="btn btn-small btn-danger" data-actie="verwijderen" data-notitie-id="${n.id}">Verwijderen</button>
        </div>
        <p class="notitie-tekst">${escapeHtml(n.tekst)}</p>
      </div>
    `).join('');

    container.querySelectorAll('[data-actie="verwijderen"]').forEach(knop => {
      knop.addEventListener('click', () => verwijderNotitie(Number(knop.dataset.notitieId), 'contact', huidigKlantId));
    });
  } catch (err) {
    console.error('[APP] Fout bij laden notities:', err);
    container.innerHTML = '<p class="lege-staat">Fout bij het laden</p>';
  }
}

async function slaNotitieOp() {
  const type   = document.getElementById('notitie-resource-type').value;
  const resId  = document.getElementById('notitie-resource-id').value;
  const tekst  = document.getElementById('notitie-tekst').value.trim();

  if (!tekst) { toonToast('Notitie mag niet leeg zijn', 'fout'); return; }

  const url = type === 'contact'
    ? `/api/contacts/${resId}/notities`
    : `/api/leads/${resId}/notities`;

  try {
    const resp = await apiFetch(url, {
      method: 'POST',
      body: JSON.stringify({ tekst, auteur: currentUser ? currentUser.naam : '' })
    });
    if (!resp) return;
    const data = await resp.json();
    if (data.success) {
      sluitModal('modal-notitie');
      toonToast('Notitie opgeslagen', 'succes');
      if (type === 'contact' && huidigKlantId) await laadKlantNotities(huidigKlantId);
    } else {
      toonToast('Fout: ' + (data.error || 'Onbekende fout'), 'fout');
    }
  } catch (err) {
    console.error('[APP] Fout bij opslaan notitie:', err);
    toonToast('Fout bij het opslaan', 'fout');
  }
}

function verwijderNotitie(id, type, resId) {
  toonBevestiging(
    'Notitie verwijderen?',
    'Weet u zeker dat u deze notitie wilt verwijderen?',
    async () => {
      try {
        const resp = await apiFetch(`/api/notities/${id}`, { method: 'DELETE' });
        if (!resp) return;
        const data = await resp.json();
        if (data.success) {
          toonToast('Notitie verwijderd', 'succes');
          if (type === 'contact' && resId) await laadKlantNotities(resId);
        } else {
          toonToast('Fout: ' + (data.error || 'Onbekende fout'), 'fout');
        }
      } catch (err) {
        toonToast('Fout bij verwijderen', 'fout');
      }
    }
  );
}

// ============================================================
// TAKEN
// ============================================================
async function laadTaken() {
  const statusFilter = document.getElementById('taken-filter-status').value;
  try {
    const resp = await apiFetch('/api/taken');
    if (!resp) return;
    const data = await resp.json();
    if (!data.success) {
      document.getElementById('mijn-taken-lijst').innerHTML = '<p class="lege-staat">Kon taken niet laden</p>';
      document.getElementById('alle-taken-lijst').innerHTML = '';
      return;
    }

    taken = data.data;

    let gefilterd = taken;
    if (statusFilter) {
      gefilterd = gefilterd.filter(t => t.status === statusFilter);
    }

    // Mijn taken
    const mijnTaken = gefilterd.filter(t =>
      !t.eigenaar_id || (currentUser && t.eigenaar_id === currentUser.id)
    );

    renderTakenLijst('mijn-taken-lijst', mijnTaken);
    renderTakenLijst('alle-taken-lijst', gefilterd);
  } catch (err) {
    console.error('[APP] Fout bij laden taken:', err);
    document.getElementById('mijn-taken-lijst').innerHTML = '<p class="lege-staat">Fout bij het laden</p>';
  }
}

function renderTakenLijst(containerId, takenLijst) {
  const container = document.getElementById(containerId);
  if (!takenLijst || takenLijst.length === 0) {
    container.innerHTML = '<p class="lege-staat">Geen taken gevonden</p>';
    return;
  }

  container.innerHTML = takenLijst.map(t => {
    const verlopen = t.deadline && datumIsVerlopen(t.deadline) && t.status !== 'afgerond';
    return `
      <div class="taak-rij">
        <span class="badge badge-${escapeHtml(t.status)}">${statusTaakLabel(t.status)}</span>
        <span class="badge badge-${escapeHtml(t.prioriteit || 'normaal')}">${prioriteitLabel(t.prioriteit)}</span>
        <span class="taak-titel">${escapeHtml(t.titel)}</span>
        ${t.contact_naam ? `<span class="taak-koppeling">${escapeHtml(t.contact_naam)}</span>` : ''}
        ${t.deadline ? `<span class="taak-deadline ${verlopen ? 'verlopen' : ''}">${verlopen ? 'Verlopen: ' : ''}${formatDatum(t.deadline)}</span>` : ''}
        <div class="rij-acties">
          ${t.status !== 'afgerond' ? `<button class="btn btn-small btn-secondary" data-actie="afronden" data-id="${t.id}">Afronden</button>` : ''}
          <button class="btn btn-small btn-danger" data-actie="verwijderen" data-id="${t.id}">Verwijderen</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-actie="afronden"]').forEach(knop => {
    knop.addEventListener('click', () => taakAfronden(Number(knop.dataset.id)));
  });

  container.querySelectorAll('[data-actie="verwijderen"]').forEach(knop => {
    knop.addEventListener('click', () => verwijderTaak(Number(knop.dataset.id)));
  });
}

function statusTaakLabel(status) {
  const labels = { open: 'Open', in_uitvoering: 'In Uitvoering', afgerond: 'Afgerond' };
  return labels[status] || escapeHtml(status);
}

function prioriteitLabel(prio) {
  const labels = { laag: 'Laag', normaal: 'Normaal', hoog: 'Hoog' };
  return labels[prio] || escapeHtml(prio || 'Normaal');
}

function vulKlantenInTaakSelect() {
  const select = document.getElementById('taak-contact-id');
  select.innerHTML = '<option value="">Geen klant gekoppeld</option>';
  contacts.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.naam;
    select.appendChild(opt);
  });
}

async function slaTaakOp() {
  const id = document.getElementById('taak-id').value;
  const payload = {
    titel:       document.getElementById('taak-titel').value.trim(),
    omschrijving: document.getElementById('taak-omschrijving').value.trim(),
    deadline:    document.getElementById('taak-deadline').value || null,
    prioriteit:  document.getElementById('taak-prioriteit').value,
    contact_id:  document.getElementById('taak-contact-id').value || null
  };

  if (!payload.titel) { toonToast('Titel is verplicht', 'fout'); return; }

  try {
    const methode = id ? 'PUT' : 'POST';
    const url = id ? `/api/taken/${id}` : '/api/taken';
    const resp = await apiFetch(url, { method: methode, body: JSON.stringify(payload) });
    if (!resp) return;
    const data = await resp.json();
    if (data.success) {
      sluitModal('modal-taak');
      toonToast(id ? 'Taak bijgewerkt' : 'Taak aangemaakt', 'succes');
      await laadTaken();
    } else {
      toonToast('Fout: ' + (data.error || 'Onbekende fout'), 'fout');
    }
  } catch (err) {
    console.error('[APP] Fout bij opslaan taak:', err);
    toonToast('Fout bij het opslaan', 'fout');
  }
}

async function taakAfronden(id) {
  try {
    const resp = await apiFetch(`/api/taken/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'afgerond' })
    });
    if (!resp) return;
    const data = await resp.json();
    if (data.success) {
      toonToast('Taak afgerond', 'succes');
      await laadTaken();
      await laadDashboardTaken();
    } else {
      toonToast('Fout: ' + (data.error || 'Onbekende fout'), 'fout');
    }
  } catch (err) {
    toonToast('Fout bij afronden taak', 'fout');
  }
}

function verwijderTaak(id) {
  const taak = taken.find(t => t.id === id);
  toonBevestiging(
    'Taak verwijderen?',
    `Weet u zeker dat u "${taak ? taak.titel : 'deze taak'}" wilt verwijderen?`,
    async () => {
      try {
        const resp = await apiFetch(`/api/taken/${id}`, { method: 'DELETE' });
        if (!resp) return;
        const data = await resp.json();
        if (data.success) {
          toonToast('Taak verwijderd', 'succes');
          await laadTaken();
        } else {
          toonToast('Fout: ' + (data.error || 'Onbekende fout'), 'fout');
        }
      } catch (err) {
        toonToast('Fout bij verwijderen', 'fout');
      }
    }
  );
}

// ============================================================
// BESTELLINGEN
// ============================================================
async function laadBestellingen() {
  const statusFilter = document.getElementById('bestellingen-filter-status').value;
  const container = document.getElementById('bestellingen-lijst');
  container.innerHTML = '<p class="laden-tekst">Laden...</p>';
  try {
    const resp = await apiFetch('/api/bestellingen');
    if (!resp) return;
    const data = await resp.json();
    if (!data.success) { container.innerHTML = '<p class="lege-staat">Kon bestellingen niet laden</p>'; return; }

    bestellingen = data.data;
    let gefilterd = bestellingen;
    if (statusFilter) {
      gefilterd = gefilterd.filter(b => b.status === statusFilter);
    }

    renderBestellingenLijst(container, gefilterd);
  } catch (err) {
    console.error('[APP] Fout bij laden bestellingen:', err);
    container.innerHTML = '<p class="lege-staat">Fout bij het laden</p>';
  }
}

async function laadKlantBestellingen(contactId) {
  const container = document.getElementById('klant-bestellingen-inhoud');
  container.innerHTML = '<p class="laden-tekst">Laden...</p>';
  try {
    const resp = await apiFetch(`/api/contacts/${contactId}/bestellingen`);
    if (!resp) return;
    const data = await resp.json();
    if (!data.success) { container.innerHTML = '<p class="lege-staat">Kon bestellingen niet laden</p>'; return; }
    renderBestellingenLijst(container, data.data || []);
  } catch (err) {
    console.error('[APP] Fout bij laden klantbestellingen:', err);
    container.innerHTML = '<p class="lege-staat">Fout bij het laden</p>';
  }
}

function renderBestellingenLijst(container, lijst) {
  if (!lijst || lijst.length === 0) {
    container.innerHTML = '<p class="lege-staat">Geen bestellingen gevonden</p>';
    return;
  }

  container.innerHTML = lijst.map(b => {
    const artikelen = maakArtikelenSamenvatting(b);
    return `
      <div class="bestelling-rij">
        <span class="bestelling-klant">${escapeHtml(b.contact_naam || b.naam || '-')}</span>
        <span class="bestelling-artikelen">${escapeHtml(artikelen)}</span>
        <span class="badge badge-${escapeHtml(b.status)}">${statusBestellingLabel(b.status)}</span>
        <span class="rij-info">${escapeHtml(b.bezorgmethode === 'post' ? 'Per post' : 'Afhalen')}</span>
        <span class="rij-info">${formatDatum(b.aangemaakt_op)}</span>
        <div class="bestelling-acties">
          ${b.status === 'besteld' ? `<button class="btn btn-small btn-secondary" data-actie="klaar" data-id="${b.id}">Klaar</button>` : ''}
          ${b.status === 'klaar' ? `<button class="btn btn-small btn-primary" data-actie="geleverd" data-id="${b.id}">Geleverd</button>` : ''}
          <button class="btn btn-small btn-danger" data-actie="verwijderen" data-id="${b.id}">Verwijderen</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-actie="klaar"]').forEach(knop => {
    knop.addEventListener('click', () => updateBestellingStatus(Number(knop.dataset.id), 'klaar'));
  });

  container.querySelectorAll('[data-actie="geleverd"]').forEach(knop => {
    knop.addEventListener('click', () => updateBestellingStatus(Number(knop.dataset.id), 'geleverd'));
  });

  container.querySelectorAll('[data-actie="verwijderen"]').forEach(knop => {
    knop.addEventListener('click', () => verwijderBestelling(Number(knop.dataset.id)));
  });
}

function maakArtikelenSamenvatting(bestelling) {
  if (bestelling.regels && Array.isArray(bestelling.regels) && bestelling.regels.length > 0) {
    return bestelling.regels.map(r => `${r.hoeveelheid || 1}x ${r.artikel_type || r.type}`).join(', ');
  }
  if (bestelling.artikelen) return String(bestelling.artikelen);
  return 'Zie details';
}

function statusBestellingLabel(status) {
  const labels = { besteld: 'Besteld', klaar: 'Klaar voor afhaling', geleverd: 'Geleverd' };
  return labels[status] || escapeHtml(status);
}

async function updateBestellingStatus(id, nieuweStatus) {
  try {
    const resp = await apiFetch(`/api/bestellingen/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: nieuweStatus })
    });
    if (!resp) return;
    const data = await resp.json();
    if (data.success) {
      toonToast(`Bestelling: ${statusBestellingLabel(nieuweStatus)}`, 'succes');
      await laadBestellingen();
      if (huidigKlantId) await laadKlantBestellingen(huidigKlantId);
    } else {
      toonToast('Fout: ' + (data.error || 'Onbekende fout'), 'fout');
    }
  } catch (err) {
    toonToast('Fout bij bijwerken bestelling', 'fout');
  }
}

function verwijderBestelling(id) {
  toonBevestiging(
    'Bestelling verwijderen?',
    'Weet u zeker dat u deze bestelling wilt verwijderen?',
    async () => {
      try {
        const resp = await apiFetch(`/api/bestellingen/${id}`, { method: 'DELETE' });
        if (!resp) return;
        const data = await resp.json();
        if (data.success) {
          toonToast('Bestelling verwijderd', 'succes');
          await laadBestellingen();
          if (huidigKlantId) await laadKlantBestellingen(huidigKlantId);
        } else {
          toonToast('Fout: ' + (data.error || 'Onbekende fout'), 'fout');
        }
      } catch (err) {
        toonToast('Fout bij verwijderen', 'fout');
      }
    }
  );
}

function voegBestellingRegelToe() {
  const container = document.getElementById('bestelling-regels');
  const regel = document.createElement('div');
  regel.className = 'bestelling-regel';
  regel.innerHTML = `
    <select class="regel-type">
      <option value="">Selecteer artikel...</option>
      <option value="Batterijen">Batterijen</option>
      <option value="Domes">Domes</option>
      <option value="Filters">Filters</option>
      <option value="Reinigingsmiddelen">Reinigingsmiddelen</option>
      <option value="Accessoires">Accessoires</option>
    </select>
    <input type="number" class="regel-hoeveelheid" min="1" value="1" placeholder="Aantal">
    <button type="button" class="btn btn-danger btn-small regel-verwijder">-</button>
  `;
  container.appendChild(regel);
}

function openBestellingModal(contactId, contactNaam) {
  document.getElementById('form-bestelling').reset();
  document.getElementById('bestelling-id').value = '';
  document.getElementById('bestelling-contact-id').value = contactId;
  document.getElementById('bestelling-klant-weergave').value = contactNaam;
  // Reset regels naar 1 lege regel
  document.getElementById('bestelling-regels').innerHTML = `
    <div class="bestelling-regel">
      <select class="regel-type">
        <option value="">Selecteer artikel...</option>
        <option value="Batterijen">Batterijen</option>
        <option value="Domes">Domes</option>
        <option value="Filters">Filters</option>
        <option value="Reinigingsmiddelen">Reinigingsmiddelen</option>
        <option value="Accessoires">Accessoires</option>
      </select>
      <input type="number" class="regel-hoeveelheid" min="1" value="1" placeholder="Aantal">
      <button type="button" class="btn btn-danger btn-small regel-verwijder">-</button>
    </div>
  `;
  document.getElementById('modal-bestelling-titel').textContent = 'Nieuwe Bestelling';
  openModal('modal-bestelling');
}

async function slaBestellingOp() {
  const id        = document.getElementById('bestelling-id').value;
  const contactId = document.getElementById('bestelling-contact-id').value;
  const notities  = document.getElementById('bestelling-notities').value.trim();
  const methode   = document.getElementById('bestelling-bezorgmethode').value;

  // Regels verzamelen
  const regels = [];
  document.querySelectorAll('#bestelling-regels .bestelling-regel').forEach(regel => {
    const type       = regel.querySelector('.regel-type').value;
    const hoeveelheid = parseInt(regel.querySelector('.regel-hoeveelheid').value, 10) || 1;
    if (type) regels.push({ artikel_type: type, hoeveelheid });
  });

  if (regels.length === 0) { toonToast('Voeg minstens 1 artikel toe', 'fout'); return; }
  if (!contactId) { toonToast('Geen klant geselecteerd', 'fout'); return; }

  const payload = { bezorgmethode: methode, notities, regels };

  try {
    const url = id ? `/api/bestellingen/${id}` : `/api/contacts/${contactId}/bestellingen`;
    const httpMethod = id ? 'PUT' : 'POST';
    const resp = await apiFetch(url, { method: httpMethod, body: JSON.stringify(payload) });
    if (!resp) return;
    const data = await resp.json();
    if (data.success) {
      sluitModal('modal-bestelling');
      toonToast('Bestelling geplaatst', 'succes');
      await laadBestellingen();
      if (huidigKlantId) await laadKlantBestellingen(huidigKlantId);
    } else {
      toonToast('Fout: ' + (data.error || 'Onbekende fout'), 'fout');
    }
  } catch (err) {
    console.error('[APP] Fout bij opslaan bestelling:', err);
    toonToast('Fout bij het opslaan', 'fout');
  }
}

// ============================================================
// NAZORG
// ============================================================
async function laadNazorg() {
  try {
    const resp = await apiFetch('/api/nazorg/aankomend');
    if (!resp) return;
    const data = await resp.json();

    const checkupsEl  = document.getElementById('nazorg-checkups');
    const garantieEl  = document.getElementById('nazorg-garantie');

    if (!data.success) {
      checkupsEl.innerHTML = '<p class="lege-staat">Kon nazorg niet laden</p>';
      garantieEl.innerHTML = '';
      return;
    }

    const items = data.data || [];

    // Check-ups: checkup_datum aanwezig
    const checkups = items.filter(r => r.checkup_datum || r.type === 'checkup');
    // Garantie: garantie_datum aanwezig
    const garantie = items.filter(r => r.garantie_verval || r.type === 'garantie');

    renderNazorgTabel(checkupsEl,  checkups.length  > 0 ? checkups : items.slice(0, Math.ceil(items.length / 2)));
    renderNazorgTabel(garantieEl, garantie.length > 0 ? garantie : items.slice(Math.ceil(items.length / 2)));
  } catch (err) {
    console.error('[APP] Fout bij laden nazorg:', err);
    document.getElementById('nazorg-checkups').innerHTML = '<p class="lege-staat">Fout bij het laden</p>';
    document.getElementById('nazorg-garantie').innerHTML = '';
  }
}

function renderNazorgTabel(container, items) {
  if (!items || items.length === 0) {
    container.innerHTML = '<p class="lege-staat">Geen items gevonden</p>';
    return;
  }

  container.innerHTML = `
    <table class="nazorg-tabel">
      <thead>
        <tr>
          <th>Klant</th>
          <th>Hoortoestel</th>
          <th>Leverdatum</th>
          <th>Herinneringsdatum</th>
          <th>Actie</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(r => `
          <tr>
            <td>${escapeHtml(r.contact_naam || r.naam || '-')}</td>
            <td>${escapeHtml(r.merk || '')} ${escapeHtml(r.type || '')}</td>
            <td>${formatDatum(r.leverdatum)}</td>
            <td>${formatDatum(r.checkup_datum || r.garantie_verval || r.herinnering_datum)}</td>
            <td>
              <button class="btn btn-small btn-primary" data-actie="bel-taak"
                data-contact-id="${r.contact_id || ''}"
                data-naam="${escapeHtml(r.contact_naam || r.naam || '')}">
                Taak aanmaken
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.querySelectorAll('[data-actie="bel-taak"]').forEach(knop => {
    knop.addEventListener('click', () => {
      const naam      = knop.dataset.naam;
      const contactId = knop.dataset.contactId;
      maakNazorgTaak(naam, contactId);
    });
  });
}

function maakNazorgTaak(klantNaam, contactId) {
  document.getElementById('form-taak').reset();
  document.getElementById('taak-id').value = '';
  document.getElementById('taak-titel').value = `Nazorg bellen: ${klantNaam}`;
  document.getElementById('taak-prioriteit').value = 'normaal';
  document.getElementById('taak-deadline').value = vandaagIso();
  vulKlantenInTaakSelect();
  if (contactId) {
    document.getElementById('taak-contact-id').value = contactId;
  }
  document.getElementById('modal-taak-titel').textContent = 'Nazorg Taak Aanmaken';
  openModal('modal-taak');
}

// ============================================================
// LOG
// ============================================================
console.log('[APP] Telegraaf Horen CRM geladen');
