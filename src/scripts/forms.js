import { supabase } from './supabase.js';
import { getSession } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const session = await getSession();
  if (!session) {
    window.location.href = '/src/markup/signin.html';
    return;
  }

  await loadSettings();

  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('upload').addEventListener('submit', handleUpload);
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

function getVal(id) {
  return document.getElementById(id)?.value?.trim() ?? '';
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}
