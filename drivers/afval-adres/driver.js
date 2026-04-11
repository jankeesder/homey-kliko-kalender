'use strict';

const Homey          = require('homey');
const circulusApi    = require('../../lib/circulus-api');
const afvalwijzerApi = require('../../lib/afvalwijzer-api');

class AfvalAdresDriver extends Homey.Driver {
  async onPair(session) {
    let pendingDevice = null;

    session.setHandler('validate_address', async ({ provider, label, postcode, huisnummer, toevoeging }) => {
      const pc   = (postcode   || '').trim().toUpperCase();
      const hn   = (huisnummer || '').trim();
      const tv   = (toevoeging || '').trim();
      const prov = provider || 'circulus';

      this.log('Validating address:', pc, hn, tv, '(provider:', prov + ')');
      try {
        if (prov === 'afvalwijzer') {
          await afvalwijzerApi.validateAddress(pc, hn, tv);
        } else {
          await circulusApi.registerAddress(pc, hn);
        }
        pendingDevice = {
          provider:   prov,
          name:       label.trim() || `${pc} ${hn}${tv ? ' ' + tv : ''}`,
          postcode:   pc,
          huisnummer: hn,
          toevoeging: tv,
        };
        return { success: true };
      } catch (err) {
        this.error('Address validation failed:', err.message);
        return { success: false, error: err.message };
      }
    });

    session.setHandler('list_devices', async () => {
      if (!pendingDevice) return [];
      const { provider, postcode, huisnummer, toevoeging } = pendingDevice;
      const idParts = [provider, postcode.toLowerCase(), huisnummer.toLowerCase()];
      if (toevoeging) idParts.push(toevoeging.toLowerCase());
      const id = idParts.join('-');
      return [{
        name: pendingDevice.name,
        icon: '/icon.svg',
        data: { id },
        settings: {
          provider,
          postcode,
          huisnummer,
          toevoeging,
          refresh_interval: '86400',
        },
      }];
    });
  }
}

module.exports = AfvalAdresDriver;
