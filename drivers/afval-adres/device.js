'use strict';

const Homey    = require('homey');
const trashApi = require('../../lib/trashapi');
const { localDateString, msUntilNextLocalTime } = require('../../lib/localtime');

class AfvalAdresDevice extends Homey.Device {

  async onInit() {
    this._refreshTimer  = null;
    this._midnightTimer = null;

    await this.refreshData();
    this._scheduleRefresh();
    this._scheduleMidnight();
  }

  async onUninit() {
    if (this._refreshTimer)  this.homey.clearTimeout(this._refreshTimer);
    if (this._midnightTimer) this.homey.clearTimeout(this._midnightTimer);
  }

  async onSettings({ newSettings, changedKeys }) {
    if (changedKeys.some((k) => ['postcode', 'huisnummer', 'toevoeging'].includes(k))) {
      await this.refreshData();
    }
    if (changedKeys.includes('refresh_interval')) {
      this._scheduleRefresh(Number(newSettings.refresh_interval) * 1000);
    }
  }

  async refreshData() {
    const postcode   = this.getSetting('postcode');
    const huisnummer = this.getSetting('huisnummer');
    const toevoeging = this.getSetting('toevoeging') || '';

    if (!postcode || !huisnummer) {
      this.error('Missing postcode or huisnummer setting');
      return;
    }

    try {
      const calendar = await trashApi.fetchCalendar(postcode, huisnummer, toevoeging, 7);
      await this.setStoreValue('calendar', calendar);
      await this._updateCapabilities(calendar, false);
      await this.unsetWarning().catch(this.error);
      this.log(`Calendar refreshed for ${this.getName()}`);
    } catch (err) {
      this.error(`refreshData failed for ${this.getName()}: ${err.message}`);
      await this.setWarning(this.homey.__('warnings.refresh_failed', { error: err.message })).catch(this.error);
    }
  }

  async _updateCapabilities(calendar, fireTriggers) {
    const tz          = this.homey.clock.getTimezone();
    const todayStr    = localDateString(tz, 0);
    const tomorrowStr = localDateString(tz, 1);

    const todayTypes    = trashApi.getCollectionsForDate(calendar, todayStr);
    const tomorrowTypes = trashApi.getCollectionsForDate(calendar, tomorrowStr);

    await this.setCapabilityValue('collection_today',          todayTypes.length > 0);
    await this.setCapabilityValue('collection_tomorrow',       tomorrowTypes.length > 0);
    await this.setCapabilityValue('collection_types_today',    trashApi.formatTypesShort(todayTypes));
    await this.setCapabilityValue('collection_types_tomorrow', trashApi.formatTypesShort(tomorrowTypes));

    if (!fireTriggers) return;

    if (todayTypes.length > 0) {
      await this.homey.flow.getDeviceTriggerCard('collection_today')
        .trigger(this, { types: trashApi.formatTypesList(todayTypes) })
        .catch((err) => this.error('Trigger collection_today failed:', err.message));
    }

    if (tomorrowTypes.length > 0) {
      await this.homey.flow.getDeviceTriggerCard('collection_tomorrow')
        .trigger(this, { types: trashApi.formatTypesList(tomorrowTypes) })
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
    // 00:01 lokale tijd (Homey-apps draaien in UTC)
    const ms = msUntilNextLocalTime(this.homey.clock.getTimezone(), 0, 1);

    this._midnightTimer = this.homey.setTimeout(async () => {
      try {
        const calendar = this.getStoreValue('calendar') || {};
        await this._updateCapabilities(calendar, true);
      } catch (err) {
        this.error('Midnight update failed:', err.message);
      } finally {
        this._scheduleMidnight();
      }
    }, ms);
  }

}

module.exports = AfvalAdresDevice;
