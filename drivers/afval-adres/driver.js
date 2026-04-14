'use strict';

const Homey    = require('homey');
const trashApi = require('../../lib/trashapi');

class AfvalAdresDriver extends Homey.Driver {
  async onPair(session) {
    let pendingDevice = null;

    session.setHandler('validate_address', async ({ label, postcode, huisnummer, toevoeging }) => {
      const pc = (postcode   || '').trim().toUpperCase();
      const hn = (huisnummer || '').trim();
      const tv = (toevoeging || '').trim();

      this.log('Validating address:', pc, hn, tv);
      try {
        await trashApi.validateAddress(pc, hn, tv);
        pendingDevice = {
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
      const { postcode, huisnummer, toevoeging } = pendingDevice;
      const idParts = [postcode.toLowerCase(), huisnummer.toLowerCase()];
      if (toevoeging) idParts.push(toevoeging.toLowerCase());
      return [{
        name: pendingDevice.name,
        icon: '/icon.svg',
        data: { id: idParts.join('-') },
        settings: {
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
