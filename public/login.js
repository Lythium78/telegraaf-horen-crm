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

    if (data.success) {
      // Redirect to dashboard
      console.log('Login successful, redirecting...');
      window.location.href = '/';
    } else {
      // Show error message
      alertDiv.textContent = data.error || 'Inloggen mislukt. Probeer het opnieuw.';
      alertDiv.classList.add('show');
      console.log('Login failed:', data.error);

      // Clear password field
      document.getElementById('password').value = '';
      document.getElementById('password').focus();
    }
  } catch (err) {
    alertDiv.textContent = 'Verbindingsfout. Controleer uw internetverbinding.';
    alertDiv.classList.add('show');
    console.error('Login error:', err);
    console.error('Error details:', err.message, err.stack);
  } finally {
    // Re-enable button
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
