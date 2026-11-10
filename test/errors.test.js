'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { userMessage, errorDetail } = require('../lib/errors');

// Nep-i18n: geeft key + tokens terug zodat we kunnen zien wat er vertaald wordt.
const homey = { __: (key, tokens) => (tokens ? `${key}|${tokens.error}` : key) };

describe('userMessage', () => {
  it('vertaalt een onbekend adres naar de not-found-melding', () => {
    const err = Object.assign(new Error('Address not found'), { code: 'ADDRESS_NOT_FOUND' });
    assert.equal(userMessage(homey, err), 'errors.address_not_found');
  });

  it('wikkelt overige fouten in de lookup-failed-melding met het technische detail', () => {
    assert.equal(userMessage(homey, new Error('Timeout after 15000ms')), 'errors.lookup_failed|Timeout after 15000ms');
  });
});

describe('errorDetail', () => {
  it('vertaalt een onbekend adres', () => {
    const err = Object.assign(new Error('Address not found'), { code: 'ADDRESS_NOT_FOUND' });
    assert.equal(errorDetail(homey, err), 'errors.address_not_found');
  });

  it('geeft bij overige fouten alleen het technische detail', () => {
    assert.equal(errorDetail(homey, new Error('Timeout after 15000ms')), 'Timeout after 15000ms');
  });
});
