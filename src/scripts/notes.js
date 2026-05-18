import * as data from './data.js';
import { getSession } from './auth.js';

const params = new URLSearchParams(window.location.search);
const personId = params.get('id');

const nameEl   = document.getElementById('notes-person-name');
const datesEl  = document.getElementById('notes-person-dates');
const input    = document.getElementById('notes-input');
const saveBtn  = document.getElementById('notes-save');
const statusEl = document.getElementById('notes-status');

window.addEventListener('load', async () => {
  const session = await getSession();
  if (!session) {
    window.location.href = '/src/markup/signin.html';
    return;
  }

  await data.initialize();
  data.setActive(personId);

  if (!data.active) {
    window.location.href = '/src/markup/index.html';
    return;
  }

  render();
});

document.getElementById('notes-back').addEventListener('click', () => {
  window.location.href = '/src/markup/index.html';
});

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  try {
    await data.saveNotes(personId, input.value);
    showStatus('Saved', 'ok');
  } catch {
    showStatus('Failed', 'error');
  }
  saveBtn.disabled = false;
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveBtn.click();
  }
});

function render() {
  const p = data.active;
  const nameParts = [p.first, p.middle ? `${p.middle[0]}.` : '', p.surname].filter(Boolean);
  nameEl.textContent  = nameParts.join(' ') || '—';
  datesEl.textContent = [p.birth, p.death].filter(Boolean).join(' – ');
  input.value         = p.notes || '';
}

function showStatus(text, state) {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
  setTimeout(() => { statusEl.textContent = ''; delete statusEl.dataset.state; }, 2000);
}
