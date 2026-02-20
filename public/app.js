// Telegraaf Horen CRM - Frontend Application

const API_BASE = '/api';
let contacts = [];
let currentPage = 'dashboard';

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  console.log('[APP] Initializing Telegraaf Horen CRM');

  // Check server health
  checkServerHealth();

  // Load initial data
  loadContacts();

  // Set up event listeners
  setupEventListeners();

  // Load settings
  loadServerInfo();
});

// Check server health
async function checkServerHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();

    const statusEl = document.getElementById('connection-status');
    const statusText = document.getElementById('status-text');

    if (response.ok) {
      statusEl.classList.add('status-healthy');
      statusText.textContent = 'Verbonden';
      console.log('[APP] Server health check passed');
    } else {
      statusEl.classList.add('status-error');
      statusText.textContent = 'Verbindingsfout';
      console.error('[APP] Server health check failed:', data);
    }
  } catch (err) {
    console.error('[APP] Server health check error:', err);
    document.getElementById('connection-status').classList.add('status-error');
    document.getElementById('status-text').textContent = 'Niet verbonden';
  }
}

// Load all contacts
async function loadContacts() {
  try {
    const response = await fetch(`${API_BASE}/contacts`);
    const data = await response.json();

    if (data.success) {
      contacts = data.data;
      console.log('[APP] Loaded', contacts.length, 'contacts');
      displayContacts();
      updateDashboard();
    } else {
      console.error('[APP] Error loading contacts:', data.error);
    }
  } catch (err) {
    console.error('[APP] Error fetching contacts:', err);
  }
}

// Display contacts in the UI
function displayContacts() {
  const container = document.getElementById('contacts-list');

  if (contacts.length === 0) {
    container.innerHTML = '<p class="empty-state">Geen contacten gevonden. <a href="#" onclick="openContactModal()">Voeg er een toe.</a></p>';
    return;
  }

  container.innerHTML = contacts.map(contact => `
    <div class="contact-card">
      <div class="contact-header">
        <h3>${escapeHtml(contact.naam)}</h3>
        <span class="status-badge status-${contact.status}">${contact.status}</span>
      </div>
      <div class="contact-body">
        ${contact.email ? `<p><strong>Email:</strong> ${escapeHtml(contact.email)}</p>` : ''}
        ${contact.telefoonnummer ? `<p><strong>Telefoon:</strong> ${escapeHtml(contact.telefoonnummer)}</p>` : ''}
        ${contact.bedrijf ? `<p><strong>Bedrijf:</strong> ${escapeHtml(contact.bedrijf)}</p>` : ''}
        ${contact.type ? `<p><strong>Type:</strong> ${contact.type}</p>` : ''}
        ${contact.notities ? `<p><strong>Notities:</strong> ${escapeHtml(contact.notities)}</p>` : ''}
        <p class="contact-meta">Toegevoegd: ${new Date(contact.aangemaakt_op).toLocaleDateString('nl-NL')}</p>
      </div>
      <div class="contact-actions">
        <button class="btn btn-small" onclick="editContact(${contact.id})">Bewerk</button>
        <button class="btn btn-small btn-danger" onclick="deleteContact(${contact.id})">Verwijder</button>
      </div>
    </div>
  `).join('');
}

// Update dashboard stats
function updateDashboard() {
  const totalContacts = contacts.length;
  const activeContacts = contacts.filter(c => c.status !== 'inactief').length;
  const companies = [...new Set(contacts.map(c => c.bedrijf).filter(Boolean))].length;

  const statCards = document.querySelectorAll('.stat-value');
  if (statCards.length >= 3) {
    statCards[0].textContent = totalContacts;
    statCards[1].textContent = activeContacts;
    statCards[2].textContent = companies;
  }
}

// Load server info
async function loadServerInfo() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    const serverInfo = document.getElementById('server-info');
    serverInfo.textContent = `Server draait op poort ${data.port} - ${new Date(data.timestamp).toLocaleString('nl-NL')}`;
  } catch (err) {
    console.error('[APP] Error loading server info:', err);
  }
}

// Set up event listeners
function setupEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = e.target.getAttribute('href').substring(1);
      showSection(section);
    });
  });

  // Add contact button
  const addBtn = document.getElementById('add-contact-btn');
  if (addBtn) {
    addBtn.addEventListener('click', openContactModal);
  }

  // Modal close buttons
  document.querySelectorAll('.modal-close, .modal-close-btn').forEach(btn => {
    btn.addEventListener('click', closeContactModal);
  });

  // Contact form
  const form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', handleContactSubmit);
  }

  // Modal background click
  const modal = document.getElementById('contact-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeContactModal();
      }
    });
  }
}

// Show section
function showSection(section) {
  document.querySelectorAll('.content-section').forEach(s => {
    s.classList.remove('active');
  });
  document.getElementById(section).classList.add('active');

  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  document.querySelector(`[href="#${section}"]`).classList.add('active');

  currentPage = section;
  console.log('[APP] Showing section:', section);
}

// Open contact modal
function openContactModal() {
  const modal = document.getElementById('contact-modal');
  document.getElementById('contact-form').reset();
  document.querySelector('.modal h2').textContent = 'Contact Toevoegen';
  modal.classList.add('active');
}

// Close contact modal
function closeContactModal() {
  const modal = document.getElementById('contact-modal');
  modal.classList.remove('active');
}

// Handle contact form submission
async function handleContactSubmit(e) {
  e.preventDefault();

  const formData = {
    naam: document.getElementById('contact-naam').value,
    email: document.getElementById('contact-email').value,
    telefoonnummer: document.getElementById('contact-phone').value,
    bedrijf: document.getElementById('contact-company').value,
    type: document.getElementById('contact-type').value,
    status: document.getElementById('contact-status').value,
    notities: document.getElementById('contact-notes').value
  };

  try {
    const response = await fetch(`${API_BASE}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (data.success) {
      console.log('[APP] Contact created:', data.data);
      closeContactModal();
      loadContacts();
    } else {
      alert('Fout: ' + data.error);
    }
  } catch (err) {
    console.error('[APP] Error creating contact:', err);
    alert('Fout bij het opslaan van het contact');
  }
}

// Edit contact
async function editContact(id) {
  const contact = contacts.find(c => c.id === id);
  if (!contact) return;

  document.getElementById('contact-naam').value = contact.naam;
  document.getElementById('contact-email').value = contact.email || '';
  document.getElementById('contact-phone').value = contact.telefoonnummer || '';
  document.getElementById('contact-company').value = contact.bedrijf || '';
  document.getElementById('contact-type').value = contact.type || 'klant';
  document.getElementById('contact-status').value = contact.status || 'nieuw';
  document.getElementById('contact-notes').value = contact.notities || '';

  const form = document.getElementById('contact-form');
  form.onsubmit = async (e) => {
    e.preventDefault();

    const formData = {
      naam: document.getElementById('contact-naam').value,
      email: document.getElementById('contact-email').value,
      telefoonnummer: document.getElementById('contact-phone').value,
      bedrijf: document.getElementById('contact-company').value,
      type: document.getElementById('contact-type').value,
      status: document.getElementById('contact-status').value,
      notities: document.getElementById('contact-notes').value
    };

    try {
      const response = await fetch(`${API_BASE}/contacts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.success) {
        console.log('[APP] Contact updated:', data.data);
        form.onsubmit = handleContactSubmit;
        closeContactModal();
        loadContacts();
      } else {
        alert('Fout: ' + data.error);
      }
    } catch (err) {
      console.error('[APP] Error updating contact:', err);
      alert('Fout bij het bijwerken van het contact');
    }
  };

  document.querySelector('.modal h2').textContent = 'Contact Bewerken';
  const modal = document.getElementById('contact-modal');
  modal.classList.add('active');
}

// Delete contact
async function deleteContact(id) {
  if (!confirm('Weet u zeker dat u dit contact wilt verwijderen?')) return;

  try {
    const response = await fetch(`${API_BASE}/contacts/${id}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      console.log('[APP] Contact deleted');
      loadContacts();
    } else {
      alert('Fout: ' + data.error);
    }
  } catch (err) {
    console.error('[APP] Error deleting contact:', err);
    alert('Fout bij het verwijderen van het contact');
  }
}

// Utility: Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Logging
console.log('[APP] Telegraaf Horen CRM loaded');
