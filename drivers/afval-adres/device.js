'use strict';

const Homey = require('homey');
const {
  registerAddress,
  fetchCalendar,
  getCollectionsForDate,
  formatTypesList,
  toDateString,
} = require('../../lib/circulus-api');

class AfvalAdresDevice extends Homey.Device {

  async onInit() {
    this._refreshTimer  = null;
    this._midnightTimer = null;

    await this.refreshData();
    this._scheduleRefresh();
    this._scheduleMidnight();
  }

  async onSettings({ newSettings, changedKeys }) {
    if (changedKeys.includes('refresh_interval')) {
      this._scheduleRefresh(Number(newSettings.refresh_interval) * 1000);
    }
  }

  // --- Public (called by Flow action and internally) ---

  async refreshData() {
    const postcode   = this.getSetting('postcode');
    const huisnummer = this.getSetting('huisnummer');

    if (!postcode || !huisnummer) {
      this.error('Missing postcode or huisnummer setting');
      return;
    }

    try {
      const session  = await registerAddress(postcode, huisnummer);
      const calendar = await fetchCalendar(session, 7);

      await this.setStoreValue('calendar', calendar);
      await this._updateCapabilities(calendar);
      this.log(`Calendar refreshed for ${this.getName()}`);
    } catch (err) {
      this.error(`refreshData failed for ${this.getName()}: ${err.message}`);
    }
  }

  // --- Private ---

  async _updateCapabilities(calendar) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStr    = toDateString(new Date());
    const tomorrowStr = toDateString(tomorrow);

    const todayTypes    = getCollectionsForDate(calendar, todayStr);
    const tomorrowTypes = getCollectionsForDate(calendar, tomorrowStr);

    await this.setCapabilityValue('collection_today',          todayTypes.length > 0);
    await this.setCapabilityValue('collection_tomorrow',       tomorrowTypes.length > 0);
    await this.setCapabilityValue('collection_types_today',    formatTypesList(todayTypes));
    await this.setCapabilityValue('collection_types_tomorrow', formatTypesList(tomorrowTypes));

    if (todayTypes.length > 0) {
      await this.homey.flow.getDeviceTriggerCard('collection_today')
        .trigger(this, { types: formatTypesList(todayTypes) })
        .catch((err) => this.error('Trigger collection_today failed:', err.message));
    }

    if (tomorrowTypes.length > 0) {
      await this.homey.flow.getDeviceTriggerCard('collection_tomorrow')
        .trigger(this, { types: formatTypesList(tomorrowTypes) })
        .catch((err) => this.error('Trigger collection_tomorrow failed:', err.message));
    }
  }

  _scheduleRefresh(intervalMs) {
    if (this._refreshTimer) this.homey.clearTimeout(this._refreshTimer);
    const ms = intervalMs ?? Number(this.getSetting('refresh_interval') || 86400) * 1000;
    this._refreshTimer = this.homey.setTimeout(async () => {
      try {
        await this.refreshData();
      } catch (err) {
        this.error('Scheduled refresh failed:', err.message);
      }
      this._scheduleRefresh();
    }, ms);
  }

  _scheduleMidnight() {
    if (this._midnightTimer) this.homey.clearTimeout(this._midnightTimer);
    const now      = new Date();
    const midnight = new Date(now);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 1, 0, 0); // 00:01 next day

    this._midnightTimer = this.homey.setTimeout(async () => {
      const calendar = this.getStoreValue('calendar') || {};
      await this._updateCapabilities(calendar);
      this._scheduleMidnight();
    }, midnight - now);
  }

}

module.exports = AfvalAdresDevice;
