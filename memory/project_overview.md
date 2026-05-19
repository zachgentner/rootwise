---
name: project-overview
description: Rootwise Chrome extension — tech stack, feature inventory, and current phase
metadata:
  type: project
---

Rootwise is a Chrome extension for genealogy research. Supabase backend, webpack build.

**Stack:** Chrome extension (MV3), vanilla JS (ES modules), webpack, Supabase (auth + PostgreSQL), Font Awesome, Google Fonts (Outfit, Cormorant Garamond, IBM Plex Mono).

**Pages:** `index.html` (main popup), `signin.html`, `settings.html`

**Scripts:** `script.js` (main UI), `data.js` (all Supabase calls + local cache), `ui.js`, `forms.js` (settings page), `auth.js`, `signin.js`, `background.js`, `supabase.js`

**Supabase tables:** `ancestors`, `user_settings`, `trees`

**Ancestor fields (current):** first, middle, surname, maiden, birth (text/year), death (text/year), ancestry, familysearch, findagrave, myheritage, notes, links[], tasks[], photos[], spouses[], father_id, mother_id

**Built features:** person CRUD, family tree (parents/siblings/spouses/children), notes (auto-save), tasks (done/pending), photos (URL), links (URL+label), web search with favicon + template URLs, multi-tree management, quick-links (Ancestry/FamilySearch/FindAGrave), autoload from tab URL, pop-out window, sign-in page.

**Stubs / not yet built:** GEDCOM import (UI only, no parser), Reports panel (toolbar button exists, no panel), Sources panel (toolbar button exists, no panel).

**Phase 2 spec:** `PHASE_2_SPEC.md` in project root — three features:
1. Flexible dates & places (add birth_place, death_place columns; expand date input to free-text)
2. Sources / citations panel (activate Sources toolbar button, new JSONB sources[] per person)
3. Duplicate detection on save (name+year similarity check, inline warn UI)

**Why:** [[phase-2-context]]
