const AWDR_API_KEY = "merkahorro2026";
const AWDR_BASE = "wp-json/merkahorro/v1/awdr-notices";

const SEDE_WP_URLS = {
  'PV001':  'https://supermercadomerkahorro.com',
  '00301':  'https://girardota.supermercadomerkahorro.com',
  '00701':  'https://barbosa.supermercadomerkahorro.com',
  '00201':  'https://villahermosa.supermercadomerkahorro.com',
};

function getUrl(sedeCode) {
  const base = SEDE_WP_URLS[sedeCode];
  if (!base) throw new Error(`Sede desconocida: ${sedeCode}`);
  return base;
}

const headers = {
  'Content-Type': 'application/json',
  'X-API-Key': AWDR_API_KEY,
};

export async function diagnostic(sedeCode) {
  const res = await fetch(`${getUrl(sedeCode)}/${AWDR_BASE}/diagnostico`, { headers });
  return res.json();
}

export async function getSettings(sedeCode) {
  const res = await fetch(`${getUrl(sedeCode)}/${AWDR_BASE}/settings`, { headers });
  return res.json();
}

export async function getRules(sedeCode) {
  const res = await fetch(`${getUrl(sedeCode)}/${AWDR_BASE}/rules`, { headers });
  return res.json();
}

export async function postSettings(sedeCode, payload) {
  const res = await fetch(`${getUrl(sedeCode)}/${AWDR_BASE}/settings`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return res.json();
}
