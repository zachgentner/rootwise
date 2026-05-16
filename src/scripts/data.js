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
        _dbId:        row.id,
      };
    });
  }

  const firstId = Object.keys(ids)[0];
  if (firstId) active = ids[firstId];
}

// Upsert a person to Supabase and update local cache.
export async function savePerson(internalId, personData) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('ancestors').upsert(
    {
      user_id:      user.id,
      internal_id:  parseInt(internalId, 10),
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
    },
    { onConflict: 'user_id,internal_id' }
  );
  if (error) throw error;
  ids[internalId] = { ...personData, _dbId: ids[internalId]?._dbId };
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
