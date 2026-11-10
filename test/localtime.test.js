'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { localDateString, msUntilNextLocalTime } = require('../lib/localtime');

const TZ = 'Europe/Amsterdam';

describe('localDateString', () => {
  it('geeft de lokale datum, niet de UTC-datum, net na middernacht', () => {
    // 00:30 in Amsterdam (winter, UTC+1) = 23:30 UTC de dag ervoor
    const now = new Date('2026-11-09T23:30:00Z');
    assert.equal(localDateString(TZ, 0, now), '2026-11-10');
  });

  it('werkt ook in de zomer (UTC+2)', () => {
    const now = new Date('2026-07-14T22:30:00Z'); // 00:30 lokaal op 15 juli
    assert.equal(localDateString(TZ, 0, now), '2026-07-15');
  });

  it('telt dagen op, ook over een maandgrens', () => {
    const now = new Date('2026-11-30T10:00:00Z');
    assert.equal(localDateString(TZ, 1, now), '2026-12-01');
    assert.equal(localDateString(TZ, 7, now), '2026-12-07');
  });

  it('telt dagen op over de wintertijdovergang', () => {
    const now = new Date('2026-10-24T22:30:00Z'); // 00:30 lokaal op 25 okt (overgang die nacht)
    assert.equal(localDateString(TZ, 0, now), '2026-10-25');
    assert.equal(localDateString(TZ, 1, now), '2026-10-26');
  });

  it('valt terug op UTC als er geen tijdzone is', () => {
    assert.equal(localDateString(undefined, 0, new Date('2026-11-09T23:30:00Z')), '2026-11-09');
  });
});

describe('msUntilNextLocalTime', () => {
  const at = (now, ms) => new Date(now.getTime() + ms).toISOString();

  it('rekent tot 00:01 lokale tijd, niet UTC', () => {
    const now = new Date('2026-11-10T12:00:00Z'); // 13:00 lokaal
    assert.equal(at(now, msUntilNextLocalTime(TZ, 0, 1, now)), '2026-11-10T23:01:00.000Z');
  });

  it('kiest de volgende dag als het tijdstip vandaag al voorbij is', () => {
    const now = new Date('2026-11-09T23:30:00Z'); // 00:30 lokaal, 00:01 is net geweest
    assert.equal(at(now, msUntilNextLocalTime(TZ, 0, 1, now)), '2026-11-10T23:01:00.000Z');
  });

  it('klopt in de nacht van de zomertijdovergang (23 uur lange dag)', () => {
    const now = new Date('2026-03-28T12:00:00Z'); // za 13:00 lokaal, die nacht gaat de klok vooruit
    assert.equal(at(now, msUntilNextLocalTime(TZ, 0, 1, now)), '2026-03-28T23:01:00.000Z');
    const sunday = new Date('2026-03-29T12:00:00Z'); // zo 14:00 lokaal (UTC+2)
    assert.equal(at(sunday, msUntilNextLocalTime(TZ, 0, 1, sunday)), '2026-03-29T22:01:00.000Z');
  });

  it('klopt in de nacht van de wintertijdovergang (25 uur lange dag)', () => {
    const now = new Date('2026-10-24T12:00:00Z'); // za 14:00 lokaal (UTC+2), die nacht gaat de klok terug
    assert.equal(at(now, msUntilNextLocalTime(TZ, 0, 1, now)), '2026-10-24T22:01:00.000Z');
    const sunday = new Date('2026-10-25T12:00:00Z'); // zo 13:00 lokaal (UTC+1)
    assert.equal(at(sunday, msUntilNextLocalTime(TZ, 0, 1, sunday)), '2026-10-25T23:01:00.000Z');
  });

  it('is altijd positief', () => {
    const now = new Date('2026-11-09T23:01:00Z'); // precies 00:01 lokaal
    assert.ok(msUntilNextLocalTime(TZ, 0, 1, now) > 0);
  });
});
