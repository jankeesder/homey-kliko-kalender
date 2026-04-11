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
  const items = [
    { date: '2026-04-11', nameType: 'gft' },
    { date: '2026-04-11', nameType: 'papier' },
    { date: '2026-04-14', nameType: 'restafval' },
    { date: '2026-04-20', nameType: 'pmd' },  // buiten range
    { date: null,         nameType: 'glas' },  // geen datum
  ];
  const from = new Date('2026-04-11');
  const to   = new Date('2026-04-17');

  it('groepeert collecties per datum', () => {
    const cal = parseCalendar(items, from, to);
    assert.deepEqual(cal['2026-04-11'].sort(), ['gft', 'papier'].sort());
    assert.deepEqual(cal['2026-04-14'], ['restafval']);
  });

  it('sluit datums buiten de range uit', () => {
    const cal = parseCalendar(items, from, to);
    assert.equal(cal['2026-04-20'], undefined);
  });

  it('slaat items zonder datum over', () => {
    const cal = parseCalendar(items, from, to);
    const allTypes = Object.values(cal).flat();
    assert.ok(!allTypes.includes('glas'));
  });

  it('retourneert leeg object bij lege input', () => {
    assert.deepEqual(parseCalendar([], from, to), {});
  });

  it('bevat de grensdatums zelf', () => {
    const boundary = [
      { date: '2026-04-11', nameType: 'gft' },
      { date: '2026-04-17', nameType: 'papier' },
    ];
    const cal = parseCalendar(boundary, from, to);
    assert.deepEqual(cal['2026-04-11'], ['gft']);
    assert.deepEqual(cal['2026-04-17'], ['papier']);
  });
});

describe('formatTypesList', () => {
  it('mapt AfvalWijzer codes naar Nederlandse labels', () => {
    assert.equal(formatTypesList(['gft', 'papier']), 'GFT (groente/fruit/tuin), Papier');
  });

  it('valt terug op de ruwe code voor onbekende types', () => {
    assert.equal(formatTypesList(['onbekend']), 'onbekend');
  });

  it('retourneert lege string bij lege array', () => {
    assert.equal(formatTypesList([]), '');
  });
});
