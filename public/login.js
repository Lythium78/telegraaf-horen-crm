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

    console.log('Login response status:', response.status);

    const data = await response.json();
    console.log('Login response data:', data);

    if (response.status === 200 && data.success) {
      // Redirect to dashboard
      console.log('Login successful, redirecting...');
      window.location.href = '/';
    } else if (response.status === 401) {
      // Authentication failed
      alertDiv.textContent = 'Gebruikersnaam of wachtwoord onjuist';
      alertDiv.classList.add('show');
      console.log('Login failed: 401 Unauthorized');

      // Clear password field
      document.getElementById('password').value = '';
      document.getElementById('password').focus();

      // Re-enable button
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    } else {
      // Other error
      alertDiv.textContent = data.error || 'Inloggen mislukt. Probeer het opnieuw.';
      alertDiv.classList.add('show');
      console.log('Login failed:', response.status, data);

      // Clear password field
      document.getElementById('password').value = '';
      document.getElementById('password').focus();

      // Re-enable button
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  } catch (err) {
    alertDiv.textContent = 'Verbindingsfout. Controleer uw internetverbinding.';
    alertDiv.classList.add('show');
    console.error('Login error:', err);
    console.error('Error details:', err.message, err.stack);

    // Re-enable button immediately on error
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  } finally {
    // Only re-enable button on success path (already done in catch)
    // This prevents duplicate button state changes
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
