'use strict';

const Homey    = require('homey');
const trashApi = require('./lib/trashapi');

// Map legacy waste type codes (v1.0.3 Circulus, v1.0.4 Burgerportaal)
// to the TrashAPI names used from v1.0.5 onward.
// This keeps existing Flows working after the upgrade.
const LEGACY_CODE_MAP = {
  // Circulus (v1.0.3)
  GFT:       'Gft',
  REST:      'Restafval',
  PAP:       'Papier',
  PMD:       'Pbd',
  // Burgerportaal/Groningen (v1.0.4)
  RESTAFVAL: 'Restafval',
  PAPIER:    'Papier',
  KCA:       'Kca',
  OPK:       'Papier',
};

function normalizeType(type) {
  return LEGACY_CODE_MAP[type] ?? type;
}

class AfvalContainerApp extends Homey.App {
  async onInit() {
    this.log('AfvalContainerkalender app initialized');

    this.homey.flow.getConditionCard('collection_type_today')
      .registerRunListener(async ({ device, type }) => {
        const types = device.getStoreValue('calendar')?.[trashApi.toDateString(new Date())] || [];
        return types.includes(normalizeType(type));
      });

    this.homey.flow.getConditionCard('collection_type_tomorrow')
      .registerRunListener(async ({ device, type }) => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const types = device.getStoreValue('calendar')?.[trashApi.toDateString(tomorrow)] || [];
        return types.includes(normalizeType(type));
      });

    this.homey.flow.getActionCard('refresh_calendar')
      .registerRunListener(async ({ device }) => {
        await device.refreshData();
      });
  }
}

module.exports = AfvalContainerApp;
