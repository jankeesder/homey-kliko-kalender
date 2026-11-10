'use strict';

const { getCollectionsForDate } = require('../../lib/trashapi');
const { localDateString }       = require('../../lib/localtime');

function getDevices(homey) {
  return homey.drivers.getDriver('afval-adres').getDevices();
}

const DAY_NAMES = {
  en: { days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
  nl: { days: ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'], months: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'] },
};

function buildDays(homey, calendar, timeZone) {
  const names = DAY_NAMES[homey.i18n.getLanguage()] || DAY_NAMES.en;
  const days = [];

  for (let i = 0; i < 7; i++) {
    const dateStr = localDateString(timeZone, i);
    const types   = getCollectionsForDate(calendar, dateStr);
    days.push({
      dateStr,
      dayLabel: i === 0 ? homey.__('widget.today') : i === 1 ? homey.__('widget.tomorrow') : _dayLabel(dateStr, names),
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
        days: buildDays(homey, calendar, timeZone),
      };
    }

    return result;
  },
};

function _dayLabel(dateStr, { days, months }) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  return `${days[date.getUTCDay()]} ${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
}
