'use strict';

/**
 * Zet een fout uit lib/ om naar een vertaalde melding voor de gebruiker.
 * Technische details (timeout, HTTP-status) blijven als detail zichtbaar.
 */
function userMessage(homey, err) {
  if (err && err.code === 'ADDRESS_NOT_FOUND') return homey.__('errors.address_not_found');
  return homey.__('errors.lookup_failed', { error: (err && err.message) || String(err) });
}

/** Korte vertaalde reden, om in een andere melding op te nemen (bijv. de apparaat-warning). */
function errorDetail(homey, err) {
  if (err && err.code === 'ADDRESS_NOT_FOUND') return homey.__('errors.address_not_found');
  return (err && err.message) || String(err);
}

module.exports = { userMessage, errorDetail };
