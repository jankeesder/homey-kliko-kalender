'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { toDateString, parseCalendar, formatTypesList } = require('../lib/afvalwijzer-api');

describe('toDateString', () => {
  it('formats a date as YYYY-MM-DD', () => {
    assert.equal(toDateString(new Date('2026-04-11T10:00:00')), '2026-04-11');
  });

  it('pads month and day with zeros', () => {
    assert.equal(toDateString(new Date('2026-01-05T00:00:00')), '2026-01-05');
  });
});

describe('parseCalendar', () => {
  // Burgerportaal format: { collectionDate: 'YYYY-MM-DDT...', fraction: 'GFT' }
  const items = [
    { collectionDate: '2026-04-11T00:00:00.000Z', fraction: 'GFT' },
    { collectionDate: '2026-04-11T00:00:00.000Z', fraction: 'PAPIER' },
    { collectionDate: '2026-04-14T00:00:00.000Z', fraction: 'RESTAFVAL' },
    { collectionDate: '2026-04-20T00:00:00.000Z', fraction: 'PMD' },   // buiten range
    { collectionDate: null,                        fraction: 'KCA' },   // geen datum
  ];
  const from = new Date('2026-04-11');
  const to   = new Date('2026-04-17');

  it('groepeert collecties per datum', () => {
    const cal = parseCalendar(items, from, to);
    assert.deepEqual(cal['2026-04-11'].sort(), ['GFT', 'PAPIER'].sort());
    assert.deepEqual(cal['2026-04-14'], ['RESTAFVAL']);
  });

  it('sluit datums buiten de range uit', () => {
    const cal = parseCalendar(items, from, to);
    assert.equal(cal['2026-04-20'], undefined);
  });

  it('slaat items zonder datum over', () => {
    const cal = parseCalendar(items, from, to);
    const allTypes = Object.values(cal).flat();
    assert.ok(!allTypes.includes('KCA'));
  });

  it('retourneert leeg object bij lege input', () => {
    assert.deepEqual(parseCalendar([], from, to), {});
  });

  it('bevat de grensdatums zelf', () => {
    const boundary = [
      { collectionDate: '2026-04-11T00:00:00.000Z', fraction: 'GFT' },
      { collectionDate: '2026-04-17T00:00:00.000Z', fraction: 'PAPIER' },
    ];
    const cal = parseCalendar(boundary, from, to);
    assert.deepEqual(cal['2026-04-11'], ['GFT']);
    assert.deepEqual(cal['2026-04-17'], ['PAPIER']);
  });

  it('normaliseert fraction naar hoofdletters', () => {
    const mixed = [{ collectionDate: '2026-04-11T00:00:00.000Z', fraction: 'gft' }];
    const cal = parseCalendar(mixed, from, to);
    assert.deepEqual(cal['2026-04-11'], ['GFT']);
  });

  it('dedupliceert dubbele codes op dezelfde dag', () => {
    const dupes = [
      { collectionDate: '2026-04-11T00:00:00.000Z', fraction: 'GFT' },
      { collectionDate: '2026-04-11T00:00:00.000Z', fraction: 'GFT' },
    ];
    const cal = parseCalendar(dupes, from, to);
    assert.deepEqual(cal['2026-04-11'], ['GFT']);
  });
});

describe('formatTypesList', () => {
  it('mapt Burgerportaal codes naar Nederlandse labels', () => {
    assert.equal(formatTypesList(['GFT', 'PAPIER']), 'GFT (groente/fruit/tuin), Papier');
  });

  it('valt terug op de ruwe code voor onbekende types', () => {
    assert.equal(formatTypesList(['ONBEKEND']), 'ONBEKEND');
  });

  it('retourneert lege string bij lege array', () => {
    assert.equal(formatTypesList([]), '');
  });
});
