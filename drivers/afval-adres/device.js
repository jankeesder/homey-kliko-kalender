'use strict';

const Homey        = require('homey');
const circulusApi   = require('../../lib/circulus-api');
const afvalwijzerApi = require('../../lib/afvalwijzer-api');

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

  async refreshData() {
    const provider   = this.getSetting('provider') || 'circulus';
    const postcode   = this.getSetting('postcode');
    const huisnummer = this.getSetting('huisnummer');
    const toevoeging = this.getSetting('toevoeging') || '';

    if (!postcode || !huisnummer) {
      this.error('Missing postcode or huisnummer setting');
      return;
    }

    try {
      let calendar;
      if (provider === 'afvalwijzer') {
        calendar = await afvalwijzerApi.fetchCalendar(postcode, huisnummer, toevoeging, 7);
      } else {
        const session = await circulusApi.registerAddress(postcode, huisnummer);
        calendar = await circulusApi.fetchCalendar(session, 7);
      }
      await this.setStoreValue('calendar', calendar);
      await this._updateCapabilities(calendar, provider);
      this.log(`Calendar refreshed for ${this.getName()} (${provider})`);
    } catch (err) {
      this.error(`refreshData failed for ${this.getName()}: ${err.message}`);
    }
  }

  async _updateCapabilities(calendar, provider) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStr    = circulusApi.toDateString(new Date());
    const tomorrowStr = circulusApi.toDateString(tomorrow);

    const todayTypes    = circulusApi.getCollectionsForDate(calendar, todayStr);
    const tomorrowTypes = circulusApi.getCollectionsForDate(calendar, tomorrowStr);

    const fmt = provider === 'afvalwijzer' ? afvalwijzerApi.formatTypesList : circulusApi.formatTypesList;

    await this.setCapabilityValue('collection_today',          todayTypes.length > 0);
    await this.setCapabilityValue('collection_tomorrow',       tomorrowTypes.length > 0);
    await this.setCapabilityValue('collection_types_today',    fmt(todayTypes));
    await this.setCapabilityValue('collection_types_tomorrow', fmt(tomorrowTypes));

    if (todayTypes.length > 0) {
      await this.homey.flow.getDeviceTriggerCard('collection_today')
        .trigger(this, { types: fmt(todayTypes) })
        .catch((err) => this.error('Trigger collection_today failed:', err.message));
    }

    if (tomorrowTypes.length > 0) {
      await this.homey.flow.getDeviceTriggerCard('collection_tomorrow')
        .trigger(this, { types: fmt(tomorrowTypes) })
        .catch((err) => this.error('Trigger collection_tomorrow failed:', err.message));
    }
  }

  _scheduleRefresh(intervalMs) {
    if (this._refreshTimer) this.homey.clearTimeout(this._refreshTimer);
    const ms = intervalMs ?? Number(this.getSetting('refresh_interval') || 86400) * 1000;
    this._refreshTimer = this.homey.setTimeout(async () => {
      try { await this.refreshData(); } catch (err) { this.error('Scheduled refresh failed:', err.message); }
      this._scheduleRefresh();
    }, ms);
  }

  _scheduleMidnight() {
    if (this._midnightTimer) this.homey.clearTimeout(this._midnightTimer);
    const now      = new Date();
    const midnight = new Date(now);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 1, 0, 0);

    this._midnightTimer = this.homey.setTimeout(async () => {
      const calendar = this.getStoreValue('calendar') || {};
      const provider = this.getSetting('provider') || 'circulus';
      await this._updateCapabilities(calendar, provider);
      this._scheduleMidnight();
    }, midnight - now);
  }

}

module.exports = AfvalAdresDevice;
