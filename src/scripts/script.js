import * as data from './data.js';
import * as ui from './ui.js';
import { getSession, signOut } from './auth.js';
import { reformatDate, extractYear, formatPlaceholder, parseDate, formatDate } from './dates.js';
import { normalizePlace, parsePlace, formatPlace, geocodeCounty } from './places.js';

const info = document.getElementById('info');
const quicklinks = document.getElementById('quicklinks');
const search = document.getElementById('search');
const input = document.getElementById('input');
const edit = document.getElementById('edit');
const editMenu = document.getElementById('editMenu');
const webSearchMenu = document.getElementById('webSearchMenu');
const linkMenu      = document.getElementById('linkMenu');
const urlsMenu      = document.getElementById('urlsMenu');
const sourcesMenu   = document.getElementById('sourcesMenu');
const notesMenu     = document.getElementById('notesMenu');
const notesInput    = document.getElementById('notes-input');
const notesStatus   = document.getElementById('notes-status');
const tasksMenu     = document.getElementById('tasksMenu');
const healthMenu    = document.getElementById('healthMenu');
const photosMenu    = document.getElementById('photosMenu');

let notesOpen = false;
let notesSaveTimer = null;
let linksOpen = false;
let sourcesOpen = false;
let tasksOpen = false;
let healthOpen = false;
let webSearchOpen = false;
let photosOpen = false;
let completedCollapsed = true;
let dupeCheckBypassed = false;

let pendingLink    = null; // { field: 'father_id' | 'mother_id' | 'child' }
let pendingNewLink = null; // { field, originId } — set when "create new" is triggered from link overlay
let isAddingNew    = false;
const saveBtn = document.getElementById('save-btn');
const deleteBtn = document.getElementById('delete-btn');
const cancelBtn = document.getElementById('editCancel');
const popoutBtn = document.getElementById('popout');

const isPopout = new URLSearchParams(window.location.search).get('popout') === 'true';
if (isPopout) popoutBtn.style.display = 'none';

function attachDateValidation(input) {
  input.addEventListener('blur', () => {
    const val = input.value.trim();
    if (!val) { delete input.dataset.invalid; return; }
    const parsed = parseDate(val);
    if (parsed) {
      const reformatted = formatDate(parsed, data.dateFormat);
      if (reformatted) input.value = reformatted;
      delete input.dataset.invalid;
    } else {
      input.dataset.invalid = 'true';
    }
  });
  input.addEventListener('input', () => { delete input.dataset.invalid; });
}

attachDateValidation(editMenu.querySelector('#birthInput'));
attachDateValidation(editMenu.querySelector('#deathInput'));
attachDateValidation(document.getElementById('health-date-input'));

function attachPlaceNormalization(input) {
  input.addEventListener('blur', async () => {
    const val = input.value.trim();
    if (!val) return;

    const normalized = normalizePlace(val);
    input.value = normalized;

    const parts = parsePlace(normalized);
    if (!parts) return;

    const county = await geocodeCounty(parts);
    if (!county) return;
    if (parts.some((p) => p.toLowerCase() === county.toLowerCase())) return;

    input.value = formatPlace([parts[0], county, ...parts.slice(1)]);
  });
}

attachPlaceNormalization(editMenu.querySelector('#birthPlaceInput'));
attachPlaceNormalization(editMenu.querySelector('#deathPlaceInput'));

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
    if (linkMenu.style.display !== 'none')                                        { pendingLink = null; ui.toggleElement(linkMenu); }
    else if (editMenu.style.display !== 'none')                                    ui.toggleElement(editMenu);
    else if (document.getElementById('sourceAddMenu').style.display    !== 'none') closeSourceAdd();
    else if (document.getElementById('photoAddMenu').style.display     !== 'none') closePhotoAdd();
    else if (document.getElementById('urlAddMenu').style.display       !== 'none') closeUrlAdd();
    else if (document.getElementById('webSearchAddMenu').style.display !== 'none') closeWebSearchAdd();
    else if (document.getElementById('healthAddMenu').style.display    !== 'none') closeHealthAdd();
    else if (photosOpen)                                                            closePhotos();
    else if (sourcesOpen)                                                           closeSources();
    else if (linksOpen)                                                             closeLinks();
    else if (tasksOpen)                                                             closeTasks();
    else if (healthOpen)                                                            closeHealth();
    else if (webSearchOpen)                                                         closeWebSearch();
    else if (notesOpen)                                                             closeNotes();
  }
});

document.getElementById('sources').querySelector('a').addEventListener('click', (e) => {
  e.preventDefault();
  sourcesOpen ? closeSources() : openSources();
});

document.getElementById('photos').querySelector('a').addEventListener('click', (e) => {
  e.preventDefault();
  photosOpen ? closePhotos() : openPhotos();
});

document.getElementById('websearch').querySelector('a').addEventListener('click', (e) => {
  e.preventDefault();
  webSearchOpen ? closeWebSearch() : openWebSearch();
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
  linksOpen ? closeLinks() : openLinks();
});


document.getElementById('url-add-btn').addEventListener('click', openUrlAdd);
document.getElementById('urlAddCancel').addEventListener('click', closeUrlAdd);
document.getElementById('url-save-btn').addEventListener('click', addUrl);

async function addUrl() {
  const urlInput   = document.getElementById('url-input');
  const labelInput = document.getElementById('url-label-input');
  const url = urlInput.value.trim();
  if (!url) return;
  const title = labelInput.value.trim();
  const id    = data.findId(data.active);
  const links = [...(data.active.links || []), { title, url }];
  try {
    await data.saveLinks(id, links);
    closeUrlAdd();
    populateUrlsMenu();
  } catch (err) {
    console.error('Save link failed:', err.message);
  }
}

function openUrlAdd() {
  document.getElementById('url-input').value       = '';
  document.getElementById('url-label-input').value = '';
  document.getElementById('urlAddMenu').style.display = 'flex';
  document.getElementById('url-input').focus();
}

function closeUrlAdd() {
  document.getElementById('urlAddMenu').style.display = 'none';
}

document.getElementById('notes').querySelector('a').addEventListener('click', (e) => {
  e.preventDefault();
  notesOpen ? closeNotes() : openNotes();
});

notesInput.addEventListener('input', () => {
  clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(async () => {
    const id = data.findId(data.active);
    try {
      await data.saveNotes(id, notesInput.value);
      notesStatus.textContent = 'Saved';
      setTimeout(() => { notesStatus.textContent = ''; }, 1500);
    } catch (err) {
      console.error('Save notes failed:', err.message);
    }
  }, 800);
});

function openNotes() {
  if (photosOpen) closePhotos();
  if (sourcesOpen) closeSources();
  if (linksOpen) closeLinks();
  if (tasksOpen) closeTasks();
  if (healthOpen) closeHealth();
  if (webSearchOpen) closeWebSearch();
  notesOpen = true;
  quicklinks.style.display = 'none';
  search.style.display = 'none';
  document.getElementById('family').style.display = 'none';
  notesInput.value = data.active.notes || '';
  notesMenu.style.display = 'flex';
  notesInput.focus();
  document.getElementById('notes').classList.add('toolbar-btn--active');
}

function closeNotes() {
  clearTimeout(notesSaveTimer);
  notesOpen = false;
  notesMenu.style.display = 'none';
  quicklinks.style.display = '';
  search.style.display = '';
  document.getElementById('family').style.display = '';
  document.getElementById('notes').classList.remove('toolbar-btn--active');
}

function openLinks() {
  if (photosOpen) closePhotos();
  if (sourcesOpen) closeSources();
  if (notesOpen) closeNotes();
  if (tasksOpen) closeTasks();
  if (healthOpen) closeHealth();
  if (webSearchOpen) closeWebSearch();
  linksOpen = true;
  quicklinks.style.display = 'none';
  search.style.display = 'none';
  document.getElementById('family').style.display = 'none';
  populateUrlsMenu();
  urlsMenu.style.display = 'flex';
  document.getElementById('links').classList.add('toolbar-btn--active');
}

function closeLinks() {
  closeUrlAdd();
  linksOpen = false;
  urlsMenu.style.display = 'none';
  quicklinks.style.display = '';
  search.style.display = '';
  document.getElementById('family').style.display = '';
  document.getElementById('links').classList.remove('toolbar-btn--active');
}

function openSources() {
  if (photosOpen) closePhotos();
  if (sourcesOpen) return;
  if (notesOpen) closeNotes();
  if (linksOpen) closeLinks();
  if (tasksOpen) closeTasks();
  if (healthOpen) closeHealth();
  if (webSearchOpen) closeWebSearch();
  sourcesOpen = true;
  quicklinks.style.display = 'none';
  search.style.display = 'none';
  document.getElementById('family').style.display = 'none';
  populateSourcesMenu();
  sourcesMenu.style.display = 'flex';
  document.getElementById('sources').classList.add('toolbar-btn--active');
}

function closeSources() {
  closeSourceAdd();
  sourcesOpen = false;
  sourcesMenu.style.display = 'none';
  quicklinks.style.display = '';
  search.style.display = '';
  document.getElementById('family').style.display = '';
  document.getElementById('sources').classList.remove('toolbar-btn--active');
}

function buildSourceItem(source, i) {
  const li = document.createElement('li');
  li.className = 'source-item';

  const body = document.createElement('div');
  body.className = 'source-item-body';

  const titleEl = document.createElement('span');
  titleEl.className = 'source-item-title';
  titleEl.textContent = source.title;
  body.appendChild(titleEl);

  if (source.repository) {
    const repoEl = document.createElement('span');
    repoEl.className = 'source-item-repo';
    repoEl.textContent = source.repository;
    body.appendChild(repoEl);
  }

  if (source.date_accessed) {
    const dateEl = document.createElement('span');
    dateEl.className = 'source-item-date';
    dateEl.textContent = `Accessed: ${source.date_accessed}`;
    body.appendChild(dateEl);
  }

  if (source.notes) {
    const notesEl = document.createElement('span');
    notesEl.className = 'source-item-notes';
    notesEl.textContent = source.notes;
    body.appendChild(notesEl);
  }

  li.appendChild(body);

  if (source.url) {
    const linkEl = document.createElement('a');
    linkEl.className = 'source-item-link';
    linkEl.href = source.url;
    linkEl.target = '_blank';
    linkEl.rel = 'noopener noreferrer';
    linkEl.title = 'Open source';
    linkEl.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i>';
    li.appendChild(linkEl);
  }

  const del = document.createElement('button');
  del.className = 'source-item-delete';
  del.title = 'Remove';
  del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  del.addEventListener('click', async (e) => {
    e.preventDefault();
    const id = data.findId(data.active);
    const updated = (data.active.sources || []).filter((_, idx) => idx !== i);
    try {
      await data.saveSources(id, updated);
      populateSourcesMenu();
    } catch (err) {
      console.error('Delete source failed:', err.message);
    }
  });
  li.appendChild(del);

  return li;
}

function populateSourcesMenu() {
  const list = document.getElementById('sources-list');
  list.innerHTML = '';
  const sources = data.active.sources || [];

  if (!sources.length) {
    const empty = document.createElement('li');
    empty.className = 'sources-empty';
    empty.textContent = 'No sources yet.';
    list.appendChild(empty);
    return;
  }

  sources.forEach((source, i) => list.appendChild(buildSourceItem(source, i)));
}

document.getElementById('source-add-btn').addEventListener('click', openSourceAdd);
document.getElementById('sourceAddCancel').addEventListener('click', closeSourceAdd);
document.getElementById('source-save-btn').addEventListener('click', addSource);

function openSourceAdd() {
  document.getElementById('source-title-input').value = '';
  document.getElementById('source-repo-input').value  = '';
  document.getElementById('source-url-input').value   = '';
  document.getElementById('source-date-input').value  = '';
  document.getElementById('source-notes-input').value = '';
  document.getElementById('sourceAddMenu').style.display = 'flex';
  document.getElementById('source-title-input').focus();
}

function closeSourceAdd() {
  document.getElementById('sourceAddMenu').style.display = 'none';
}

async function addSource() {
  const titleInput  = document.getElementById('source-title-input');
  const repoInput   = document.getElementById('source-repo-input');
  const urlInput    = document.getElementById('source-url-input');
  const dateInput   = document.getElementById('source-date-input');
  const notesInput2 = document.getElementById('source-notes-input');

  const title = titleInput.value.trim();
  if (!title) return;

  const source = {
    id:            Date.now(),
    title,
    repository:    repoInput.value.trim(),
    url:           urlInput.value.trim(),
    date_accessed: dateInput.value.trim(),
    notes:         notesInput2.value.trim(),
  };

  const id = data.findId(data.active);
  const updated = [...(data.active.sources || []), source];
  try {
    await data.saveSources(id, updated);
    closeSourceAdd();
    populateSourcesMenu();
  } catch (err) {
    console.error('Add source failed:', err.message);
  }
}

document.getElementById('tasks').querySelector('a').addEventListener('click', (e) => {
  e.preventDefault();
  tasksOpen ? closeTasks() : openTasks();
});

document.getElementById('task-add-btn').addEventListener('click', addTask);
document.getElementById('task-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTask();
});

async function addTask() {
  const input = document.getElementById('task-input');
  const text = input.value.trim();
  if (!text) return;
  const id = data.findId(data.active);
  const tasks = [...(data.active.tasks || []), { id: Date.now(), text, done: false }];
  try {
    await data.saveTasks(id, tasks);
    input.value = '';
    populateTasksMenu();
  } catch (err) {
    console.error('Add task failed:', err.message);
  }
}

function openTasks() {
  if (photosOpen) closePhotos();
  if (sourcesOpen) closeSources();
  if (notesOpen) closeNotes();
  if (linksOpen) closeLinks();
  if (healthOpen) closeHealth();
  if (webSearchOpen) closeWebSearch();
  tasksOpen = true;
  quicklinks.style.display = 'none';
  search.style.display = 'none';
  document.getElementById('family').style.display = 'none';
  populateTasksMenu();
  tasksMenu.style.display = 'flex';
  document.getElementById('tasks').classList.add('toolbar-btn--active');
}

function closeTasks() {
  tasksOpen = false;
  tasksMenu.style.display = 'none';
  quicklinks.style.display = '';
  search.style.display = '';
  document.getElementById('family').style.display = '';
  document.getElementById('tasks').classList.remove('toolbar-btn--active');
}

// ── Health panel ──────────────────────────────────────────────────────────────

document.getElementById('health').querySelector('a').addEventListener('click', (e) => {
  e.preventDefault();
  healthOpen ? closeHealth() : openHealth();
});

document.getElementById('health-add-btn').addEventListener('click', openHealthAdd);
document.getElementById('healthAddCancel').addEventListener('click', closeHealthAdd);
document.getElementById('health-save-btn').addEventListener('click', addHealthCondition);

document.getElementById('health-cod-input').addEventListener('blur', async () => {
  const val     = document.getElementById('health-cod-input').value.trim();
  const events  = data.active.events || [];
  const existing = events.find((e) => e.type === 'cause_of_death');
  if (val === (existing?.title || '')) return;

  let updated;
  if (!val) {
    updated = events.filter((e) => e.type !== 'cause_of_death');
  } else if (existing) {
    updated = events.map((e) => e.type === 'cause_of_death' ? { ...e, title: val } : e);
  } else {
    updated = [...events, {
      id:    Date.now(),
      type:  'cause_of_death',
      title: val,
      date:  data.active.death       || '',
      place: data.active.death_place || '',
      notes: '',
      data:  {},
    }];
  }

  const id = data.findId(data.active);
  try {
    await data.saveEvents(id, updated);
  } catch (err) {
    console.error('Save cause of death failed:', err.message);
  }
});

function openHealth() {
  if (photosOpen) closePhotos();
  if (sourcesOpen) closeSources();
  if (notesOpen) closeNotes();
  if (linksOpen) closeLinks();
  if (tasksOpen) closeTasks();
  if (webSearchOpen) closeWebSearch();
  healthOpen = true;
  quicklinks.style.display = 'none';
  search.style.display = 'none';
  document.getElementById('family').style.display = 'none';
  populateHealthMenu();
  healthMenu.style.display = 'flex';
  document.getElementById('health').classList.add('toolbar-btn--active');
}

function closeHealth() {
  healthOpen = false;
  healthMenu.style.display = 'none';
  quicklinks.style.display = '';
  search.style.display = '';
  document.getElementById('family').style.display = '';
  document.getElementById('health').classList.remove('toolbar-btn--active');
}

function openHealthAdd() {
  document.getElementById('health-condition-input').value = '';
  document.getElementById('health-date-input').value = '';
  document.getElementById('health-notes-input').value = '';
  document.getElementById('healthAddMenu').style.display = 'flex';
  document.getElementById('health-condition-input').focus();
}

function closeHealthAdd() {
  document.getElementById('healthAddMenu').style.display = 'none';
}

function buildHealthItem(item) {
  const li = document.createElement('li');
  li.className = 'health-item';

  const body = document.createElement('div');
  body.className = 'health-item-body';

  const titleEl = document.createElement('span');
  titleEl.className = 'health-item-condition';
  titleEl.textContent = item.title;
  body.appendChild(titleEl);

  if (item.date) {
    const dateEl = document.createElement('span');
    dateEl.className = 'health-item-date';
    dateEl.textContent = item.date;
    body.appendChild(dateEl);
  }

  if (item.place) {
    const placeEl = document.createElement('span');
    placeEl.className = 'health-item-notes';
    placeEl.textContent = item.place;
    body.appendChild(placeEl);
  }

  if (item.notes) {
    const notesEl = document.createElement('span');
    notesEl.className = 'health-item-notes';
    notesEl.textContent = item.notes;
    body.appendChild(notesEl);
  }

  li.appendChild(body);

  const del = document.createElement('button');
  del.className = 'health-item-delete';
  del.title = 'Remove';
  del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  del.addEventListener('click', async (e) => {
    e.preventDefault();
    const personId = data.findId(data.active);
    const updated = (data.active.events || []).filter((ev) => ev.id !== item.id);
    try {
      await data.saveEvents(personId, updated);
      populateHealthMenu();
    } catch (err) {
      console.error('Delete health event failed:', err.message);
    }
  });
  li.appendChild(del);

  return li;
}

function populateHealthMenu() {
  const hasDeath = !!data.active.death;
  const codRow   = document.querySelector('.health-cod-row');
  codRow.style.display = hasDeath ? '' : 'none';

  const events       = data.active.events || [];
  const cod          = events.find((e) => e.type === 'cause_of_death');
  const healthEvents = events
    .filter((e) => e.type === 'health')
    .sort((a, b) => {
      const pa = parseDate(a.date), pb = parseDate(b.date);
      if (!pa && !pb) return 0;
      if (!pa) return 1;
      if (!pb) return -1;
      return (pa.year - pb.year) || ((pa.month ?? 0) - (pb.month ?? 0)) || ((pa.day ?? 0) - (pb.day ?? 0));
    });

  document.getElementById('health-cod-input').value = cod?.title || '';

  const list = document.getElementById('health-list');
  list.innerHTML = '';

  if (!healthEvents.length) {
    const empty = document.createElement('li');
    empty.className = 'health-empty';
    empty.textContent = 'No health events recorded.';
    list.appendChild(empty);
    return;
  }

  healthEvents.forEach((item) => list.appendChild(buildHealthItem(item)));
}

async function addHealthCondition() {
  const conditionInput = document.getElementById('health-condition-input');
  const dateInput      = document.getElementById('health-date-input');
  const notesInput3    = document.getElementById('health-notes-input');

  const condition = conditionInput.value.trim();
  if (!condition) return;

  const item = {
    id:    Date.now(),
    type:  'health',
    title: condition,
    date:  reformatDate(dateInput.value.trim(), data.dateFormat),
    place: '',
    notes: notesInput3.value.trim(),
    data:  {},
  };

  const id = data.findId(data.active);
  const updated = [...(data.active.events || []), item];
  try {
    await data.saveEvents(id, updated);
    closeHealthAdd();
    populateHealthMenu();
  } catch (err) {
    console.error('Add health event failed:', err.message);
  }
}


function openWebSearch() {
  if (photosOpen) closePhotos();
  if (sourcesOpen) closeSources();
  if (notesOpen) closeNotes();
  if (linksOpen) closeLinks();
  if (tasksOpen) closeTasks();
  if (healthOpen) closeHealth();
  webSearchOpen = true;
  quicklinks.style.display = 'none';
  search.style.display = 'none';
  document.getElementById('family').style.display = 'none';
  populateWebSearch();
  webSearchMenu.style.display = 'flex';
  document.getElementById('websearch').classList.add('toolbar-btn--active');
}

function closeWebSearch() {
  closeWebSearchAdd();
  webSearchOpen = false;
  webSearchMenu.style.display = 'none';
  quicklinks.style.display = '';
  search.style.display = '';
  document.getElementById('family').style.display = '';
  document.getElementById('websearch').classList.remove('toolbar-btn--active');
}

function openPhotos() {
  if (sourcesOpen) closeSources();
  if (notesOpen) closeNotes();
  if (linksOpen) closeLinks();
  if (tasksOpen) closeTasks();
  if (healthOpen) closeHealth();
  if (webSearchOpen) closeWebSearch();
  photosOpen = true;
  quicklinks.style.display = 'none';
  search.style.display = 'none';
  document.getElementById('family').style.display = 'none';
  populatePhotosMenu();
  photosMenu.style.display = 'flex';
  document.getElementById('photos').classList.add('toolbar-btn--active');
}

function closePhotos() {
  closePhotoAdd();
  photosOpen = false;
  photosMenu.style.display = 'none';
  quicklinks.style.display = '';
  search.style.display = '';
  document.getElementById('family').style.display = '';
  document.getElementById('photos').classList.remove('toolbar-btn--active');
}

function populatePhotosMenu() {
  const grid = document.getElementById('photos-grid');
  grid.innerHTML = '';
  const photos = data.active.photos || [];

  if (!photos.length) {
    const empty = document.createElement('div');
    empty.className = 'photos-empty';
    empty.textContent = 'No photos yet.';
    grid.appendChild(empty);
    return;
  }

  photos.forEach((photo, i) => {
    const item = document.createElement('div');
    item.className = 'photo-item';

    const wrap = document.createElement('div');
    wrap.className = 'photo-img-wrap';

    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = photo.caption || '';
    img.addEventListener('error', () => {
      wrap.classList.add('photo-img-wrap--broken');
      img.style.display = 'none';
      const icon = document.createElement('i');
      icon.className = 'fa-regular fa-image';
      wrap.appendChild(icon);
    });
    wrap.appendChild(img);

    const del = document.createElement('button');
    del.className = 'photo-delete';
    del.title = 'Remove';
    del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    del.addEventListener('click', async () => {
      const id = data.findId(data.active);
      const updated = (data.active.photos || []).filter((_, idx) => idx !== i);
      try {
        await data.savePhotos(id, updated);
        populatePhotosMenu();
        updateProfilePhoto();
      } catch (err) {
        console.error('Delete photo failed:', err.message);
      }
    });
    wrap.appendChild(del);
    item.appendChild(wrap);

    if (photo.caption) {
      const cap = document.createElement('span');
      cap.className = 'photo-caption';
      cap.textContent = photo.caption;
      item.appendChild(cap);
    }

    grid.appendChild(item);
  });
}

document.getElementById('photo-add-btn').addEventListener('click', openPhotoAdd);
document.getElementById('photoAddCancel').addEventListener('click', closePhotoAdd);
document.getElementById('photo-save-btn').addEventListener('click', addPhoto);

function openPhotoAdd() {
  document.getElementById('photo-url-input').value     = '';
  document.getElementById('photo-caption-input').value = '';
  document.getElementById('photoAddMenu').style.display = 'flex';
  document.getElementById('photo-url-input').focus();
}

function closePhotoAdd() {
  document.getElementById('photoAddMenu').style.display = 'none';
}

async function addPhoto() {
  const urlInput = document.getElementById('photo-url-input');
  const capInput = document.getElementById('photo-caption-input');
  const url = urlInput.value.trim();
  if (!url) return;
  const caption = capInput.value.trim();
  const id = data.findId(data.active);
  const photos = [...(data.active.photos || []), { id: Date.now(), url, caption }];
  try {
    await data.savePhotos(id, photos);
    closePhotoAdd();
    populatePhotosMenu();
    updateProfilePhoto();
  } catch (err) {
    console.error('Add photo failed:', err.message);
  }
}

function updateProfilePhoto() {
  const profile = document.getElementById('profile');
  const first = (data.active?.photos || [])[0];
  profile.innerHTML = '';
  if (first) {
    const img = document.createElement('img');
    img.src = first.url;
    img.alt = '';
    img.addEventListener('error', () => {
      profile.innerHTML = '<i class="fa-regular fa-user"></i>';
    });
    profile.appendChild(img);
  } else {
    profile.innerHTML = '<i class="fa-regular fa-user"></i>';
  }
}

function buildTaskItem(task, i) {
  const li = document.createElement('li');
  li.className = 'task-item' + (task.done ? ' task-item--done' : '');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = task.done;
  checkbox.addEventListener('change', async () => {
    const id = data.findId(data.active);
    const updated = (data.active.tasks || []).map((t, idx) =>
      idx === i ? { ...t, done: checkbox.checked } : t
    );
    try {
      await data.saveTasks(id, updated);
      populateTasksMenu();
    } catch (err) {
      console.error('Toggle task failed:', err.message);
    }
  });

  const textEl = document.createElement('span');
  textEl.className = 'task-item-text';
  textEl.textContent = task.text;
  textEl.addEventListener('click', () => {
    let cancelled = false;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'task-item-edit';
    input.value = task.text;
    li.replaceChild(input, textEl);
    input.focus();
    input.select();

    const save = async () => {
      if (cancelled) return;
      const newText = input.value.trim();
      if (!newText || newText === task.text) { li.replaceChild(textEl, input); return; }
      const id = data.findId(data.active);
      const updated = (data.active.tasks || []).map((t, idx) =>
        idx === i ? { ...t, text: newText } : t
      );
      try {
        await data.saveTasks(id, updated);
        populateTasksMenu();
      } catch (err) {
        console.error('Edit task failed:', err.message);
        li.replaceChild(textEl, input);
      }
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { cancelled = true; li.replaceChild(textEl, input); }
    });
  });

  const del = document.createElement('button');
  del.className = 'task-item-delete';
  del.title = 'Remove';
  del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  del.addEventListener('click', async () => {
    const id = data.findId(data.active);
    const updated = (data.active.tasks || []).filter((_, idx) => idx !== i);
    try {
      await data.saveTasks(id, updated);
      populateTasksMenu();
    } catch (err) {
      console.error('Delete task failed:', err.message);
    }
  });

  li.appendChild(checkbox);
  li.appendChild(textEl);
  li.appendChild(del);
  return li;
}

function populateTasksMenu() {
  const list = document.getElementById('tasks-list');
  list.innerHTML = '';
  const tasks = data.active.tasks || [];
  const pending  = tasks.filter((t) => !t.done);
  const done     = tasks.filter((t) => t.done);

  if (!tasks.length) {
    const empty = document.createElement('li');
    empty.className = 'tasks-empty';
    empty.innerHTML = '<i class="fa-solid fa-list-check"></i><span>No tasks yet</span>';
    list.appendChild(empty);
    return;
  }

  // ── Pending tasks ──────────────────────────────────────
  if (pending.length) {
    pending.forEach((task) => list.appendChild(buildTaskItem(task, tasks.indexOf(task))));
  } else {
    const allDone = document.createElement('li');
    allDone.className = 'tasks-all-done';
    allDone.innerHTML = '<i class="fa-solid fa-check-double"></i><span>All done!</span>';
    list.appendChild(allDone);
  }

  // ── Completed section ──────────────────────────────────
  if (!done.length) return;

  const header = document.createElement('li');
  header.className = 'tasks-section-header';

  const toggle = document.createElement('button');
  toggle.className = 'tasks-section-toggle';
  toggle.innerHTML = `
    <i class="fa-solid fa-chevron-${completedCollapsed ? 'right' : 'down'}"></i>
    <span>Completed</span>
    <span class="tasks-section-count">${done.length}</span>
  `;
  toggle.addEventListener('click', () => {
    completedCollapsed = !completedCollapsed;
    populateTasksMenu();
  });

  const clearBtn = document.createElement('button');
  clearBtn.className = 'tasks-section-clear';
  clearBtn.textContent = 'Clear all';
  clearBtn.addEventListener('click', async () => {
    const id = data.findId(data.active);
    const updated = tasks.filter((t) => !t.done);
    try {
      await data.saveTasks(id, updated);
      populateTasksMenu();
    } catch (err) {
      console.error('Clear done failed:', err.message);
    }
  });

  header.appendChild(toggle);
  header.appendChild(clearBtn);
  list.appendChild(header);

  if (!completedCollapsed) {
    done.forEach((task) => list.appendChild(buildTaskItem(task, tasks.indexOf(task))));
  }
}

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
  editMenu.querySelector('.edit-dup-actions')?.remove();

  const birthField = editMenu.querySelector('#birthInput');
  const deathField = editMenu.querySelector('#deathInput');
  const birthRaw = birthField.value.trim();
  const deathRaw = deathField.value.trim();
  const editStatus = document.getElementById('edit-status');

  if (birthRaw && !parseDate(birthRaw)) {
    birthField.dataset.invalid = 'true';
    editStatus.textContent = 'Birth date is not recognized.';
    editStatus.dataset.state = 'error';
    return;
  }
  if (deathRaw && !parseDate(deathRaw)) {
    deathField.dataset.invalid = 'true';
    editStatus.textContent = 'Death date is not recognized.';
    editStatus.dataset.state = 'error';
    return;
  }

  const updatedPerson = {
    first:        editMenu.querySelector('#firstInput').value,
    middle:       editMenu.querySelector('#middleInput').value,
    surname:      editMenu.querySelector('#surnameInput').value,
    maiden:       editMenu.querySelector('#maidenInput').value,
    birth:        reformatDate(editMenu.querySelector('#birthInput').value.trim(), data.dateFormat),
    death:        reformatDate(editMenu.querySelector('#deathInput').value.trim(), data.dateFormat),
    birth_place:  normalizePlace(editMenu.querySelector('#birthPlaceInput').value.trim()),
    death_place:  normalizePlace(editMenu.querySelector('#deathPlaceInput').value.trim()),
    ancestry:     editMenu.querySelector('#ancestryInput').value,
    familysearch: editMenu.querySelector('#familysearchInput').value,
    findagrave:   editMenu.querySelector('#findagraveInput').value,
    myheritage:   editMenu.querySelector('#myheritageInput').value,
  };

  editStatus.textContent = '';
  delete editStatus.dataset.state;

  if (isAddingNew && !dupeCheckBypassed) {
    const dupes = findDuplicates(updatedPerson);
    if (dupes.length > 0) {
      const dupe = dupes[0];
      const dupeName = [dupe.first, dupe.surname].filter(Boolean).join(' ');
      const dupeYear = extractYear(dupe.birth);
      editStatus.textContent = `Similar to ${dupeName}${dupeYear ? ` (b. ${dupeYear})` : ''}. Save anyway?`;
      editStatus.dataset.state = 'warn';

      const actionsEl = document.createElement('div');
      actionsEl.className = 'edit-dup-actions';

      const saveAnywayBtn = document.createElement('button');
      saveAnywayBtn.type = 'button';
      saveAnywayBtn.textContent = 'Save anyway';
      saveAnywayBtn.addEventListener('click', () => {
        dupeCheckBypassed = true;
        saveBtn.click();
        dupeCheckBypassed = false;
      });

      const cancelDupeBtn = document.createElement('button');
      cancelDupeBtn.type = 'button';
      cancelDupeBtn.textContent = 'Cancel';
      cancelDupeBtn.addEventListener('click', () => {
        editStatus.textContent = '';
        delete editStatus.dataset.state;
        actionsEl.remove();
      });

      actionsEl.appendChild(saveAnywayBtn);
      actionsEl.appendChild(cancelDupeBtn);
      editStatus.after(actionsEl);
      return;
    }
  }
  dupeCheckBypassed = false;

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
  updateProfilePhoto();
  renderFamily();
}

const DEFAULT_SEARCH_LINKS = [
  { label: 'Google', url: 'https://www.google.com/search?q={first}+{last}+{birth}+genealogy' },
  { label: 'FamilySearch', url: 'https://www.familysearch.org/search/record/results?q.givenName={first}&q.surname={last}' },
];

function getSearchLinks() {
  return data.searchLinks ?? DEFAULT_SEARCH_LINKS;
}

function buildSearchUrl(template, person) {
  const enc = (v) => encodeURIComponent(v || '');
  return template
    .replace(/\{first\}/g,  enc(person.first))
    .replace(/\{middle\}/g, enc(person.middle))
    .replace(/\{last\}/g,   enc(person.surname))
    .replace(/\{maiden\}/g, enc(person.maiden))
    .replace(/\{birth\}/g,  enc(person.birth))
    .replace(/\{death\}/g,  enc(person.death));
}

function populateWebSearch() {
  const list = document.getElementById('websearch-list');
  list.innerHTML = '';
  const links = getSearchLinks();

  if (!links.length) {
    const empty = document.createElement('li');
    empty.className = 'websearch-empty';
    empty.textContent = 'No search links yet. Add one below.';
    list.appendChild(empty);
    return;
  }

  links.forEach((link, i) => {
    const li = document.createElement('li');
    li.className = 'websearch-item';

    const a = document.createElement('a');
    a.className = 'websearch-item-link';
    a.href = buildSearchUrl(link.url, data.active);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    const favicon = document.createElement('img');
    favicon.className = 'websearch-item-favicon';
    favicon.src = getFaviconUrl(link.url);
    favicon.width = 16;
    favicon.height = 16;
    favicon.alt = '';
    favicon.addEventListener('error', () => { favicon.style.display = 'none'; });
    const labelSpan = document.createElement('span');
    labelSpan.textContent = link.label || link.url;
    a.appendChild(favicon);
    a.appendChild(labelSpan);

    const del = document.createElement('button');
    del.className = 'websearch-item-delete';
    del.title = 'Remove';
    del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    del.addEventListener('click', async (e) => {
      e.preventDefault();
      const updated = getSearchLinks().filter((_, idx) => idx !== i);
      try {
        await data.saveSearchLinks(updated);
        populateWebSearch();
      } catch (err) { console.error('Delete search link failed:', err.message); }
    });

    li.appendChild(a);
    li.appendChild(del);
    list.appendChild(li);
  });
}

document.getElementById('websearch-add-btn').addEventListener('click', openWebSearchAdd);
document.getElementById('webSearchAddCancel').addEventListener('click', closeWebSearchAdd);
document.getElementById('websearch-save-btn').addEventListener('click', addSearchLink);
document.getElementById('websearch-url-input').addEventListener('input', () => {
  const raw = document.getElementById('websearch-url-input').value.trim();
  const preview = document.getElementById('websearch-preview');
  preview.textContent = raw ? detectUrlTemplate(raw) : '';
});

function openWebSearchAdd() {
  document.getElementById('websearch-label-input').value = '';
  document.getElementById('websearch-url-input').value   = '';
  document.getElementById('websearch-preview').textContent = '';
  document.getElementById('websearch-status').textContent  = '';
  delete document.getElementById('websearch-status').dataset.state;
  document.getElementById('webSearchAddMenu').style.display = 'flex';
  document.getElementById('websearch-label-input').focus();
}

function closeWebSearchAdd() {
  document.getElementById('webSearchAddMenu').style.display = 'none';
}

function getFaviconUrl(urlTemplate) {
  try {
    const baseUrl = urlTemplate.split('{')[0];
    const { hostname } = new URL(baseUrl);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=16`;
  } catch {
    return '';
  }
}

function detectUrlTemplate(url) {
  const subs = [
    // ISO and dash-separated dates (most specific first)
    [/1900-01-01/g,          '{birth}'],
    [/01-01-1900/g,          '{birth}'],
    [/2000-01-01/g,          '{death}'],
    [/01-01-2000/g,          '{death}'],
    // Slash dates — raw
    [/01\/01\/1900/g,        '{birth}'],
    [/1\/1\/1900/g,          '{birth}'],
    [/01\/01\/2000/g,        '{death}'],
    [/1\/1\/2000/g,          '{death}'],
    // Slash dates — URL-encoded (%2F)
    [/01%2F01%2F1900/gi,     '{birth}'],
    [/1%2F1%2F1900/gi,       '{birth}'],
    [/01%2F01%2F2000/gi,     '{death}'],
    [/1%2F1%2F2000/gi,       '{death}'],
    // Year only (not adjacent to other digits)
    [/(?<!\d)1900(?!\d)/g,   '{birth}'],
    [/(?<!\d)2000(?!\d)/g,   '{death}'],
    // Full name together (handle + and %20 spacing)
    [/John(?:%20|\+)Doe/gi,  '{first}+{last}'],
    [/Doe(?:%20|\+)John/gi,  '{last}+{first}'],
    // Individual names (word boundaries)
    [/\bJohn\b/gi,           '{first}'],
    [/\bDoe\b/gi,            '{last}'],
  ];
  for (const [pattern, token] of subs) {
    url = url.replace(pattern, token);
  }
  return url;
}

async function addSearchLink() {
  const labelInput  = document.getElementById('websearch-label-input');
  const urlInput    = document.getElementById('websearch-url-input');
  const statusEl    = document.getElementById('websearch-status');
  const raw = urlInput.value.trim();
  if (!raw) return;
  const url   = detectUrlTemplate(raw);
  const label = labelInput.value.trim() || url;
  const updated = [...getSearchLinks(), { label, url }];
  statusEl.textContent = '';
  delete statusEl.dataset.state;
  try {
    await data.saveSearchLinks(updated);
    closeWebSearchAdd();
    populateWebSearch();
  } catch (err) {
    statusEl.textContent = err.message || 'Save failed.';
    statusEl.dataset.state = 'error';
    console.error('Add search link failed:', err);
  }
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

function findDuplicates(newPerson) {
  const newSurname = (newPerson.surname || '').toLowerCase().trim();
  const newFirst   = (newPerson.first   || '').toLowerCase().trim();
  const newYear    = extractYear(newPerson.birth);
  return data.searchByName('').filter((p) => {
    const pSurname = ((p.surname || p.maiden) || '').toLowerCase().trim();
    const pFirst   = (p.first || '').toLowerCase().trim();
    const pYear    = extractYear(p.birth);
    if (newSurname && pSurname === newSurname && newYear && pYear === newYear) return true;
    if (newFirst && newSurname && pFirst === newFirst && pSurname === newSurname && !newYear && !pYear) return true;
    return false;
  });
}

function personSubline(person) {
  const y1 = extractYear(person.birth);
  const y2 = extractYear(person.death);
  return [y1, y2].filter(Boolean).join(' – ');
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
  const datePlaceholder = formatPlaceholder(data.dateFormat);
  editMenu.querySelector('#birthInput').placeholder = datePlaceholder;
  editMenu.querySelector('#deathInput').placeholder  = datePlaceholder;

  editMenu.querySelector('#firstInput').value        = data.active.first;
  editMenu.querySelector('#middleInput').value       = data.active.middle;
  editMenu.querySelector('#surnameInput').value      = data.active.surname;
  editMenu.querySelector('#maidenInput').value       = data.active.maiden;
  editMenu.querySelector('#birthInput').value        = data.active.birth;
  editMenu.querySelector('#birthPlaceInput').value   = data.active.birth_place;
  editMenu.querySelector('#deathInput').value        = data.active.death;
  editMenu.querySelector('#deathPlaceInput').value   = data.active.death_place;
  editMenu.querySelector('#ancestryInput').value     = data.active.ancestry;
  editMenu.querySelector('#familysearchInput').value = data.active.familysearch;
  editMenu.querySelector('#findagraveInput').value   = data.active.findagrave;
  editMenu.querySelector('#myheritageInput').value   = data.active.myheritage;
}
