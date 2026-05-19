# Rootwise — Phase 2 Product Spec

**Branch:** `dev`  
**Goal:** Implement three tightly-scoped features that meaningfully deepen the per-ancestor data model and catch common data-entry errors.

---

## Overview

| # | Feature | Effort |
|---|---------|--------|
| 1 | Flexible dates & places | Medium |
| 2 | Sources / citations panel | Large |
| 3 | Duplicate detection on save | Small |

All changes are front-end only (JS + CSS + HTML). The only backend work is issuing the two `ALTER TABLE` statements below — no new tables, no migrations beyond that.

---

## Database Changes (run once in Supabase SQL editor)

```sql
-- Feature 1: places
ALTER TABLE ancestors
  ADD COLUMN IF NOT EXISTS birth_place text,
  ADD COLUMN IF NOT EXISTS death_place text;

-- Feature 2: sources
ALTER TABLE ancestors
  ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]'::jsonb;
```

No existing columns are modified. `birth` and `death` remain as-is; they now accept flexible date strings rather than being restricted to four-digit years.

---

## Feature 1: Flexible Dates & Places

### Goal
Move birth and death from year-only strings to flexible date strings plus an optional location, without breaking existing data.

### Date format convention
The `birth` and `death` columns remain `text`. Accepted values (never validated strictly — trust the user):
- Year only: `1885`
- Full date: `12 Jun 1885`
- Approximate: `abt 1840`
- Before/after qualifiers: `bef 1900`, `aft 1820`
- Blank is fine.

The `{birth}` and `{death}` tokens in web search URL templates continue to use these fields verbatim.

### New columns
`birth_place` and `death_place` — free-text, e.g. `"Salt Lake City, UT"` or `"County Cork, Ireland"`.

### Edit form — HTML changes (`index.html`)

Replace the current Dates section:

```html
<!-- BEFORE -->
<span class="edit-label">Dates</span>
<div class="edit-row">
  <div class="edit-field" style="flex:1">
    <span class="edit-field-abbr">Birth</span>
    <input type="text" id="birthInput" placeholder="yyyy" />
  </div>
  <div class="edit-field" style="flex:1">
    <span class="edit-field-abbr">Death</span>
    <input type="text" id="deathInput" placeholder="yyyy" />
  </div>
</div>

<!-- AFTER -->
<span class="edit-label">Birth</span>
<div class="edit-row">
  <div class="edit-field" style="flex:1">
    <span class="edit-field-abbr">Date</span>
    <input type="text" id="birthInput" placeholder="e.g. 12 Jun 1885" />
  </div>
  <div class="edit-field" style="flex:2">
    <span class="edit-field-abbr">Place</span>
    <input type="text" id="birthPlaceInput" placeholder="e.g. Salt Lake City, UT" />
  </div>
</div>

<span class="edit-label">Death</span>
<div class="edit-row">
  <div class="edit-field" style="flex:1">
    <span class="edit-field-abbr">Date</span>
    <input type="text" id="deathInput" placeholder="e.g. 4 Mar 1952" />
  </div>
  <div class="edit-field" style="flex:2">
    <span class="edit-field-abbr">Place</span>
    <input type="text" id="deathPlaceInput" placeholder="e.g. Provo, UT" />
  </div>
</div>
```

### `data.js` changes

1. Load `birth_place` and `death_place` in `initialize()` alongside the existing fields.
2. Save them in `createPerson()` and `savePerson()`.
3. Include them in the local cache object.

### `script.js` changes

1. In `saveBtn` handler, read `birthPlaceInput` and `deathPlaceInput` and include in `updatedPerson`.
2. In `populateEditMenu()`, set both new inputs from `data.active`.
3. **Lifespan display** (`ui.updateLifespan`): extract a 4-digit year from the date string for the compact `1800 – 1900` header display. Use a regex: `/\b(\d{4})\b/` → first match is the year. If no year found, show blank segment. Full string is not displayed in the header — it's too long.
4. **Family card sublines** (`personSubline`): same logic — show extracted year only, keeping cards compact.
5. **Place in person detail**: The place fields are edit-form only for now. No place display is added to the family cards or header (they are already space-constrained). This is intentional — place is useful for research/export, not for the compact card UI.

### CSS changes
No structural changes needed. The edit form already uses `.edit-row` / `.edit-field` / `.edit-field-abbr` patterns that will handle the new layout. Confirm `flex:2` on place inputs renders correctly at 340px width.

---

## Feature 2: Sources / Citations Panel

### Goal
Activate the Sources toolbar button (currently points to `#`) with a full panel for attaching source records to the active person. Follows the exact same data and UI pattern as the existing Links panel.

### Data model

**Source object shape** (stored in `sources` JSONB array on `ancestors`):
```json
{
  "id": 1716000000000,
  "title": "1880 United States Federal Census",
  "repository": "Ancestry.com",
  "url": "https://www.ancestry.com/...",
  "date_accessed": "15 May 2025",
  "notes": "Lists occupation as farmer, age 34."
}
```

- `id`: `Date.now()` timestamp, used as a stable key for deletion.
- `title`: required — the only mandatory field.
- `repository`: optional — where the source lives (Ancestry, FamilySearch, county courthouse, etc.).
- `url`: optional — direct link to the source record online.
- `date_accessed`: optional free-text.
- `notes`: optional short note about what the source confirms.

### `data.js` — new function

```js
export async function saveSources(internalId, sources) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('ancestors')
    .update({ sources })
    .eq('user_id', user.id)
    .eq('internal_id', parseInt(internalId, 10));
  if (error) throw error;
  if (ids[internalId]) ids[internalId].sources = sources;
}
```

Also update `initialize()` to load `sources` from each row (default `[]`), and include `sources` in `createPerson()`.

### HTML — `index.html`

Add the panel div before the toolbar:

```html
<!-- SOURCES PANEL -->
<div id="sourcesMenu" style="display:none;">
  <ul id="sources-list"></ul>
  <div class="sources-add-form">
    <input type="text"  id="source-title-input"    placeholder="Title (required)…"      autocomplete="off" spellcheck="false" />
    <input type="text"  id="source-repo-input"     placeholder="Repository (optional)…" autocomplete="off" spellcheck="false" />
    <input type="url"   id="source-url-input"      placeholder="URL (optional)…"        autocomplete="off" spellcheck="false" />
    <input type="text"  id="source-date-input"     placeholder="Date accessed (optional)…" autocomplete="off" spellcheck="false" />
    <textarea           id="source-notes-input"    placeholder="Notes (optional)…"      spellcheck="true" rows="2"></textarea>
    <button id="source-add-btn">
      <i class="fa-solid fa-plus"></i>
      <span>Add source</span>
    </button>
  </div>
</div>
```

Update the Sources toolbar button `href` from `"#"` to remove navigation (use `e.preventDefault()`).

### `script.js` changes

**State variable:** `let sourcesOpen = false;`

**Open/close functions** (follow `openLinks` / `closeLinks` exactly):

```js
function openSources() {
  // close all other panels
  sourcesOpen = true;
  quicklinks.style.display = 'none';
  search.style.display = 'none';
  document.getElementById('family').style.display = 'none';
  populateSourcesMenu();
  document.getElementById('sourcesMenu').style.display = 'flex';
  document.getElementById('sources').classList.add('toolbar-btn--active');
}

function closeSources() {
  sourcesOpen = false;
  document.getElementById('sourcesMenu').style.display = 'none';
  quicklinks.style.display = '';
  search.style.display = '';
  document.getElementById('family').style.display = '';
  document.getElementById('sources').classList.remove('toolbar-btn--active');
}
```

Wire the Sources toolbar button click and include `closeSources()` calls in all other `open*()` functions and in the Escape handler.

**`populateSourcesMenu()`:**

```
- Clear list
- If no sources: render an empty-state <li> ("No sources yet.")
- For each source:
    <li class="source-item">
      <div class="source-item-body">
        <span class="source-item-title">title</span>
        <span class="source-item-repo">repository</span>  <!-- only if set -->
        <span class="source-item-date">Accessed: date_accessed</span>  <!-- only if set -->
        <span class="source-item-notes">notes</span>  <!-- only if set -->
      </div>
      <!-- url icon link, only if url is set -->
      <a href="url" class="source-item-link" target="_blank" rel="noopener noreferrer">
        <i class="fa-solid fa-arrow-up-right-from-square"></i>
      </a>
      <button class="source-item-delete" title="Remove">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </li>
```

Delete button handler follows the `url-item-delete` pattern: filter array, call `data.saveSources()`, re-render.

**Add source handler** on `#source-add-btn`:
- Read all five inputs.
- If title is empty, bail.
- Build source object with `id: Date.now()`.
- Append to `data.active.sources`, call `data.saveSources()`.
- Clear inputs, re-render.

### CSS

Add a `/* ─── SOURCES PANEL ───── */` section modeled on the URLs panel styles. Key rules:

```css
#sourcesMenu {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

#sources-list {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.source-item {
  display: flex;
  align-items: flex-start;
  padding: 10px 13px;
  gap: 8px;
  border-bottom: 1px solid var(--border);
}

.source-item:last-child { border-bottom: none; }
.source-item:hover { background: var(--surface); }

.source-item-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.source-item-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  line-height: 1.3;
}

.source-item-repo {
  font-size: 11px;
  color: var(--text-mid);
}

.source-item-date,
.source-item-notes {
  font-size: 11px;
  color: var(--text-sub);
  line-height: 1.3;
}

.source-item-link {
  color: var(--text-sub);
  font-size: 11px;
  padding: 2px;
  transition: color 0.15s;
  flex-shrink: 0;
  margin-top: 2px;
}

.source-item-link:hover { color: var(--amber); }

.source-item-delete {
  /* mirrors .url-item-delete */
  width: 18px; height: 18px;
  background: transparent;
  color: var(--text-sub);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px;
  border-radius: 3px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
  margin-top: 2px;
}

.source-item:hover .source-item-delete { opacity: 1; }
.source-item-delete:hover { color: var(--red); }

.sources-add-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 13px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.sources-add-form input,
.sources-add-form textarea {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 5px 8px;
  font-family: inherit;
  font-size: 12px;
  color: var(--text);
  outline: none;
  width: 100%;
  transition: border-color 0.15s;
  resize: none;
}

.sources-add-form input:focus,
.sources-add-form textarea:focus { border-color: var(--amber); }

#source-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--amber);
  color: #f7f4ef;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  border-radius: 5px;
  padding: 6px 10px;
  transition: background 0.15s;
}

#source-add-btn:hover { background: var(--amber-hi); }

.sources-empty {
  padding: 16px 13px;
  font-size: 12px;
  color: var(--text-sub);
}
```

---

## Feature 3: Duplicate Detection on Save

### Goal
When creating a new person, warn before writing to the database if an existing person is a strong name+date match. Editing an existing person is excluded (you're working with the real record, not a duplicate).

### Trigger
- Only on `isAddingNew === true`.
- Run immediately after the user clicks Save, before any database call.

### Match logic

A candidate is flagged if **both** of the following are true:
1. `candidate.surname.toLowerCase() === newPerson.surname.toLowerCase()` (non-empty on both sides), **OR** `candidate.maiden.toLowerCase() === newPerson.surname.toLowerCase()`
2. The 4-digit year extracted from `candidate.birth` matches the 4-digit year extracted from `newPerson.birth` (both non-empty)

**OR** flag if:
- `candidate.first.toLowerCase() === newPerson.first.toLowerCase()` AND `candidate.surname.toLowerCase() === newPerson.surname.toLowerCase()` AND both `newPerson.birth` and `candidate.birth` are empty.

Helper to extract year: `/\b(\d{4})\b/` → first match or `null`.

### UI

Do not use `window.confirm()` — it doesn't work in Chrome extensions. Instead, use the existing `#edit-status` area plus inline buttons:

1. On duplicate found, set `editStatus.textContent` to:  
   `"Similar to [First Surname] (b. YYYY). Save anyway?"`  
   and `editStatus.dataset.state = 'warn'` (add a new warn color in CSS: `var(--amber)` dimmed).
2. Render two small buttons inside or below the status:
   - "Save anyway" → proceeds with the original save flow.
   - "Cancel" → clears the status, returns to the form.
3. If no duplicate: proceed to save normally (no UI change).

### CSS addition

```css
#edit-status[data-state="warn"] { color: var(--amber); }

.edit-dup-actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.edit-dup-actions button {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  transition: background 0.15s;
}

.edit-dup-actions button:hover { background: var(--surface-3); }
```

---

## Task Checklist

### Database (manual step — run in Supabase before code execution)
- [ ] Run the two `ALTER TABLE` statements above

### Feature 1 — Flexible Dates & Places
- [ ] `index.html`: restructure Dates section into Birth and Death sub-sections with place inputs
- [ ] `data.js`: load `birth_place`, `death_place` in `initialize()`
- [ ] `data.js`: save `birth_place`, `death_place` in `createPerson()` and `savePerson()`
- [ ] `data.js`: include `birth_place`, `death_place` in local cache object
- [ ] `script.js`: read `birthPlaceInput` / `deathPlaceInput` in save handler
- [ ] `script.js`: populate both new inputs in `populateEditMenu()`
- [ ] `script.js` / `ui.js`: update `updateLifespan()` to extract 4-digit year from flexible date string
- [ ] `script.js`: update `personSubline()` to extract year for compact family card display
- [ ] Verify layout at 340px — check `flex` proportions on birth/death rows

### Feature 2 — Sources Panel
- [ ] **DB**: `sources` JSONB column added (see above)
- [ ] `data.js`: add `saveSources()` function
- [ ] `data.js`: load `sources` in `initialize()`, include in `createPerson()`
- [ ] `index.html`: add `#sourcesMenu` div with list + add-form
- [ ] `script.js`: add `sourcesOpen` state variable
- [ ] `script.js`: implement `openSources()` and `closeSources()`
- [ ] `script.js`: wire Sources toolbar button click event
- [ ] `script.js`: add `closeSources()` call to all other `open*()` functions
- [ ] `script.js`: add `closeSources()` to Escape key handler
- [ ] `script.js`: implement `populateSourcesMenu()` with empty state + item rendering
- [ ] `script.js`: implement `buildSourceItem()` helper
- [ ] `script.js`: wire `#source-add-btn` click and form validation
- [ ] `main.css`: add Sources panel styles (see spec above)

### Feature 3 — Duplicate Detection
- [ ] `script.js`: implement `extractYear(dateStr)` helper
- [ ] `script.js`: implement `findDuplicates(newPerson)` — returns array of matching person objects
- [ ] `script.js`: in `saveBtn` click handler, run duplicate check when `isAddingNew === true`
- [ ] `script.js`: render warn status + "Save anyway" / "Cancel" buttons on match
- [ ] `script.js`: wire "Save anyway" to bypass check and proceed
- [ ] `script.js`: wire "Cancel" to clear status and return to form
- [ ] `main.css`: add `[data-state="warn"]` and `.edit-dup-actions` styles

---

## Non-Goals for This Phase

- GEDCOM import (stub remains as-is)
- Reports panel (toolbar button stays inert)
- Visual pedigree / fan chart
- Structured place fields (city / state / country separately)
- Source-to-fact linkage (sources attach to the person, not to specific events)
- Any backend changes beyond the two `ALTER TABLE` statements
