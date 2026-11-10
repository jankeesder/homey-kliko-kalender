'use strict';

/**
 * Twente Milieu client (Ximmio-platform) — https://twentemilieuapi.ximmio.com
 * Fallback voor adressen waarvoor TrashAPI geen data teruggeeft.
 * Levert items in hetzelfde formaat als TrashAPI: { date: "YYYY-MM-DDT00:00:00", name: "Gft" }.
 */

const { httpsRequest } = require('./http');

const API_HOST     = 'twentemilieuapi.ximmio.com';
const COMPANY_CODE = '8d97bb56-5afd-4cbc-a651-b4f7314264b4';
const TIMEOUT_MS   = 15000;
const RANGE_DAYS   = 60;

// Ximmio pickup type → TrashAPI-naam (zodat labels en Flows gelijk blijven).
const PICKUP_TYPES = {
  GREEN:            'Gft',
  GREY:             'Restafval',
  PAPER:            'Papier',
  PACKAGES:         'Pbd',
  PACKAGESBAG:      'Pbd',
  PLASTIC:          'Pbd',
  TEXTILE:          'Textiel',
  GLASS:            'Glas',
  KCA:              'Kca',
  BULKLITTER:       'Grofvuil',
  BULKYGARDENWASTE: 'Takken',
  TREE:             'Kerstbomen',
};

// --- Pure helpers (exported for testing) ---

const _norm = (s) => (s || '').trim().toUpperCase();

/**
 * Kies het juiste adres uit de FetchAdress-resultaten.
 * Met toevoeging: match op huisletter of huisnummertoevoeging. Zonder: liefst het adres zonder toevoeging.
 */
function pickAddress(dataList, toevoeging) {
  if (!Array.isArray(dataList) || dataList.length === 0) return null;
  const tv = _norm(toevoeging);
  if (tv) {
    return dataList.find((a) => _norm(a.HouseLetter) === tv || _norm(a.HouseNumberAddition) === tv) || null;
  }
  return dataList.find((a) => !_norm(a.HouseLetter) && !_norm(a.HouseNumberAddition)) || dataList[0];
}

/** Zet Ximmio GetCalendar dataList om naar TrashAPI-achtige items. */
function parseXimmioCalendar(dataList) {
  if (!Array.isArray(dataList)) return [];
  const items = [];
  for (const entry of dataList) {
    const code = entry._pickupTypeText || '';
    const name = PICKUP_TYPES[code] || code;
    for (const date of entry.pickupDates || []) {
      items.push({ date, name });
    }
  }
  return items;
}

// --- HTTP ---

async function _post(path, payload) {
  const res = await httpsRequest({
    hostname: API_HOST, path, method: 'POST', body: JSON.stringify(payload), timeoutMs: TIMEOUT_MS,
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`Twente Milieu API-fout: HTTP ${res.status}`);
  let data;
  try { data = JSON.parse(res.body); } catch { throw new Error('Ongeldige JSON response van Twente Milieu'); }
  return data.dataList;
}

function _isoDate(date) {
  return date.toISOString().slice(0, 10);
}

// --- Public API ---

/**
 * Haal ophaaldata op bij Twente Milieu.
 * Returns { found, items }: found is true als Twente Milieu het adres kent (ook als er geen ophaaldata zijn).
 */
async function fetchItems(postcode, huisnummer, toevoeging = '') {
  const address = pickAddress(
    await _post('/api/FetchAdress', { companyCode: COMPANY_CODE, postCode: postcode, houseNumber: huisnummer }),
    toevoeging
  );
  if (!address) return { found: false, items: [] };

  const from = new Date();
  const to   = new Date();
  to.setDate(to.getDate() + RANGE_DAYS);

  const dataList = await _post('/api/GetCalendar', {
    companyCode:     COMPANY_CODE,
    uniqueAddressID: address.UniqueId,
    startDate:       _isoDate(from),
    endDate:         _isoDate(to),
  });
  return { found: true, items: parseXimmioCalendar(dataList) };
}

module.exports = { pickAddress, parseXimmioCalendar, fetchItems, PICKUP_TYPES };
