'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { toDateString, parseCalendar, formatTypesList, getCollectionsForDate } = require('../lib/trashapi');

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
