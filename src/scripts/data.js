import { supabase } from './supabase.js';

let src = {
  ancestry:     { defaultUrl: 'https://www.ancestry.com',    id: '', root: '' },
  myheritage:   { defaultUrl: 'https://www.myheritage.com',  id: '', root: '' },
  familysearch: { defaultUrl: 'https://www.familysearch.org', id: '' },
  findagrave:   { defaultUrl: 'https://www.findagrave.com',  id: '' },
};

let ids = {};
export let active;

// Fetch settings and ancestors from Supabase. Call once on startup.
export async function initialize() {
  const [settingsResult, ancestorsResult] = await Promise.all([
    supabase.from('user_settings').select('*').maybeSingle(),
    supabase.from('ancestors').select('*').order('internal_id'),
  ]);

  if (settingsResult.data) {
    const s = settingsResult.data;
    src.ancestry.id     = s.ancestry_tree_id  || '';
    src.ancestry.root   = s.ancestry_root      || '';
    src.myheritage.id   = s.myheritage_id      || '';
    src.myheritage.root = s.myheritage_root    || '';
    src.familysearch.id = s.familysearch_id    || '';
    src.findagrave.id   = s.findagrave_id      || '';
  }

  if (ancestorsResult.data) {
    ids = {};
    ancestorsResult.data.forEach((row) => {
      ids[row.internal_id] = {
        first:        row.first        || '',
        middle:       row.middle       || '',
        surname:      row.surname      || '',
        maiden:       row.maiden       || '',
        birth:        row.birth        || '',
        death:        row.death        || '',
        ancestry:     row.ancestry     || '',
        familysearch: row.familysearch || '',
        findagrave:   row.findagrave   || '',
        myheritage:   row.myheritage   || '',
        notes:        row.notes        || '',
        links:        row.links        || [],
        spouses:      Array.isArray(row.spouses) ? row.spouses : [],
        father_id:    row.father_id    ?? null,
        mother_id:    row.mother_id    ?? null,
        _dbId:        row.id,
      };
    });
  }

  const firstId = Object.keys(ids)[0];
  if (firstId) active = ids[firstId];
}

// Insert a new person into Supabase and update local cache. Returns the new internal id.
export async function createPerson(personData) {
  const internalId = nextId();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: row, error } = await supabase.from('ancestors').insert({
    user_id:      user.id,
    internal_id:  internalId,
    first:        personData.first,
    middle:       personData.middle,
    surname:      personData.surname,
    maiden:       personData.maiden,
    birth:        personData.birth,
    death:        personData.death,
    ancestry:     personData.ancestry,
    familysearch: personData.familysearch,
    findagrave:   personData.findagrave,
    myheritage:   personData.myheritage,
  }).select().single();
  if (error) throw error;
  ids[internalId] = { ...personData, notes: '', links: [], father_id: null, mother_id: null, _dbId: row.id };
  return internalId;
}

// Update an existing person in Supabase and update local cache.
export async function savePerson(internalId, personData) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('ancestors').update({
    first:        personData.first,
    middle:       personData.middle,
    surname:      personData.surname,
    maiden:       personData.maiden,
    birth:        personData.birth,
    death:        personData.death,
    ancestry:     personData.ancestry,
    familysearch: personData.familysearch,
    findagrave:   personData.findagrave,
    myheritage:   personData.myheritage,
  })
    .eq('user_id', user.id)
    .eq('internal_id', parseInt(internalId, 10));
  if (error) throw error;
  ids[internalId] = { ...ids[internalId], ...personData, _dbId: ids[internalId]?._dbId };
}

// Save only the notes field for the active person.
export async function saveNotes(internalId, notes) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('ancestors')
    .update({ notes })
    .eq('user_id', user.id)
    .eq('internal_id', parseInt(internalId, 10));
  if (error) throw error;
  if (ids[internalId]) ids[internalId].notes = notes;
}

// Save the links array for a person.
export async function saveLinks(internalId, links) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('ancestors')
    .update({ links })
    .eq('user_id', user.id)
    .eq('internal_id', parseInt(internalId, 10));
  if (error) throw error;
  if (ids[internalId]) ids[internalId].links = links;
}

// Return { father, mother } for a given person (by internal id string).
// Each value is the person object extended with _id, or null if unset/not found.
export function getParents(personId) {
  const person = ids[personId];
  if (!person) return { father: null, mother: null };
  const fId = person.father_id;
  const mId = person.mother_id;
  return {
    father: fId != null && ids[fId] ? { _id: String(fId), ...ids[fId] } : null,
    mother: mId != null && ids[mId] ? { _id: String(mId), ...ids[mId] } : null,
  };
}

// Return siblings: people who share at least one parent with the given person.
export function getSiblings(personId) {
  const person = ids[personId];
  if (!person) return [];
  return Object.entries(ids)
    .filter(([id, p]) => {
      if (id === String(personId)) return false;
      return (person.father_id != null && p.father_id === person.father_id) ||
             (person.mother_id != null && p.mother_id === person.mother_id);
    })
    .map(([id, p]) => ({ _id: id, ...p }));
}

// Save the spouses array for a person.
export async function saveSpouses(internalId, spouses) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('ancestors')
    .update({ spouses })
    .eq('user_id', user.id)
    .eq('internal_id', parseInt(internalId, 10));
  if (error) throw error;
  if (ids[internalId]) ids[internalId].spouses = spouses;
}

// Link two people as spouses (bidirectional).
export async function addSpouse(personId, spouseId) {
  const person = ids[personId];
  const spouse = ids[spouseId];
  if (!person || !spouse) return;
  const pList = [...(person.spouses || [])];
  const sList = [...(spouse.spouses || [])];
  if (!pList.find((s) => String(s.id) === String(spouseId)))
    pList.push({ id: parseInt(spouseId, 10), marriage_year: '' });
  if (!sList.find((s) => String(s.id) === String(personId)))
    sList.push({ id: parseInt(personId, 10), marriage_year: '' });
  await saveSpouses(personId, pList);
  await saveSpouses(spouseId, sList);
}

// Remove a spouse link (bidirectional).
export async function removeSpouse(personId, spouseId) {
  const person = ids[personId];
  const spouse = ids[spouseId];
  if (person) await saveSpouses(personId, (person.spouses || []).filter((s) => String(s.id) !== String(spouseId)));
  if (spouse) await saveSpouses(spouseId, (spouse.spouses || []).filter((s) => String(s.id) !== String(personId)));
}

// Remove a co-parent by clearing their parent role from all shared children.
export async function removeCoParent(personId, coParentId) {
  const numId = parseInt(personId, 10);
  const numCoId = parseInt(coParentId, 10);
  const sharedChildren = Object.entries(ids).filter(([, p]) =>
    (p.father_id === numId && p.mother_id === numCoId) ||
    (p.mother_id === numId && p.father_id === numCoId)
  );
  for (const [childId, child] of sharedChildren) {
    const field = child.father_id === numCoId ? 'father_id' : 'mother_id';
    await setRelation(childId, field, null);
  }
}

// Update marriage year on both sides of the relationship.
export async function updateMarriageYear(personId, spouseId, year) {
  const patch = (list) => list.map((s) =>
    String(s.id) === String(spouseId) ? { ...s, marriage_year: year } : s
  );
  const patchOther = (list) => list.map((s) =>
    String(s.id) === String(personId) ? { ...s, marriage_year: year } : s
  );
  if (ids[personId]) await saveSpouses(personId, patch(ids[personId].spouses || []));
  if (ids[spouseId]) await saveSpouses(spouseId, patchOther(ids[spouseId].spouses || []));
}

// Return children for a specific relationship.
// spouseId = null returns orphaned children (other parent not in spouse list).
export function getChildrenForRelation(personId, spouseId) {
  const numId = parseInt(personId, 10);
  if (spouseId != null) {
    const numSpouseId = parseInt(spouseId, 10);
    return Object.entries(ids)
      .filter(([, p]) =>
        (p.father_id === numId && p.mother_id === numSpouseId) ||
        (p.mother_id === numId && p.father_id === numSpouseId)
      )
      .map(([id, p]) => ({ _id: id, ...p }));
  }
  return Object.entries(ids)
    .filter(([, p]) => {
      if (p.father_id !== numId && p.mother_id !== numId) return false;
      const otherId = p.father_id === numId ? p.mother_id : p.father_id;
      return otherId == null;
    })
    .map(([id, p]) => ({ _id: id, ...p }));
}

// Return internal IDs of people who share children with personId but are not in the formal spouses list.
export function getCoParents(personId) {
  const numId = parseInt(personId, 10);
  const formalIds = new Set((ids[personId]?.spouses || []).map((s) => String(s.id)));
  const coParentIds = new Set();
  Object.values(ids).forEach((p) => {
    if (p.father_id === numId && p.mother_id != null) coParentIds.add(String(p.mother_id));
    if (p.mother_id === numId && p.father_id != null) coParentIds.add(String(p.father_id));
  });
  return [...coParentIds].filter((id) => !formalIds.has(id));
}

// Return children: people whose father_id or mother_id equals the given person's id.
export function getChildren(personId) {
  const numId = parseInt(personId, 10);
  return Object.entries(ids)
    .filter(([, p]) => p.father_id === numId || p.mother_id === numId)
    .map(([id, p]) => ({ _id: id, ...p }));
}

// Set or clear a relation field (father_id | mother_id) on any person.
export async function setRelation(personId, field, relativeId) {
  const val = relativeId != null ? parseInt(relativeId, 10) : null;
  const prev = ids[personId]?.[field] ?? null;

  // Optimistic local update so the UI reflects the change immediately.
  if (ids[personId]) ids[personId][field] = val;

  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('ancestors')
    .update({ [field]: val })
    .eq('user_id', user.id)
    .eq('internal_id', parseInt(personId, 10));

  if (error) {
    // Revert the local cache on failure.
    if (ids[personId]) ids[personId][field] = prev;
    throw error;
  }
}

// Delete a person from Supabase and remove from local cache.
export async function deletePerson(internalId) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('ancestors')
    .delete()
    .eq('user_id', user.id)
    .eq('internal_id', parseInt(internalId, 10));
  if (error) throw error;
  const wasActive = active === ids[internalId];
  delete ids[internalId];
  if (wasActive) {
    const remaining = Object.keys(ids);
    active = remaining.length > 0 ? ids[remaining[0]] : undefined;
  }
}

// HOMEPAGE FUNCTIONS
export function getHomepage(website) {
  let homepage = '';
  if (website.toLowerCase() === 'ancestry') {
    if (src.ancestry.id && src.ancestry.root) {
      homepage = `https://www.ancestry.com/family-tree/tree/${src.ancestry.id}/family?cfpid=${src.ancestry.root}`;
    }
  }
  if (website.toLowerCase() === 'familysearch') {
    homepage = `https://www.familysearch.org/tree/pedigree/fanchart/${src.familysearch.id}`;
  }
  if (website.toLowerCase() === 'findagrave') {
    homepage = `https://www.findagrave.com/virtual-cemetery/${src.findagrave.id}`;
  }
  return homepage;
}

// URL FUNCTIONS
export function getUrl(website, person) {
  let url;
  if (website.toLowerCase() === 'ancestry') {
    if (src.ancestry.id && person.ancestry !== '') {
      url = `https://www.ancestry.com/family-tree/person/tree/${src.ancestry.id}/person/${person.ancestry}/facts`;
    }
  }
  if (website.toLowerCase() === 'familysearch') {
    if (person.familysearch !== '') {
      url = `https://www.familysearch.org/tree/person/details/${person.familysearch}`;
    }
  }
  if (website.toLowerCase() === 'findagrave') {
    if (person.findagrave !== '') {
      url = `https://www.findagrave.com/memorial/${person.findagrave}/`;
    }
  }
  return url;
}

export function getAllLinks(person) {
  const links = {};
  Object.keys(src).forEach((site) => {
    links[site] = {
      url: getUrl(site, person),
      default: src[site].defaultUrl,
    };
  });
  return links;
}

export function getDefaultUrl(website) {
  return src[website.toLowerCase()].defaultUrl;
}

export function getIdFromUrl(url) {
  let id;
  if (url) {
    if (url.includes('ancestry')) {
      id = url.match(/\/person\/(\d+)\//)
        ? url.match(/\/person\/(\d+)\//)[1]
        : src.ancestry.defaultUrl;
    }
    if (url.includes('familysearch')) {
      id = url.match(/([^/]+)$/)
        ? url.match(/([^/]+)$/)[1]
        : src.familysearch.defaultUrl;
    }
    if (url.includes('findagrave')) {
      id = url.match(/\/(\d+)\//)
        ? url.match(/\/(\d+)\//)[1]
        : src.findagrave.defaultUrl;
    }
  }
  return id;
}

export function getDomainName(url) {
  if (url) {
    const temp = url.slice(url.indexOf('www.') + 4);
    return temp.slice(0, temp.indexOf('.'));
  }
}

// DATABASE FUNCTIONS
export function findById(id) {
  return ids[id] ? ids[id] : undefined;
}

export function findId(person) {
  const keys = Object.keys(ids);
  return keys.find((key) => ids[key] === person);
}

export function findByExternalId(externalId, website) {
  if (Object.keys(src).includes(website)) {
    for (const id in ids) {
      if (ids[id][website] === externalId) return id;
    }
  }
  return undefined;
}

export function nextId() {
  const keys = Object.keys(ids).map(Number).filter((n) => !isNaN(n));
  return keys.length > 0 ? Math.max(...keys) + 1 : 1;
}

export function setActive(id) {
  if (/\d+/.test(id)) {
    active = findById(id) !== undefined ? findById(id) : active;
  } else if (searchByName(id).length >= 1) {
    active = searchByName(id)[0];
  }
}

export function reduceArray(key, value) {
  const people = [];
  Object.keys(ids).forEach((id) => {
    if (ids[id][key] === value) people.push(ids[id]);
  });
  return people.length >= 1 ? people : undefined;
}

export function searchByName(name) {
  let firstname;
  let surname;
  let people = [];

  if (name.length >= 1 && !/^\s*$/.test(name)) {
    surname = name.indexOf(',') === -1 ? name : name.slice(0, name.indexOf(','));
    surname = surname.trim().toLowerCase().replace(/\s+/g, '').replace(/\d+/g, '');

    if (surname !== undefined) {
      people = Object.keys(ids)
        .filter(
          (id) =>
            (ids[id].surname && ids[id].surname.toLowerCase().startsWith(surname)) ||
            ids[id].maiden.toLowerCase().startsWith(surname),
        )
        .map((id) => ids[id]);
    }

    if (name.indexOf(',') !== name.length - 1 && name.indexOf(',') !== -1) {
      firstname = name.slice(name.indexOf(',') + 1);
      firstname = firstname.trim().toLowerCase().replace(/\s{2,}/g, ' ').split(' ').slice(0, 1).join();
    }

    if (firstname !== undefined) {
      people = Object.keys(people)
        .filter(
          (id) =>
            people[id].surname.toLowerCase() === surname ||
            people[id].maiden.toLowerCase() === surname,
        )
        .filter((id) => people[id].first.toLowerCase().startsWith(firstname))
        .map((id) => people[id]);
    }
  } else {
    people = Object.keys(ids).filter((id) => ids[id]).map((id) => ids[id]);
  }

  return people;
}
