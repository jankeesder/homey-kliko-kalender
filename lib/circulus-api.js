'use strict';

const https = require('node:https');

const REGISTER_HOST  = 'mijn.circulus.nl';
const REGISTER_PATH  = '/register/zipcode.json';
const CALENDAR_PATH  = '/afvalkalender.json';
const TIMEOUT_MS     = 15000;

const WASTE_TYPES = {
  REST:    'Restafval (Zwarte Kliko)',
  ZWAKRA:  'Glas & Blik',
  GFT:     'GFT (Groene Kliko)',
  PAP:     'Papier',
  PMD:     'PMD/Plastic',
  BESTAFR: 'Best Afval',
};

// --- Pure helpers (exported for testing) ---

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse the garbage array from the Circulus API into a date-keyed map.
 * Only includes dates in [from, to] (inclusive).
 */
function parseCalendar(garbage, from, to) {
  const fromStr = toDateString(from);
  const toStr   = toDateString(to);
  const cal     = {};

  for (const item of garbage) {
    if (!item.dates || item.dates.length === 0) continue;
    for (const isoDate of item.dates) {
      const dateStr = isoDate.slice(0, 10); // "YYYY-MM-DD"
      if (dateStr < fromStr || dateStr > toStr) continue;
      if (!cal[dateStr]) cal[dateStr] = [];
      cal[dateStr].push(item.code);
    }
  }

  return cal;
}

/** Return the list of waste type codes for a given date string. */
function getCollectionsForDate(calendar, dateStr) {
  return calendar[dateStr] || [];
}

/** Format an array of waste type codes into a human-readable Dutch string. */
function formatTypesList(codes) {
  return codes.map((c) => WASTE_TYPES[c] || c).join(', ');
}

// --- HTTP helper ---

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf-8'),
      }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error(`Request timed out after ${TIMEOUT_MS}ms`)); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// --- Public API ---

/**
 * Register an address with Circulus and return the CB_SESSION cookie value.
 * Throws if the request fails or no session cookie is returned.
 */
async function registerAddress(postcode, huisnummer) {
  const body = `zipCode=${encodeURIComponent(postcode)}&number=${encodeURIComponent(huisnummer)}`;
  const options = {
    hostname: REGISTER_HOST,
    port: 443,
    path: REGISTER_PATH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': 'HomeyAfvalkalender/1.0',
    },
    timeout: TIMEOUT_MS,
  };

  const res = await httpsRequest(options, body);

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Registratie mislukt: HTTP ${res.status}`);
  }

  const cookieHeader = res.headers['set-cookie'];
  const cookieStr = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : (cookieHeader || '');
  const match = cookieStr.match(/CB_SESSION=([^;]+)/);
  if (!match) {
    throw new Error('Adres niet gevonden. Controleer postcode en huisnummer.');
  }

  return match[1];
}

/**
 * Fetch the calendar for the next `days` days and return a date-keyed map.
 */
async function fetchCalendar(sessionCookie, days = 7) {
  const from = new Date();
  const to   = new Date();
  to.setDate(to.getDate() + days);

  const path = `${CALENDAR_PATH}?from=${toDateString(from)}&till=${toDateString(to)}`;
  const options = {
    hostname: REGISTER_HOST,
    port: 443,
    path,
    method: 'GET',
    headers: {
      'Cookie': `CB_SESSION=${sessionCookie}`,
      'User-Agent': 'HomeyAfvalkalender/1.0',
    },
    timeout: TIMEOUT_MS,
  };

  const res = await httpsRequest(options, null);

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Kalender ophalen mislukt: HTTP ${res.status}`);
  }

  let data;
  try {
    data = JSON.parse(res.body);
  } catch {
    throw new Error('Ongeldige JSON response van kalender API');
  }

  if (!data?.customData?.response?.garbage) {
    throw new Error('Onverwachte API response');
  }

  return parseCalendar(data.customData.response.garbage, from, to);
}

module.exports = { toDateString, parseCalendar, getCollectionsForDate, formatTypesList, registerAddress, fetchCalendar };
