'use strict';

/**
 * Groningen Afvalwijzer — Burgerportaal API client
 *
 * Flow:
 *   1. Anonymous Firebase sign-in → idToken
 *   2. Address lookup             → addressId
 *   3. Full-year calendar fetch   → filter to N-day window
 */

const https = require('node:https');

const FIREBASE_API_KEY = 'AIzaSyA6NkRqJypTfP-cjWzrZNFJzPUbBaGjOdk';
const ORG_CODE         = '452048812597326549'; // Gemeente Groningen
const API_HOST         = 'europe-west3-burgerportaal-production.cloudfunctions.net';
const TIMEOUT_MS       = 15000;

const WASTE_TYPES = {
  GFT:       'GFT (groente/fruit/tuin)',
  RESTAFVAL: 'Restafval',
  PAPIER:    'Papier',
  PMD:       'PMD (plastic/metaal/drankpakken)',
  PMDREST:   'PMD + Restafval',
  OPK:       'Oud papier en karton',
  KCA:       'Klein chemisch afval (KCA)',
};

// --- Pure helpers (exported for testing) ---

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse Burgerportaal calendar items into a date-keyed map.
 * Only includes dates in [from, to] (inclusive, as 'YYYY-MM-DD' strings).
 */
function parseCalendar(items, from, to) {
  const fromStr = toDateString(from);
  const toStr   = toDateString(to);
  const cal     = {};

  for (const item of items) {
    if (!item.collectionDate) continue;
    const dateStr = item.collectionDate.slice(0, 10);
    if (dateStr < fromStr || dateStr > toStr) continue;
    if (!cal[dateStr]) cal[dateStr] = [];
    const code = (item.fraction || '').toUpperCase();
    if (code && !cal[dateStr].includes(code)) {
      cal[dateStr].push(code);
    }
  }

  return cal;
}

/** Format an array of waste type codes into a human-readable Dutch string. */
function formatTypesList(codes) {
  return codes.map((c) => WASTE_TYPES[c] || c).join(', ');
}

// --- HTTP helpers ---

function _httpsPost(hostname, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname,
        port:    443,
        path,
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...extraHeaders,
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout na ${TIMEOUT_MS}ms`)); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function _httpsGet(hostname, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        port:    443,
        path,
        method:  'GET',
        headers: { 'User-Agent': 'HomeyAfvalkalender/1.0', ...headers },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout na ${TIMEOUT_MS}ms`)); });
    req.on('error', reject);
    req.end();
  });
}

// --- Auth ---

async function _signInAnonymously() {
  const res = await _httpsPost(
    'www.googleapis.com',
    `/identitytoolkit/v3/relyingparty/signupNewUser?key=${FIREBASE_API_KEY}`,
    {}
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Firebase auth mislukt: HTTP ${res.status}`);
  }
  let data;
  try { data = JSON.parse(res.body); } catch { throw new Error('Ongeldige Firebase auth response'); }
  if (!data.idToken) throw new Error('Firebase auth: geen idToken ontvangen');
  return data.idToken;
}

// --- Address lookup ---

async function _lookupAddress(idToken, postcode, huisnummer, toevoeging = '') {
  const normalizedPostcode = postcode.replace(/\s+/g, '').toUpperCase();
  const path = `/exposed/organisations/${ORG_CODE}/address?zipcode=${encodeURIComponent(normalizedPostcode)}&housenumber=${encodeURIComponent(huisnummer)}`;
  const res = await _httpsGet(API_HOST, path, { authorization: idToken });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Adres opzoeken mislukt: HTTP ${res.status}`);
  }
  if (!res.body || !res.body.trim()) {
    throw new Error('Adres niet gevonden. Controleer postcode en huisnummer.');
  }

  let addresses;
  try { addresses = JSON.parse(res.body); } catch { throw new Error('Ongeldige response bij adres opzoeken'); }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error('Adres niet gevonden. Controleer postcode en huisnummer.');
  }

  // Match by addition/toevoeging if provided
  const suffix = (toevoeging || '').toUpperCase();
  if (suffix) {
    const match = addresses.find((a) => (a.addition || '').toUpperCase() === suffix);
    if (match) return match.addressId;
  }

  return addresses[addresses.length - 1].addressId;
}

// --- Calendar fetch ---

async function _fetchCalendarRaw(idToken, addressId) {
  const path = `/exposed/organisations/${ORG_CODE}/address/${addressId}/calendar`;
  const res = await _httpsGet(API_HOST, path, { authorization: idToken });

  if (res.status === 204 || !res.body || !res.body.trim()) return [];
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Kalender ophalen mislukt: HTTP ${res.status}`);
  }

  try { return JSON.parse(res.body); } catch { throw new Error('Ongeldige kalender response'); }
}

// --- Public API ---

/**
 * Validate that an address exists in the Groningen Burgerportaal system.
 * Throws if the address is not found or the API call fails.
 */
async function validateAddress(postcode, huisnummer, toevoeging = '') {
  const idToken = await _signInAnonymously();
  await _lookupAddress(idToken, postcode, huisnummer, toevoeging);
}

/**
 * Fetch the calendar for the next `days` days and return a date-keyed map.
 * Returns: { 'YYYY-MM-DD': ['CODE1', 'CODE2'], ... }
 */
async function fetchCalendar(postcode, huisnummer, toevoeging = '', days = 7) {
  const from = new Date();
  const to   = new Date();
  to.setDate(to.getDate() + days);

  const idToken   = await _signInAnonymously();
  const addressId = await _lookupAddress(idToken, postcode, huisnummer, toevoeging);
  const items     = await _fetchCalendarRaw(idToken, addressId);

  return parseCalendar(items, from, to);
}

module.exports = { toDateString, parseCalendar, formatTypesList, validateAddress, fetchCalendar, WASTE_TYPES };
