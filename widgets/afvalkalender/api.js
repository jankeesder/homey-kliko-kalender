'use strict';

const { getCollectionsForDate } = require('../../lib/trashapi');
const { localDateString }       = require('../../lib/localtime');

function getDevices(homey) {
  return homey.drivers.getDriver('afval-adres').getDevices();
}

function buildDays(calendar, timeZone) {
  const days = [];

  for (let i = 0; i < 7; i++) {
    const dateStr = localDateString(timeZone, i);
    const types   = getCollectionsForDate(calendar, dateStr);
    days.push({
      dateStr,
      dayLabel: i === 0 ? 'Vandaag' : i === 1 ? 'Morgen' : _dutchDayLabel(dateStr),
      types,
      hasCollection: types.length > 0,
    });
  }

  return days;
}

module.exports = {
  async getDevices({ homey }) {
    return getDevices(homey).map((d) => ({
      id:   d.getData().id,
      name: d.getName(),
    }));
  },

  async getCalendar({ homey }) {
    const result   = {};
    const timeZone = homey.clock.getTimezone();

    for (const device of getDevices(homey)) {
      const key      = device.getData().id;
      const calendar = device.getStoreValue('calendar') || {};
      result[key] = {
        deviceName: device.getName(),
        days: buildDays(calendar, timeZone),
      };
    }

    return result;
  },
};

function _dutchDayLabel(dateStr) {
  const date   = new Date(`${dateStr}T12:00:00Z`);
  const days   = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${days[date.getUTCDay()]} ${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
}
