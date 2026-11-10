'use strict';

/**
 * Lokale-tijdhulpjes. Homey-apps (SDK v3) draaien altijd in UTC, dus `new Date().getDate()` e.d.
 * geven UTC-waarden. Deze helpers rekenen in de tijdzone van de Homey (this.homey.clock.getTimezone()).
 */

const _formatters = new Map();

function _formatter(timeZone) {
  const tz = timeZone || 'UTC';
  if (!_formatters.has(tz)) {
    _formatters.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return _formatters.get(tz);
}

/** Lokale kalender- en kloktijd van een moment: { year, month, day, hour, minute, second }. */
function _localParts(timeZone, date) {
  const parts = {};
  for (const { type, value } of _formatter(timeZone).formatToParts(date)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return parts;
}

/** Lokale wandkloktijd van een moment, uitgedrukt als "UTC-milliseconden" (zonder seconden-fracties). */
function _wallMs(timeZone, date) {
  const p = _localParts(timeZone, date);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** Lokale datum als 'YYYY-MM-DD', `offsetDays` dagen na `now`. */
function localDateString(timeZone, offsetDays = 0, now = new Date()) {
  const p = _localParts(timeZone, now);
  return new Date(Date.UTC(p.year, p.month - 1, p.day + offsetDays)).toISOString().slice(0, 10);
}

/** Milliseconden tot het eerstvolgende moment waarop de lokale klok hour:minute aangeeft. */
function msUntilNextLocalTime(timeZone, hour, minute, now = new Date()) {
  const p = _localParts(timeZone, now);
  const passed = p.hour > hour || (p.hour === hour && p.minute >= minute);
  const wall = Date.UTC(p.year, p.month - 1, p.day + (passed ? 1 : 0), hour, minute, 0);

  // Zet de lokale wandkloktijd om naar een UTC-moment; twee stappen vangen een DST-overgang op.
  const offsetNow = _wallMs(timeZone, now) - Math.floor(now.getTime() / 1000) * 1000;
  let target = wall - offsetNow;
  const offsetTarget = _wallMs(timeZone, new Date(target)) - target;
  target = wall - offsetTarget;

  return target - now.getTime();
}

module.exports = { localDateString, msUntilNextLocalTime };
