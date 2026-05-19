import { supabase } from './supabase.js';
import { getSession } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const session = await getSession();
  if (!session) {
    window.location.href = '/src/markup/signin.html';
    return;
  }

  await Promise.all([loadSettings(), loadTrees()]);

  document.getElementById('back-btn').addEventListener('click', () => { location.href = './index.html'; });
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('upload').addEventListener('submit', handleUpload);

  document.getElementById('create-tree-btn').addEventListener('click', createTree);
  document.getElementById('new-tree-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createTree();
  });
});

async function loadSettings() {
  const { data } = await supabase.from('user_settings').select('*').maybeSingle();
  if (!data) return;

  setVal('ancestryTreeId', data.ancestry_tree_id);
  setVal('ancestryRoot',   data.ancestry_root);
  setVal('familysearchId', data.familysearch_id);
  setVal('findagraveId',   data.findagrave_id);
  setVal('myheritageId',   data.myheritage_id);
  setVal('myheritageRoot', data.myheritage_root);

  const autoload = document.getElementById('autoload');
  if (autoload) autoload.checked = data.autoload ?? true;
}

async function saveSettings() {
  const btn = document.getElementById('save-settings');
  const status = document.getElementById('save-status');
  btn.disabled = true;

  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from('user_settings').upsert({
    user_id:          user.id,
    ancestry_tree_id: getVal('ancestryTreeId'),
    ancestry_root:    getVal('ancestryRoot'),
    familysearch_id:  getVal('familysearchId'),
    findagrave_id:    getVal('findagraveId'),
    myheritage_id:    getVal('myheritageId'),
    myheritage_root:  getVal('myheritageRoot'),
    autoload:         document.getElementById('autoload')?.checked ?? true,
  }, { onConflict: 'user_id' });

  if (error) {
    status.textContent = 'Save failed.';
    status.dataset.state = 'error';
  } else {
    status.textContent = 'Saved.';
    status.dataset.state = 'ok';
    setTimeout(() => { status.textContent = ''; delete status.dataset.state; }, 2000);
  }

  btn.disabled = false;
}

function handleUpload(e) {
  e.preventDefault();
  const input = e.target.querySelector('input[type="file"]');
  if (!input?.files?.length) {
    alert('Please select a file.');
    return;
  }
  if (!input.files[0].name.endsWith('.ged')) {
    alert('Please select a GEDCOM file (.ged).');
    return;
  }
  // GEDCOM parsing to be implemented
  console.log('GEDCOM selected:', input.files[0].name);
}

// ─── TREE MANAGEMENT ──────────────────────────────────────────────────────────

let activeTreeId = null;

async function loadTrees() {
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: settings }, { data: trees }] = await Promise.all([
    supabase.from('user_settings').select('*').maybeSingle(),
    supabase.from('trees').select('*').eq('user_id', user.id).order('created_at'),
  ]);

  activeTreeId = settings?.active_tree_id ?? null;
  const list = document.getElementById('trees-list');
  list.innerHTML = '';

  if (!trees?.length) {
    const empty = document.createElement('p');
    empty.className = 'trees-empty';
    empty.textContent = 'No trees yet. Create one to get started.';
    list.appendChild(empty);
    return;
  }

  trees.forEach((tree) => {
    const isActive = tree.id === activeTreeId;
    const row = document.createElement('div');
    row.className = 'tree-row' + (isActive ? ' tree-row--active' : '');

    const nameEl = document.createElement('span');
    nameEl.className = 'tree-row-name';
    nameEl.textContent = tree.name;
    row.appendChild(nameEl);

    const actions = document.createElement('div');
    actions.className = 'tree-row-actions';

    if (isActive) {
      const badge = document.createElement('span');
      badge.className = 'tree-active-badge';
      badge.textContent = 'Active';
      actions.appendChild(badge);
    } else {
      const switchBtn = document.createElement('button');
      switchBtn.className = 'tree-switch-btn';
      switchBtn.textContent = 'Switch';
      switchBtn.addEventListener('click', () => switchTree(tree.id));
      actions.appendChild(switchBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'tree-delete-btn';
    delBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    delBtn.title = 'Delete tree';
    delBtn.addEventListener('click', () => deleteTree(tree.id, tree.name));
    actions.appendChild(delBtn);

    row.appendChild(actions);
    list.appendChild(row);
  });
}

async function createTree() {
  const input = document.getElementById('new-tree-name');
  const name = input.value.trim();
  if (!name) return;

  const { data: { user } } = await supabase.auth.getUser();
  const { data: tree, error } = await supabase
    .from('trees')
    .insert({ user_id: user.id, name })
    .select()
    .single();

  if (error) { console.error('Create tree failed:', error.message); return; }

  input.value = '';
  await switchTree(tree.id);
}

async function deleteTree(treeId, treeName) {
  if (!confirm(`Delete "${treeName}" and all its ancestors? This cannot be undone.`)) return;

  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('trees')
    .delete()
    .eq('id', treeId)
    .eq('user_id', user.id);

  if (error) { console.error('Delete tree failed:', error.message); return; }

  if (treeId === activeTreeId) {
    const { data: remaining } = await supabase
      .from('trees')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at')
      .limit(1)
      .maybeSingle();
    await setActiveTree(remaining?.id ?? null);
  }

  await loadTrees();
}

async function switchTree(treeId) {
  await setActiveTree(treeId);
  await loadTrees();
}

async function setActiveTree(treeId) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('user_settings').upsert(
    { user_id: user.id, active_tree_id: treeId },
    { onConflict: 'user_id' }
  );
  activeTreeId = treeId;
}

// ──────────────────────────────────────────────────────────────────────────────

function getVal(id) {
  return document.getElementById(id)?.value?.trim() ?? '';
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}
