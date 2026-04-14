'use strict';

const { toDateString, getCollectionsForDate, formatTypesList } = require('../../lib/trashapi');

function getDevices(homey) {
  return homey.drivers.getDriver('afval-adres').getDevices();
}

function buildDays(calendar) {
  const today = new Date();
  const days  = [];

  for (let i = 0; i < 7; i++) {
    const d       = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = toDateString(d);
    const types   = getCollectionsForDate(calendar, dateStr);
    days.push({
      dateStr,
      dayLabel: i === 0 ? 'Vandaag' : i === 1 ? 'Morgen' : _dutchDayLabel(d),
      types,
      typesLabel: formatTypesList(types),
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
    const result = {};

    for (const device of getDevices(homey)) {
      const key      = device.getData().id;
      const calendar = device.getStoreValue('calendar') || {};
      result[key] = {
        deviceName: device.getName(),
        days: buildDays(calendar),
      };
    }

    return result;
  },
};

function _dutchDayLabel(date) {
  const days   = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}
