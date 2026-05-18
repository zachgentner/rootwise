import * as data from './data.js';
import * as ui from './ui.js';
import { getSession, signOut } from './auth.js';

const info = document.getElementById('info');
const quicklinks = document.getElementById('quicklinks');
const search = document.getElementById('search');
const input = document.getElementById('input');
const edit = document.getElementById('edit');
const editMenu = document.getElementById('editMenu');
const webSearchMenu = document.getElementById('webSearchMenu');
const linkMenu      = document.getElementById('linkMenu');

let pendingLink = null; // { field: 'father_id' | 'mother_id' | 'child', label: string }
const saveBtn = document.getElementById('save-btn');
const deleteBtn = document.getElementById('delete-btn');
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
  if (e.key === 'Escape') {
    if (linkMenu.style.display !== 'none')      { pendingLink = null; ui.toggleElement(linkMenu); }
    else if (editMenu.style.display !== 'none')  ui.toggleElement(editMenu);
    else if (webSearchMenu.style.display !== 'none') ui.toggleElement(webSearchMenu);
  }
});

document.getElementById('websearch').querySelector('a').addEventListener('click', (e) => {
  e.preventDefault();
  populateWebSearch();
  ui.toggleElement(webSearchMenu);
});

document.getElementById('webSearchCancel').addEventListener('click', () => {
  ui.toggleElement(webSearchMenu);
});

document.getElementById('linkCancel').addEventListener('click', () => {
  pendingLink = null;
  ui.toggleElement(linkMenu);
});

document.getElementById('btn-add-child').addEventListener('click', () => {
  openLinkOverlay('child', 'Attach Child');
});

document.getElementById('link-add-new').addEventListener('click', () => {
  pendingLink = null;
  ui.toggleElement(linkMenu);
  editMenu.querySelectorAll('input[type="text"]').forEach((el) => { el.value = ''; });
  ui.toggleElement(editMenu);
});

document.getElementById('linkInput').addEventListener('input', (e) => {
  populateLinkResults(e.target.value);
});

document.getElementById('notes').querySelector('a').addEventListener('click', (e) => {
  e.preventDefault();
  const id = data.findId(data.active);
  window.location.href = `/src/markup/notes.html?id=${id}`;
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

deleteBtn.addEventListener('click', async () => {
  const id = data.findId(data.active);
  if (!id) return;
  if (!confirm('Delete this ancestor? This cannot be undone.')) return;
  try {
    await data.deletePerson(id);
    ui.toggleElement(editMenu);
    if (data.active) renderActive();
  } catch (err) {
    console.error('Delete failed:', err.message);
  }
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
  renderFamily();
}

function populateWebSearch() {
  const person = data.active;
  const nameParts = [person.first, person.middle ? `${person.middle[0]}.` : '', person.surname].filter(Boolean);
  const fullName = nameParts.join(' ');
  const lifespan = [person.birth, person.death].filter(Boolean).join(' – ');

  webSearchMenu.querySelector('#websearch-name').textContent = fullName || '—';
  webSearchMenu.querySelector('#websearch-dates').textContent = lifespan || '';

  const searchName = [person.first, person.maiden || person.surname].filter(Boolean).join(' ');
  const googleQuery = [searchName, person.birth, 'genealogy'].filter(Boolean).join(' ');
  webSearchMenu.querySelector('#ws-google').href =
    `https://www.google.com/search?q=${encodeURIComponent(googleQuery)}`;

  const fsParams = new URLSearchParams();
  if (person.first) fsParams.set('q.givenName', person.first);
  const fsSurname = person.maiden || person.surname;
  if (fsSurname) fsParams.set('q.surname', fsSurname);
  if (person.birth) {
    const yr = parseInt(person.birth, 10);
    if (!isNaN(yr)) {
      fsParams.set('q.birthLikeDate.from', yr - 5);
      fsParams.set('q.birthLikeDate.to', yr + 5);
    }
  }
  webSearchMenu.querySelector('#ws-familysearch').href =
    `https://www.familysearch.org/search/record/results?${fsParams.toString()}`;
}

// ─── FAMILY PANEL ──────────────────────────────────────────────────────────

function renderFamily() {
  const activeId = data.findId(data.active);
  const { father, mother } = data.getParents(activeId);
  renderParentSlot(document.getElementById('slot-father'), father, 'father_id', 'Father');
  renderParentSlot(document.getElementById('slot-mother'), mother, 'mother_id', 'Mother');
  renderRelationRow(document.getElementById('row-siblings'), data.getSiblings(activeId));
  renderRelationRow(document.getElementById('row-children'), data.getChildren(activeId));
}

function renderParentSlot(container, relation, field, label) {
  container.innerHTML = '';
  if (relation) {
    const card = document.createElement('div');
    card.className = 'fam-card';
    card.innerHTML = `
      <span class="fam-card-role">${label}</span>
      <span class="fam-card-name">${personName(relation)}</span>
      ${personSubline(relation) ? `<span class="fam-card-sub">${personSubline(relation)}</span>` : ''}
    `;
    card.addEventListener('click', () => {
      data.setActive(relation._id);
      renderActive();
    });

    const unlink = document.createElement('button');
    unlink.className = 'fam-unlink';
    unlink.title = `Unlink ${label.toLowerCase()}`;
    unlink.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    unlink.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await data.setRelation(data.findId(data.active), field, null);
        renderFamily();
      } catch (err) {
        console.error('Unlink failed:', err.message);
      }
    });
    card.appendChild(unlink);
    container.appendChild(card);
  } else {
    const empty = document.createElement('button');
    empty.className = 'fam-empty';
    empty.innerHTML = `<i class="fa-solid fa-plus"></i><span>${label}</span>`;
    empty.addEventListener('click', () => openLinkOverlay(field, `Attach ${label}`));
    container.appendChild(empty);
  }
}

function renderRelationRow(container, relations) {
  container.innerHTML = '';
  if (!relations.length) {
    const note = document.createElement('span');
    note.className = 'fam-none';
    note.textContent = '—';
    container.appendChild(note);
    return;
  }
  relations.forEach((person) => {
    const chip = document.createElement('button');
    chip.className = 'fam-chip';
    chip.textContent = personName(person);
    chip.title = personName(person);
    chip.addEventListener('click', () => {
      data.setActive(person._id);
      renderActive();
    });
    container.appendChild(chip);
  });
}

function personName(person) {
  return [person.first, person.surname || person.maiden].filter(Boolean).join(' ') || '—';
}

function personSubline(person) {
  return [person.birth, person.death].filter(Boolean).join(' – ');
}

function openLinkOverlay(field, title) {
  pendingLink = { field };
  document.getElementById('link-title').textContent = title;
  document.getElementById('linkInput').value = '';
  populateLinkResults('');
  ui.toggleElement(linkMenu);
  setTimeout(() => document.getElementById('linkInput').focus(), 50);
}

function populateLinkResults(query) {
  const list = document.getElementById('linkResults');
  list.innerHTML = '';
  const activeId = data.findId(data.active);

  data.searchByName(query)
    .filter((p) => data.findId(p) !== activeId)
    .forEach((person) => {
      const personId = data.findId(person);
      const li = document.createElement('li');
      const sub = personSubline(person);
      li.innerHTML = `
        <span class="link-result-name">${personName(person)}</span>
        ${sub ? `<span class="link-result-sub">${sub}</span>` : ''}
      `;
      li.addEventListener('click', async () => {
        if (!pendingLink) return;
        try {
          if (pendingLink.field === 'child') {
            if (person.father_id != null && person.mother_id != null) {
              alert('This person already has two parents linked.');
              return;
            }
            const childField = person.father_id == null ? 'father_id' : 'mother_id';
            await data.setRelation(personId, childField, activeId);
          } else {
            await data.setRelation(activeId, pendingLink.field, personId);
          }
        } catch (err) {
          console.error('Link failed:', err.message);
        }
        pendingLink = null;
        ui.toggleElement(linkMenu);
        renderFamily();
      });
      list.appendChild(li);
    });
}

// ───────────────────────────────────────────────────────────────────────────

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
