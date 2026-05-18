import * as data from './data.js';
import * as ui from './ui.js';
import { getSession, signOut } from './auth.js';

const info = document.getElementById('info');
const quicklinks = document.getElementById('quicklinks');
const search = document.getElementById('search');
const input = document.getElementById('input');
const edit = document.getElementById('edit');
const editMenu = document.getElementById('editMenu');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('editCancel');
const popoutBtn = document.getElementById('popout');

const isPopout = new URLSearchParams(window.location.search).get('popout') === 'true';
if (isPopout) popoutBtn.style.display = 'none';

window.addEventListener('load', async () => {
  const session = await getSession();
  if (!session) {
    window.location.href = '/src/markup/signin.html';
    return;
  }

  await data.initialize();

  if (true) {
    await autoLoad();
  } else {
    data.setActive(1);
  }

  renderActive();
});

document.addEventListener('keydown', (e) => {
  if (editMenu.style.display !== 'none') {
    if (e.key === 'Escape') ui.toggleElement(editMenu);
  }
});

search.addEventListener('submit', (e) => {
  e.preventDefault();
  data.setActive(input.value);
  renderActive(document.querySelector('body'));
  input.value = '';
  results.innerHTML = '';
  ui.filterResults(data.searchByName(input.value), '', results);
});

input.addEventListener('focus', () => {
  const results = document.querySelector('#results');
  results.style.display = 'block';
  results.scrollTo(0, 0);
  ui.filterResults(data.searchByName(input.value), '', results);

  input.addEventListener('input', () => {
    results.innerHTML = '';
    ui.filterResults(data.searchByName(input.value), input.value, results);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      results.innerHTML = '';
      input.value = '';
      results.style.display = 'none';
    }, 150);
  });
});

edit.addEventListener('click', () => {
  ui.toggleElement(editMenu);
  populateEditMenu();
});

document.getElementById('add').addEventListener('click', (e) => {
  e.preventDefault();
  ui.toggleElement(editMenu);
});

saveBtn.addEventListener('click', async () => {
  const updatedPerson = {
    first:        editMenu.querySelector('#firstInput').value,
    middle:       editMenu.querySelector('#middleInput').value,
    surname:      editMenu.querySelector('#surnameInput').value,
    maiden:       editMenu.querySelector('#maidenInput').value,
    birth:        editMenu.querySelector('#birthInput').value,
    death:        editMenu.querySelector('#deathInput').value,
    ancestry:     editMenu.querySelector('#ancestryInput').value,
    familysearch: editMenu.querySelector('#familysearchInput').value,
    findagrave:   editMenu.querySelector('#findagraveInput').value,
    myheritage:   editMenu.querySelector('#myheritageInput').value,
  };

  const id = data.findId(data.active);
  try {
    await data.savePerson(id, updatedPerson);
    data.setActive(id);
    renderActive();
  } catch (err) {
    console.error('Save failed:', err.message);
  }
  ui.toggleElement(editMenu);
});

cancelBtn.addEventListener('click', () => {
  ui.toggleElement(editMenu);
});

popoutBtn.querySelector('a').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.windows.create({
    url: chrome.runtime.getURL('/src/markup/index.html?popout=true'),
    type: 'popup',
    width: 356,
    height: 520,
    focused: true,
  });
  window.close();
});

document.getElementById('logout').querySelector('a').addEventListener('click', async (e) => {
  e.preventDefault();
  await signOut();
  window.location.href = '/src/markup/signin.html';
});

async function getUrl() {
  try {
    const [tab] = await chrome.tabs.query({ currentWindow: true, active: true });
    return tab ? tab.url : null;
  } catch (error) {
    return null;
  }
}

async function autoLoad() {
  const url = await getUrl();
  const domain = data.getDomainName(url);
  const externalId = data.getIdFromUrl(url);
  const internalId =
    data.findByExternalId(externalId, domain) !== undefined
      ? data.findByExternalId(externalId, domain)
      : 1;
  data.setActive(internalId);
}

function renderActive() {
  ui.updateName(data.active, info.querySelector('#name'));
  ui.updateId(data.findId(data.active), info.querySelector('#id'));
  ui.updateLifespan(data.active.birth, data.active.death, info.querySelector('#lifespan'));
  ui.updateLinks(data.getAllLinks(data.active), quicklinks);
}

function populateEditMenu() {
  editMenu.querySelector('#firstInput').value      = data.active.first;
  editMenu.querySelector('#middleInput').value     = data.active.middle;
  editMenu.querySelector('#surnameInput').value    = data.active.surname;
  editMenu.querySelector('#maidenInput').value     = data.active.maiden;
  editMenu.querySelector('#birthInput').value      = data.active.birth;
  editMenu.querySelector('#deathInput').value      = data.active.death;
  editMenu.querySelector('#ancestryInput').value   = data.active.ancestry;
  editMenu.querySelector('#familysearchInput').value = data.active.familysearch;
  editMenu.querySelector('#findagraveInput').value = data.active.findagrave;
  editMenu.querySelector('#myheritageInput').value = data.active.myheritage;
}
