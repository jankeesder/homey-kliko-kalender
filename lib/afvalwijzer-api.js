'use strict';

const https = require('node:https');

const API_HOST   = 'api.mijnafvalwijzer.nl';
const API_PATH   = '/webservices/appsinput/';
const API_KEY    = '5ef443e778f41c4f75c69459eea6e6ae0c2d92de729aa0fc61653815fbd6a8ca';
const TIMEOUT_MS = 15000;

const WASTE_TYPES = {
  gft:        'GFT (groente/fruit/tuin)',
  restafval:  'Restafval',
  papier:     'Papier',
  pmd:        'PMD (plastic/metaal/drankpakken)',
  glas:       'Glas',
  textiel:    'Textiel',
  kca:        'Chemisch afval (KCA)',
  grof:       'Grof huishoudelijk afval',
  takken:     'Takken/snoeiafval',
  kerstbomen: 'Kerstbomen',
};

// --- Pure helpers (exported for testing) ---

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse the items array from the AfvalWijzer API into a date-keyed map.
 * Only includes dates in [from, to] (inclusive).
 */
function parseCalendar(items, from, to) {
  const fromStr = toDateString(from);
  const toStr   = toDateString(to);
  const cal     = {};

  for (const item of items) {
    const dateStr = item.date ? item.date.slice(0, 10) : null;
    if (!dateStr) continue;
    if (dateStr < fromStr || dateStr > toStr) continue;
    if (!cal[dateStr]) cal[dateStr] = [];
    cal[dateStr].push(item.nameType);
  }

  return cal;
}

/** Format an array of waste type codes into a human-readable Dutch string. */
function formatTypesList(codes) {
  return codes.map((c) => WASTE_TYPES[c] || c).join(', ');
}

// --- HTTP helper ---

function _httpsGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: API_HOST,
        port:     443,
        path,
        method:   'GET',
        headers:  { 'User-Agent': 'HomeyAfvalkalender/1.0' },
        timeout:  TIMEOUT_MS,
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

// --- Request builders ---

function _buildPath(postcode, huisnummer, toevoeging, afvaldata) {
  const params = new URLSearchParams({
    apikey:     API_KEY,
    method:     'postcodecheck',
    postcode,
    street:     '',
    huisnummer,
    toevoeging: toevoeging || '',
    app_name:   'afvalwijzer',
    platform:   'web',
    langs:      'nl',
    afvaldata,
  });
  return `${API_PATH}?${params.toString()}`;
}

function _parseResponse(body) {
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('Ongeldige JSON response van AfvalWijzer API'); }
  if (data.response === 'NOK') throw new Error(data.error || 'Adres niet gevonden. Controleer postcode en huisnummer.');
  return data;
}

// --- Public API ---

/**
 * Validate that an address exists in the AfvalWijzer system.
 * Throws if the address is not found or the API call fails.
 */
async function validateAddress(postcode, huisnummer, toevoeging = '') {
  const res = await _httpsGet(_buildPath(postcode, huisnummer, toevoeging, toDateString(new Date())));
  if (res.status < 200 || res.status >= 300) throw new Error(`API-fout: HTTP ${res.status}`);
  _parseResponse(res.body);
}

/**
 * Fetch the calendar for the next `days` days and return a date-keyed map.
 */
async function fetchCalendar(postcode, huisnummer, toevoeging = '', days = 7) {
  const from = new Date();
  const to   = new Date();
  to.setDate(to.getDate() + days);

  const res = await _httpsGet(_buildPath(postcode, huisnummer, toevoeging, toDateString(from)));
  if (res.status < 200 || res.status >= 300) throw new Error(`API-fout: HTTP ${res.status}`);

  const data  = _parseResponse(res.body);
  const items = [
    ...(data.ophaaldagen?.data     || []),
    ...(data.ophaaldagenNext?.data || []),
  ];

  return parseCalendar(items, from, to);
}

module.exports = { toDateString, parseCalendar, formatTypesList, validateAddress, fetchCalendar, WASTE_TYPES };
