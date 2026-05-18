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
const urlsMenu      = document.getElementById('urlsMenu');

let pendingLink    = null; // { field: 'father_id' | 'mother_id' | 'child' }
let pendingNewLink = null; // { field, originId } — set when "create new" is triggered from link overlay
let isAddingNew    = false;
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
    if (linkMenu.style.display !== 'none')           { pendingLink = null; ui.toggleElement(linkMenu); }
    else if (editMenu.style.display !== 'none')       ui.toggleElement(editMenu);
    else if (webSearchMenu.style.display !== 'none')  ui.toggleElement(webSearchMenu);
    else if (urlsMenu.style.display !== 'none')       ui.toggleElement(urlsMenu);
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


document.getElementById('link-add-new').addEventListener('click', () => {
  const savedLink  = pendingLink;
  const originId   = data.findId(data.active);
  const rawQuery   = document.getElementById('linkInput').value;
  pendingLink = null;
  ui.toggleElement(linkMenu);

  isAddingNew = true;
  deleteBtn.style.display = 'none';
  editMenu.querySelectorAll('input[type="text"]').forEach((el) => { el.value = ''; });

  if (savedLink) {
    pendingNewLink = { field: savedLink.field, originId, spouseId: savedLink.spouseId ?? null };
  }

  const { first, middle, surname } = parseSearchName(rawQuery);
  if (first)   editMenu.querySelector('#firstInput').value   = first;
  if (middle)  editMenu.querySelector('#middleInput').value  = middle;
  if (surname) editMenu.querySelector('#surnameInput').value = surname;

  ui.toggleElement(editMenu);
});

document.getElementById('linkInput').addEventListener('input', (e) => {
  populateLinkResults(e.target.value);
});

document.getElementById('links').querySelector('a').addEventListener('click', (e) => {
  e.preventDefault();
  populateUrlsMenu();
  ui.toggleElement(urlsMenu);
});

document.getElementById('urlsCancel').addEventListener('click', () => {
  ui.toggleElement(urlsMenu);
});

document.getElementById('url-add-btn').addEventListener('click', async () => {
  const urlInput   = document.getElementById('url-input');
  const labelInput = document.getElementById('url-label-input');
  const url = urlInput.value.trim();
  if (!url) return;
  const title = labelInput.value.trim();
  const id    = data.findId(data.active);
  const links = [...(data.active.links || []), { title, url }];
  try {
    await data.saveLinks(id, links);
    urlInput.value   = '';
    labelInput.value = '';
    populateUrlsMenu();
  } catch (err) {
    console.error('Save link failed:', err.message);
  }
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
  results.style.position = 'absolute';
  results.style.left    = '0';
  results.style.right   = '0';
  results.style.zIndex  = '150';
  results.style.top     = (search.offsetTop + search.offsetHeight) + 'px';
  results.style.display = 'block';
  results.scrollTo(0, 0);
  ui.filterResults(data.searchByName(input.value), '', results);

  input.addEventListener('input', () => {
    results.innerHTML = '';
    ui.filterResults(data.searchByName(input.value), input.value, results);
    if (results.children.length === 0 && input.value.trim()) {
      const li = document.createElement('li');
      li.className = 'result-create-new';
      li.innerHTML = '<i class="fa-solid fa-user-plus"></i><span>Create new person</span>';
      li.addEventListener('click', () => {
        const query = input.value.trim();
        results.innerHTML = '';
        results.style.display = 'none';
        input.value = '';
        isAddingNew = true;
        deleteBtn.style.display = 'none';
        editMenu.querySelectorAll('input[type="text"]').forEach((el) => { el.value = ''; });
        const { first, middle, surname } = parseSearchName(query);
        if (first)   editMenu.querySelector('#firstInput').value   = first;
        if (middle)  editMenu.querySelector('#middleInput').value  = middle;
        if (surname) editMenu.querySelector('#surnameInput').value = surname;
        ui.toggleElement(editMenu);
      });
      results.appendChild(li);
    }
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
  isAddingNew = false;
  deleteBtn.style.display = '';
  populateEditMenu();
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

  const editStatus = document.getElementById('edit-status');
  editStatus.textContent = '';
  try {
    let id;
    if (isAddingNew) {
      id = await data.createPerson(updatedPerson);
      if (pendingNewLink) {
        const { field, originId, spouseId } = pendingNewLink;
        if (field === 'child') {
          await data.setRelation(String(id), 'father_id', originId);
          if (spouseId) await data.setRelation(String(id), 'mother_id', spouseId);
        } else if (field === 'spouse') {
          await data.addSpouse(originId, String(id));
        } else {
          await data.setRelation(originId, field, String(id));
        }
        pendingNewLink = null;
        data.setActive(originId);
      } else {
        data.setActive(id);
      }
    } else {
      id = data.findId(data.active);
      await data.savePerson(id, updatedPerson);
      data.setActive(id);
    }
    renderActive();
    isAddingNew = false;
    ui.toggleElement(editMenu);
  } catch (err) {
    editStatus.textContent = err.message || 'Save failed.';
    editStatus.dataset.state = 'error';
  }
});

deleteBtn.addEventListener('click', async () => {
  const id = data.findId(data.active);
  if (!id) return;
  if (!confirm('Delete this ancestor? This cannot be undone.')) return;
  try {
    await data.deletePerson(id);
    isAddingNew = false;
    ui.toggleElement(editMenu);
    if (data.active) renderActive();
  } catch (err) {
    console.error('Delete failed:', err.message);
  }
});

cancelBtn.addEventListener('click', () => {
  isAddingNew = false;
  pendingNewLink = null;
  deleteBtn.style.display = '';
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
  renderSiblingSection(document.getElementById('row-siblings'), data.getSiblings(activeId));
  renderSpouses();
}

function renderSpouses() {
  const container = document.getElementById('section-spouses');
  container.innerHTML = '';
  const activeId = data.findId(data.active);
  const spouses  = data.active.spouses || [];

  const head = document.createElement('div');
  head.className = 'fam-section-head';
  const label = document.createElement('span');
  label.className = 'fam-label';
  label.textContent = 'Spouses & Children';
  const addSpouseBtn = document.createElement('button');
  addSpouseBtn.className = 'fam-attach-btn';
  addSpouseBtn.title = 'Add spouse';
  addSpouseBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
  addSpouseBtn.addEventListener('click', () => openLinkOverlay('spouse', 'Attach Spouse'));
  head.appendChild(label);
  head.appendChild(addSpouseBtn);
  container.appendChild(head);

  spouses.forEach((entry) => {
    const spouseId = String(entry.id);
    const spouse   = data.findById(spouseId);
    if (!spouse) return;
    container.appendChild(buildSpouseBlock(activeId, spouseId, spouse, entry.marriage_year || '', false));
  });

  data.getCoParents(activeId).forEach((coParentId) => {
    const coParent = data.findById(coParentId);
    if (!coParent) return;
    container.appendChild(buildSpouseBlock(activeId, coParentId, coParent, '', true));
  });

  const orphans = data.getChildrenForRelation(activeId, null);
  if (orphans.length > 0) {
    const block = document.createElement('div');
    block.className = 'spouse-block';
    const card = document.createElement('div');
    card.className = 'spouse-card spouse-card--static';
    const meta = document.createElement('div');
    meta.className = 'spouse-card-meta';
    const roleEl = document.createElement('span');
    roleEl.className = 'spouse-card-role';
    roleEl.textContent = 'Unknown spouse';
    meta.appendChild(roleEl);
    card.appendChild(meta);
    block.appendChild(card);
    block.appendChild(buildChildrenSection(activeId, null, orphans));
    container.appendChild(block);
  }

  if (spouses.length === 0 && data.getCoParents(activeId).length === 0 && orphans.length === 0) {
    const none = document.createElement('span');
    none.className = 'fam-none';
    none.textContent = '—';
    container.appendChild(none);
  }
}

function buildSpouseBlock(activeId, spouseId, spouse, marriageYear, isCoParent) {
  const block = document.createElement('div');
  block.className = 'spouse-block';

  const card = document.createElement('div');
  card.className = 'spouse-card';
  card.addEventListener('click', () => { data.setActive(spouseId); renderActive(); });

  const meta = document.createElement('div');
  meta.className = 'spouse-card-meta';

  const roleEl = document.createElement('span');
  roleEl.className = 'spouse-card-role';
  roleEl.textContent = isCoParent ? 'Co-parent' : 'Spouse';
  meta.appendChild(roleEl);

  const yearRow = document.createElement('div');
  yearRow.className = 'spouse-year-row';
  const mLabel = document.createElement('span');
  mLabel.className = 'spouse-m-label';
  mLabel.textContent = 'm.';
  const yearInput = document.createElement('input');
  yearInput.type = 'text';
  yearInput.className = 'spouse-year-input';
  yearInput.placeholder = 'yyyy';
  yearInput.maxLength = 4;
  yearInput.value = marriageYear;
  yearInput.addEventListener('click', (e) => e.stopPropagation());
  yearInput.addEventListener('change', async () => {
    const year = yearInput.value.trim();
    try {
      if (isCoParent) {
        await data.addSpouse(activeId, spouseId);
        if (year) await data.updateMarriageYear(activeId, spouseId, year);
        renderFamily();
      } else {
        await data.updateMarriageYear(activeId, spouseId, year);
      }
    } catch (err) { console.error('Save marriage year failed:', err.message); }
  });
  yearRow.appendChild(mLabel);
  yearRow.appendChild(yearInput);

  card.appendChild(meta);

  const nameEl = document.createElement('span');
  nameEl.className = 'spouse-card-name';
  nameEl.textContent = personName({ ...spouse, _id: spouseId });
  card.appendChild(nameEl);

  const bottomRow = document.createElement('div');
  bottomRow.className = 'spouse-bottom-row';
  const sub = personSubline(spouse);
  if (sub) {
    const subEl = document.createElement('span');
    subEl.className = 'spouse-card-sub';
    subEl.textContent = sub;
    bottomRow.appendChild(subEl);
  }
  bottomRow.appendChild(yearRow);
  card.appendChild(bottomRow);

  const unlinkBtn = document.createElement('button');
  unlinkBtn.className = 'fam-unlink';
  unlinkBtn.title = isCoParent ? 'Remove co-parent link' : 'Unlink spouse';
  unlinkBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  unlinkBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      if (isCoParent) {
        await data.removeCoParent(activeId, spouseId);
      } else {
        await data.removeSpouse(activeId, spouseId);
      }
      renderFamily();
    } catch (err) { console.error('Remove failed:', err.message); }
  });
  card.appendChild(unlinkBtn);

  block.appendChild(card);
  block.appendChild(buildChildrenSection(activeId, spouseId, data.getChildrenForRelation(activeId, spouseId)));

  return block;
}

function buildChildrenSection(activeId, spouseId, children) {
  const section = document.createElement('div');
  section.className = 'spouse-children-section';
  children.forEach((child) => {
    const chip = document.createElement('button');
    chip.className = 'fam-chip';
    chip.textContent = personName(child);
    chip.title = personName(child);
    chip.addEventListener('click', () => { data.setActive(child._id); renderActive(); });
    section.appendChild(chip);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'fam-attach-btn';
  addBtn.title = 'Add child';
  addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openLinkOverlay('child', 'Attach Child', spouseId);
  });
  section.appendChild(addBtn);
  return section;
}

function renderParentSlot(container, relation, field, label) {
  container.innerHTML = '';
  if (relation) {
    const card = document.createElement('div');
    card.className = 'fam-card';
    card.addEventListener('click', () => { data.setActive(relation._id); renderActive(); });

    const roleEl = document.createElement('span');
    roleEl.className = 'fam-card-role';
    roleEl.textContent = label;
    card.appendChild(roleEl);

    const nameEl = document.createElement('span');
    nameEl.className = 'fam-card-name';
    nameEl.textContent = personName(relation);
    card.appendChild(nameEl);

    const sub = personSubline(relation);
    if (sub) {
      const subEl = document.createElement('span');
      subEl.className = 'fam-card-sub';
      subEl.textContent = sub;
      card.appendChild(subEl);
    }

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

function renderSiblingSection(container, siblings) {
  container.innerHTML = '';
  if (!siblings.length) {
    const note = document.createElement('span');
    note.className = 'fam-none';
    note.textContent = '—';
    container.appendChild(note);
    return;
  }
  siblings.forEach((person) => {
    const chip = document.createElement('button');
    chip.className = 'fam-chip';
    chip.textContent = personName(person);
    chip.title = personName(person);
    chip.addEventListener('click', () => { data.setActive(person._id); renderActive(); });
    container.appendChild(chip);
  });
}

function parseSearchName(query) {
  const trimmed = query.trim();
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx !== -1) {
    const surname    = trimmed.slice(0, commaIdx).trim();
    const afterComma = trimmed.slice(commaIdx + 1).trim();
    const spaceIdx   = afterComma.indexOf(' ');
    if (spaceIdx !== -1) {
      return { surname, first: afterComma.slice(0, spaceIdx).trim(), middle: afterComma.slice(spaceIdx + 1).trim() };
    }
    return { surname, first: afterComma, middle: '' };
  }
  return { surname: trimmed, first: '', middle: '' };
}

function personName(person) {
  return [person.first, person.surname || person.maiden].filter(Boolean).join(' ') || '—';
}

function personSubline(person) {
  return [person.birth, person.death].filter(Boolean).join(' – ');
}

function openLinkOverlay(field, title, spouseId = null) {
  pendingLink = { field, spouseId };
  document.getElementById('link-title').textContent = title;
  document.getElementById('linkInput').value = '';
  const status = document.getElementById('link-status');
  status.textContent = '';
  delete status.dataset.state;
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
        const statusEl = document.getElementById('link-status');
        statusEl.textContent = '';
        delete statusEl.dataset.state;
        try {
          if (pendingLink.field === 'spouse') {
            await data.addSpouse(activeId, personId);
          } else if (pendingLink.field === 'child') {
            if (person.father_id != null && person.mother_id != null) {
              statusEl.textContent = 'This person already has two parents linked.';
              statusEl.dataset.state = 'error';
              return;
            }
            const childField = person.father_id == null ? 'father_id' : 'mother_id';
            await data.setRelation(personId, childField, activeId);
            if (pendingLink.spouseId != null) {
              const otherField = childField === 'father_id' ? 'mother_id' : 'father_id';
              const updated = data.findById(personId);
              if (updated && updated[otherField] == null) {
                await data.setRelation(personId, otherField, pendingLink.spouseId);
              }
            }
          } else {
            await data.setRelation(activeId, pendingLink.field, personId);
          }
          pendingLink = null;
          ui.toggleElement(linkMenu);
          renderFamily();
        } catch (err) {
          console.error('Link failed:', err);
          statusEl.textContent = err.message || 'Save failed — check the browser console.';
          statusEl.dataset.state = 'error';
          renderFamily();
        }
      });
      list.appendChild(li);
    });
}

// ───────────────────────────────────────────────────────────────────────────

function populateUrlsMenu() {
  const list  = document.getElementById('urls-list');
  list.innerHTML = '';
  const links = data.active.links || [];

  if (!links.length) {
    const empty = document.createElement('li');
    empty.className = 'urls-empty';
    empty.textContent = 'No links yet.';
    list.appendChild(empty);
    return;
  }

  links.forEach((link, i) => {
    const li      = document.createElement('li');
    li.className  = 'url-item';

    const anchor  = document.createElement('a');
    anchor.href   = link.url;
    anchor.target = '_blank';
    anchor.rel    = 'noopener noreferrer';
    anchor.className = 'url-item-body';
    anchor.innerHTML = `
      <span class="url-item-title">${link.title || link.url}</span>
      <span class="url-item-href">${link.url}</span>
    `;

    const del = document.createElement('button');
    del.className = 'url-item-delete';
    del.title     = 'Remove';
    del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    del.addEventListener('click', async (e) => {
      e.preventDefault();
      const id      = data.findId(data.active);
      const updated = (data.active.links || []).filter((_, idx) => idx !== i);
      try {
        await data.saveLinks(id, updated);
        populateUrlsMenu();
      } catch (err) {
        console.error('Delete link failed:', err.message);
      }
    });

    li.appendChild(anchor);
    li.appendChild(del);
    list.appendChild(li);
  });
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
