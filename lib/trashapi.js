'use strict';

/**
 * TrashAPI client — https://trashapi.azurewebsites.net
 * Dekt heel Nederland via één enkel endpoint.
 * Response per item: { date: "YYYY-MM-DDT00:00:00", name: "Gft", daysTillDate: 1, ... }
 */

const https = require('node:https');

const API_HOST   = 'trashapi.azurewebsites.net';
const TIMEOUT_MS = 15000;

const WASTE_TYPES = {
  Gft:        'GFT (groente/fruit/tuin)',
  Restafval:  'Restafval',
  Papier:     'Papier',
  Kca:        'Klein chemisch afval (KCA)',
  Pbd:        'Plastic, blik & drankpakken',
  Grofvuil:   'Grof vuil',
  Textiel:    'Textiel',
  Glas:       'Glas',
  Takken:     'Takken/snoeiafval',
  Kerstbomen: 'Kerstbomen',
};

// --- Pure helpers (exported for testing) ---

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse TrashAPI items into a date-keyed map.
 * Only includes dates in [from, to] (inclusive).
 */
function parseCalendar(items, from, to) {
  const fromStr = toDateString(from);
  const toStr   = toDateString(to);
  const cal     = {};

  for (const item of items) {
    if (!item.date) continue;
    const dateStr = item.date.slice(0, 10);
    if (dateStr < fromStr || dateStr > toStr) continue;
    if (!cal[dateStr]) cal[dateStr] = [];
    const name = item.name || '';
    if (name && !cal[dateStr].includes(name)) {
      cal[dateStr].push(name);
    }
  }

  return cal;
}

/** Format an array of waste type names into a human-readable Dutch string. */
function formatTypesList(names) {
  return names.map((n) => WASTE_TYPES[n] || n).join(', ');
}

/** Return collections for a specific date string from a calendar map. */
function getCollectionsForDate(calendar, dateStr) {
  return calendar[dateStr] || [];
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

function _buildPath(postcode, huisnummer, toevoeging) {
  const params = new URLSearchParams({
    Location:           '',
    ZipCode:            postcode,
    HouseNumber:        huisnummer,
    HouseNumberSuffix:  toevoeging || '',
    DiftarCode:         '',
    ShowWholeYear:      'true',
    GetCleanprofsData:  'false',
  });
  return `/trash?${params.toString()}`;
}

function _parseResponse(body) {
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('Ongeldige JSON response van TrashAPI'); }
  if (!Array.isArray(data)) throw new Error('Onverwacht response formaat van TrashAPI');
  return data;
}

// --- Public API ---

/**
 * Validate that an address is known in TrashAPI.
 * Throws if the address returns no data.
 */
async function validateAddress(postcode, huisnummer, toevoeging = '') {
  const res = await _httpsGet(_buildPath(postcode, huisnummer, toevoeging));
  if (res.status < 200 || res.status >= 300) throw new Error(`API-fout: HTTP ${res.status}`);
  const items = _parseResponse(res.body);
  if (items.length === 0) throw new Error('Adres niet gevonden. Controleer postcode en huisnummer.');
}

/**
 * Fetch the calendar for the next `days` days and return a date-keyed map.
 * Returns: { 'YYYY-MM-DD': ['Gft', 'Papier'], ... }
 */
async function fetchCalendar(postcode, huisnummer, toevoeging = '', days = 7) {
  const from = new Date();
  const to   = new Date();
  to.setDate(to.getDate() + days);

  const res = await _httpsGet(_buildPath(postcode, huisnummer, toevoeging));
  if (res.status < 200 || res.status >= 300) throw new Error(`API-fout: HTTP ${res.status}`);

  const items = _parseResponse(res.body);
  return parseCalendar(items, from, to);
}

module.exports = { toDateString, parseCalendar, formatTypesList, getCollectionsForDate, validateAddress, fetchCalendar, WASTE_TYPES };
