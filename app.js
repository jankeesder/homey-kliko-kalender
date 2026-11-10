'use strict';

const Homey    = require('homey');
const { localDateString } = require('./lib/localtime');

// Maps Flow dropdown IDs to the TrashAPI names used internally.
// Stable codes (GFT, REST, PAP, PMD, KCA) are the current dropdown IDs;
// the legacy codes from v1.0.4 and v1.0.5 keep existing Flows working.
const LEGACY_CODE_MAP = {
  // Current dropdown IDs (v1.0.6+)
  GFT:       'Gft',
  REST:      'Restafval',
  PAP:       'Papier',
  PMD:       'Pbd',
  KCA:       'Kca',
  // Intermediate codes from v1.0.5 dropdown (Title-case TrashAPI names)
  Gft:       'Gft',
  Restafval: 'Restafval',
  Papier:    'Papier',
  Pbd:       'Pbd',
  Kca:       'Kca',
  // Burgerportaal codes from v1.0.4
  RESTAFVAL: 'Restafval',
  PAPIER:    'Papier',
  OPK:       'Papier',
};

function normalizeType(type) {
  return LEGACY_CODE_MAP[type] ?? type;
}

class AfvalContainerApp extends Homey.App {
  async onInit() {
    this.log('Kliko Kalender app initialized');

    this.homey.flow.getConditionCard('collection_type_today')
      .registerRunListener(async ({ device, type }) => {
        const today = localDateString(this.homey.clock.getTimezone(), 0);
        const types = device.getStoreValue('calendar')?.[today] || [];
        return types.includes(normalizeType(type));
      });

    this.homey.flow.getConditionCard('collection_type_tomorrow')
      .registerRunListener(async ({ device, type }) => {
        const tomorrow = localDateString(this.homey.clock.getTimezone(), 1);
        const types = device.getStoreValue('calendar')?.[tomorrow] || [];
        return types.includes(normalizeType(type));
      });

    this.homey.flow.getActionCard('refresh_calendar')
      .registerRunListener(async ({ device }) => {
        await device.refreshData();
      });
  }
}

module.exports = AfvalContainerApp;
