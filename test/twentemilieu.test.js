'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { pickAddress, parseXimmioCalendar, PICKUP_TYPES } = require('../lib/twentemilieu');
const { WASTE_TYPES } = require('../lib/trashapi');

// Ximmio vult lege velden met een spatie.
const addr = (UniqueId, HouseLetter = ' ', HouseNumberAddition = ' ') => ({
  UniqueId, HouseNumber: '28', HouseLetter, HouseNumberAddition, ZipCode: '7552NS',
});

describe('pickAddress', () => {
  it('retourneert null bij lege lijst', () => {
    assert.equal(pickAddress([], ''), null);
    assert.equal(pickAddress(null, ''), null);
  });

  it('kiest het adres zonder toevoeging als er geen toevoeging is opgegeven', () => {
    const list = [addr('2', 'A'), addr('1')];
    assert.equal(pickAddress(list, '').UniqueId, '1');
  });

  it('matcht een huisletter, hoofdletterongevoelig', () => {
    const list = [addr('1'), addr('2', 'A'), addr('3', 'B')];
    assert.equal(pickAddress(list, 'b').UniqueId, '3');
  });

  it('matcht een huisnummertoevoeging', () => {
    const list = [addr('1'), addr('2', ' ', 'BIS')];
    assert.equal(pickAddress(list, 'bis').UniqueId, '2');
  });

  it('retourneert null als de opgegeven toevoeging niet bestaat', () => {
    assert.equal(pickAddress([addr('1'), addr('2', 'A')], 'C'), null);
  });

  it('valt terug op het eerste adres als er geen adres zonder toevoeging is', () => {
    assert.equal(pickAddress([addr('2', 'A'), addr('3', 'B')], '').UniqueId, '2');
  });
});

describe('parseXimmioCalendar', () => {
  it('zet Ximmio-ophaaldata om naar TrashAPI-items', () => {
    const dataList = [
      { pickupDates: ['2026-11-10T00:00:00', '2026-11-24T00:00:00'], _pickupTypeText: 'GREEN' },
      { pickupDates: ['2026-11-11T00:00:00'], _pickupTypeText: 'PAPER' },
      { pickupDates: ['2026-11-19T00:00:00'], _pickupTypeText: 'PACKAGES' },
    ];
    assert.deepEqual(parseXimmioCalendar(dataList), [
      { date: '2026-11-10T00:00:00', name: 'Gft' },
      { date: '2026-11-24T00:00:00', name: 'Gft' },
      { date: '2026-11-11T00:00:00', name: 'Papier' },
      { date: '2026-11-19T00:00:00', name: 'Pbd' },
    ]);
  });

  it('mapt PMD-zakken naar Pbd', () => {
    const items = parseXimmioCalendar([{ pickupDates: ['2026-11-12T00:00:00'], _pickupTypeText: 'PACKAGESBAG' }]);
    assert.deepEqual(items, [{ date: '2026-11-12T00:00:00', name: 'Pbd' }]);
  });

  it('houdt onbekende types als leesbare naam', () => {
    const items = parseXimmioCalendar([{ pickupDates: ['2026-11-10T00:00:00'], _pickupTypeText: 'SOMETHING' }]);
    assert.deepEqual(items, [{ date: '2026-11-10T00:00:00', name: 'SOMETHING' }]);
  });

  it('verdraagt ontbrekende velden', () => {
    assert.deepEqual(parseXimmioCalendar(null), []);
    assert.deepEqual(parseXimmioCalendar([{ _pickupTypeText: 'GREEN' }]), []);
  });

  it('mapt elk bekend Ximmio-type naar een TrashAPI-naam met label', () => {
    for (const [code, name] of Object.entries(PICKUP_TYPES)) {
      assert.ok(WASTE_TYPES[name], `${code} → ${name} heeft geen label`);
    }
  });
});
