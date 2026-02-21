// login.js - Telegraaf Horen CRM Login Functionality

async function handleLogin(event) {
  event.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const submitBtn = document.getElementById('submit-btn');
  const alertDiv = document.getElementById('alert-error');

  // Clear previous error
  alertDiv.classList.remove('show');
  alertDiv.textContent = '';

  // Validation
  if (!username || !password) {
    alertDiv.textContent = 'Gebruikersnaam en wachtwoord zijn verplicht';
    alertDiv.classList.add('show');
    return;
  }

  // Disable button & show loading state
  console.log('[Login] Form submitted with username:', username);
  submitBtn.disabled = true;
  const originalText = submitBtn.textContent;
  submitBtn.innerHTML = '<span class="loading-spinner"></span>Bezig...';

  try {
    console.log('[Login] Sending POST request to /login...');

    const response = await fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        gebruikersnaam: username,
        wachtwoord: password
      })
    });

    console.log('[Login] Response received:', response.status, response.statusText);

    let data;
    try {
      data = await response.json();
      console.log('[Login] Response JSON:', data);
    } catch (parseErr) {
      console.error('[Login] Failed to parse response as JSON:', parseErr);
      alertDiv.textContent = 'Serverfout: Ongeldige respons';
      alertDiv.classList.add('show');
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
      return;
    }

    if (response.status === 200 && data.success) {
      // Redirect to dashboard
      console.log('[Login] ✓ Login successful, redirecting to /...');
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    } else if (response.status === 401) {
      // Authentication failed
      alertDiv.textContent = 'Gebruikersnaam of wachtwoord onjuist';
      alertDiv.classList.add('show');
      console.log('[Login] ✗ Login failed: 401 Unauthorized');

      // Clear password field
      document.getElementById('password').value = '';
      document.getElementById('password').focus();

      // Re-enable button
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    } else {
      // Other error
      const errorMsg = data.error || 'Inloggen mislukt. Probeer het opnieuw.';
      alertDiv.textContent = errorMsg;
      alertDiv.classList.add('show');
      console.log('[Login] ✗ Login failed:', response.status, data);

      // Clear password field
      document.getElementById('password').value = '';
      document.getElementById('password').focus();

      // Re-enable button
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  } catch (err) {
    console.error('[Login] ✗ Fetch error:', err);
    console.error('[Login] Error message:', err.message);
    console.error('[Login] Error stack:', err.stack);

    alertDiv.textContent = 'Verbindingsfout. Controleer uw internetverbinding.';
    alertDiv.classList.add('show');

    // Re-enable button immediately on error
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

// Allow Enter key to submit
document.addEventListener('DOMContentLoaded', () => {
  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('login-form').dispatchEvent(new Event('submit'));
      }
    });
  }
});
