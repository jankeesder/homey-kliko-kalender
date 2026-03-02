'use strict';

const Homey = require('homey');
const { registerAddress } = require('../../lib/circulus-api');

class AfvalAdresDriver extends Homey.Driver {
  async onPair(session) {
    let pendingDevice = null;

    session.setHandler('validate_address', async ({ label, postcode, huisnummer }) => {
      this.log('Validating address:', postcode, huisnummer);
      try {
        await registerAddress(postcode.trim().toUpperCase(), huisnummer.trim());
        pendingDevice = {
          name: label.trim() || `${postcode} ${huisnummer}`,
          postcode: postcode.trim().toUpperCase(),
          huisnummer: huisnummer.trim(),
        };
        return { success: true };
      } catch (err) {
        this.error('Address validation failed:', err.message);
        return { success: false, error: err.message };
      }
    });

    session.setHandler('list_devices', async () => {
      if (!pendingDevice) return [];
      const id = `circulus-${pendingDevice.postcode}-${pendingDevice.huisnummer}`.toLowerCase();
      return [
        {
          name: pendingDevice.name,
          icon: '/icon.svg',
          data: { id },
          settings: {
            postcode: pendingDevice.postcode,
            huisnummer: pendingDevice.huisnummer,
            refresh_interval: '86400',
          },
        },
      ];
    });
  }
}

module.exports = AfvalAdresDriver;
