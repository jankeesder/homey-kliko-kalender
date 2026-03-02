'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Import only the pure parsing functions — no HTTP
const { toDateString, parseCalendar, getCollectionsForDate, formatTypesList } = require('../lib/circulus-api');

describe('toDateString', () => {
  it('formats a date as YYYY-MM-DD', () => {
    const d = new Date('2026-02-18T10:00:00');
    assert.equal(toDateString(d), '2026-02-18');
  });

  it('pads month and day with zeros', () => {
    const d = new Date('2026-03-05T00:00:00');
    assert.equal(toDateString(d), '2026-03-05');
  });
});

describe('parseCalendar', () => {
  const garbage = [
    { code: 'GFT',  dates: ['2026-02-18T00:00:00+01:00', '2026-03-04T00:00:00+01:00'] },
    { code: 'PAP',  dates: ['2026-02-20T00:00:00+01:00'] },
    { code: 'REST', dates: ['2026-02-25T00:00:00+01:00'] },
    { code: 'PMD',  dates: [] },
  ];
  const from = new Date('2026-02-18');
  const to   = new Date('2026-02-25');

  it('groups collections by date', () => {
    const cal = parseCalendar(garbage, from, to);
    assert.deepEqual(cal['2026-02-18'], ['GFT']);
    assert.deepEqual(cal['2026-02-20'], ['PAP']);
  });

  it('excludes dates outside the range', () => {
    const cal = parseCalendar(garbage, from, to);
    assert.equal(cal['2026-03-04'], undefined);
  });

  it('includes the `to` date itself', () => {
    const cal = parseCalendar(garbage, from, to);
    assert.deepEqual(cal['2026-02-25'], ['REST']);
  });

  it('ignores waste types with empty dates', () => {
    const cal = parseCalendar(garbage, from, to);
    const allTypes = Object.values(cal).flat();
    assert.ok(!allTypes.includes('PMD'));
  });

  it('returns empty object when no garbage data', () => {
    const cal = parseCalendar([], from, to);
    assert.deepEqual(cal, {});
  });

  it('collects multiple types on the same date', () => {
    const multi = [
      { code: 'GFT', dates: ['2026-02-18T00:00:00+01:00'] },
      { code: 'PAP', dates: ['2026-02-18T00:00:00+01:00'] },
    ];
    const cal = parseCalendar(multi, from, to);
    assert.deepEqual(cal['2026-02-18'].sort(), ['GFT', 'PAP'].sort());
  });
});

describe('getCollectionsForDate', () => {
  const cal = {
    '2026-02-18': ['GFT', 'PAP'],
    '2026-02-20': ['REST'],
  };

  it('returns types for a matching date', () => {
    assert.deepEqual(getCollectionsForDate(cal, '2026-02-18'), ['GFT', 'PAP']);
  });

  it('returns empty array for a date with no collection', () => {
    assert.deepEqual(getCollectionsForDate(cal, '2026-02-19'), []);
  });

  it('returns empty array for a date outside the calendar', () => {
    assert.deepEqual(getCollectionsForDate(cal, '2026-03-01'), []);
  });
});

describe('formatTypesList', () => {
  it('maps codes to Dutch labels and joins with comma', () => {
    assert.equal(formatTypesList(['GFT', 'PAP']), 'GFT (Groene Kliko), Papier');
  });

  it('falls back to the raw code for unknown types', () => {
    assert.equal(formatTypesList(['UNKNOWN']), 'UNKNOWN');
  });

  it('returns empty string for empty array', () => {
    assert.equal(formatTypesList([]), '');
  });
});
