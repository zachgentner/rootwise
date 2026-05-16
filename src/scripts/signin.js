import { signIn, getSession } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const session = await getSession();
  if (session) {
    window.location.href = '/src/markup/index.html';
    return;
  }

  const form = document.getElementById('signin-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errorEl = document.getElementById('error-msg');
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    try {
      await signIn(emailInput.value.trim(), passwordInput.value);
      window.location.href = '/src/markup/index.html';
    } catch (err) {
      errorEl.textContent = err.message;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });
});
