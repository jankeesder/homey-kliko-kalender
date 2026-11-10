'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  toDateString, parseCalendar, formatTypesList, formatTypesShort, getCollectionsForDate,
  WASTE_TYPES, WASTE_TYPES_SHORT,
} = require('../lib/trashapi');

describe('toDateString', () => {
  it('formats a date as YYYY-MM-DD', () => {
    assert.equal(toDateString(new Date('2026-04-14T10:00:00')), '2026-04-14');
  });

  it('pads month and day with zeros', () => {
    assert.equal(toDateString(new Date('2026-01-05T00:00:00')), '2026-01-05');
  });
});

describe('parseCalendar', () => {
  // TrashAPI format: { date: 'YYYY-MM-DDT00:00:00', name: 'Gft', daysTillDate: 1, ... }
  const items = [
    { date: '2026-04-14T00:00:00', name: 'Gft',       daysTillDate: 0 },
    { date: '2026-04-14T00:00:00', name: 'Restafval',  daysTillDate: 0 },
    { date: '2026-04-17T00:00:00', name: 'Papier',     daysTillDate: 3 },
    { date: '2026-04-22T00:00:00', name: 'Kca',        daysTillDate: 8 }, // buiten range
    { date: null,                  name: 'Glas',        daysTillDate: 5 }, // geen datum
  ];
  const from = new Date('2026-04-14');
  const to   = new Date('2026-04-20');

  it('groepeert collecties per datum', () => {
    const cal = parseCalendar(items, from, to);
    assert.deepEqual(cal['2026-04-14'].sort(), ['Gft', 'Restafval'].sort());
    assert.deepEqual(cal['2026-04-17'], ['Papier']);
  });

  it('sluit datums buiten de range uit', () => {
    const cal = parseCalendar(items, from, to);
    assert.equal(cal['2026-04-22'], undefined);
  });

  it('slaat items zonder datum over', () => {
    const cal = parseCalendar(items, from, to);
    const allTypes = Object.values(cal).flat();
    assert.ok(!allTypes.includes('Glas'));
  });

  it('retourneert leeg object bij lege input', () => {
    assert.deepEqual(parseCalendar([], from, to), {});
  });

  it('bevat de grensdatums zelf', () => {
    const boundary = [
      { date: '2026-04-14T00:00:00', name: 'Gft' },
      { date: '2026-04-20T00:00:00', name: 'Papier' },
    ];
    const cal = parseCalendar(boundary, from, to);
    assert.deepEqual(cal['2026-04-14'], ['Gft']);
    assert.deepEqual(cal['2026-04-20'], ['Papier']);
  });

  it('dedupliceert dubbele namen op dezelfde dag', () => {
    const dupes = [
      { date: '2026-04-14T00:00:00', name: 'Gft' },
      { date: '2026-04-14T00:00:00', name: 'Gft' },
    ];
    const cal = parseCalendar(dupes, from, to);
    assert.deepEqual(cal['2026-04-14'], ['Gft']);
  });
});

describe('formatTypesList', () => {
  it('mapt TrashAPI namen naar Nederlandse labels', () => {
    assert.equal(formatTypesList(['Gft', 'Papier']), 'GFT (groente/fruit/tuin), Papier');
  });

  it('valt terug op de ruwe naam voor onbekende types', () => {
    assert.equal(formatTypesList(['Onbekend']), 'Onbekend');
  });

  it('retourneert lege string bij lege array', () => {
    assert.equal(formatTypesList([]), '');
  });
});

describe('formatTypesShort', () => {
  it('mapt TrashAPI namen naar korte labels', () => {
    assert.equal(formatTypesShort(['Gft', 'Pbd']), 'GFT, PMD');
  });

  it('heeft een kort label voor elk bekend type', () => {
    for (const name of Object.keys(WASTE_TYPES)) {
      assert.ok(WASTE_TYPES_SHORT[name], `geen kort label voor ${name}`);
      assert.ok(WASTE_TYPES_SHORT[name].length <= 10, `label te lang voor ${name}`);
    }
  });

  it('valt terug op de ruwe naam voor onbekende types', () => {
    assert.equal(formatTypesShort(['Onbekend']), 'Onbekend');
  });

  it('retourneert lege string bij lege array', () => {
    assert.equal(formatTypesShort([]), '');
  });
});

describe('getCollectionsForDate', () => {
  const calendar = {
    '2026-04-14': ['Gft', 'Restafval'],
    '2026-04-17': ['Papier'],
  };

  it('retourneert de types voor een bestaande datum', () => {
    assert.deepEqual(getCollectionsForDate(calendar, '2026-04-14'), ['Gft', 'Restafval']);
  });

  it('retourneert lege array voor een datum zonder ophaling', () => {
    assert.deepEqual(getCollectionsForDate(calendar, '2026-04-15'), []);
  });
});

describe('fetchFromSources', () => {
  const { fetchFromSources } = require('../lib/trashapi');
  const ok    = (items) => async () => ({ found: true,  items });
  const empty = async () => ({ found: false, items: [] });
  const fail  = (msg) => async () => { throw new Error(msg); };

  it('gebruikt de eerste bron die het adres kent', async () => {
    let called = false;
    const second = async () => { called = true; return { found: true, items: [] }; };
    const items = await fetchFromSources([ok([{ name: 'Gft' }]), second]);
    assert.deepEqual(items, [{ name: 'Gft' }]);
    assert.equal(called, false);
  });

  it('valt terug op de volgende bron als de eerste leeg is', async () => {
    assert.deepEqual(await fetchFromSources([empty, ok([{ name: 'Papier' }])]), [{ name: 'Papier' }]);
  });

  it('valt terug op de volgende bron als de eerste faalt', async () => {
    assert.deepEqual(await fetchFromSources([fail('Timeout after 15000ms'), ok([])]), []);
  });

  it('meldt adres niet gevonden als geen enkele bron het adres kent', async () => {
    await assert.rejects(fetchFromSources([empty, empty]), { code: 'ADDRESS_NOT_FOUND', message: 'Address not found' });
  });

  it('meldt adres niet gevonden met foutdetail als één bron faalt en de ander het adres niet kent', async () => {
    await assert.rejects(
      fetchFromSources([fail('TrashAPI error: HTTP 500'), empty]),
      { code: 'ADDRESS_NOT_FOUND', message: 'Address not found (TrashAPI error: HTTP 500)' }
    );
  });

  it('geeft de eerste fout door als alle bronnen falen', async () => {
    await assert.rejects(fetchFromSources([fail('Timeout after 15000ms'), fail('HTTP 502')]), { message: 'Timeout after 15000ms' });
  });

  it('geeft argumenten door aan elke bron', async () => {
    const seen = [];
    const spy = async (...args) => { seen.push(args); return { found: false, items: [] }; };
    await assert.rejects(fetchFromSources([spy, spy], '7552NS', '28', 'A'));
    assert.deepEqual(seen, [['7552NS', '28', 'A'], ['7552NS', '28', 'A']]);
  });
});
