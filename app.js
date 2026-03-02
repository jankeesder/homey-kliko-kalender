'use strict';

const Homey = require('homey');
const { toDateString } = require('./lib/circulus-api');

class AfvalContainerApp extends Homey.App {
  async onInit() {
    this.log('AfvalContainerkalender app initialized');

    this.homey.flow.getConditionCard('collection_type_today')
      .registerRunListener(async ({ device, type }) => {
        const types = device.getStoreValue('calendar')?.[toDateString(new Date())] || [];
        return types.includes(type);
      });

    this.homey.flow.getConditionCard('collection_type_tomorrow')
      .registerRunListener(async ({ device, type }) => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const types = device.getStoreValue('calendar')?.[toDateString(tomorrow)] || [];
        return types.includes(type);
      });

    this.homey.flow.getActionCard('refresh_calendar')
      .registerRunListener(async ({ device }) => {
        await device.refreshData();
      });
  }
}

module.exports = AfvalContainerApp;
