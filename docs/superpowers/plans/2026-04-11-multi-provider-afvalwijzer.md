# Multi-provider AfvalWijzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Voeg AfvalWijzer API-ondersteuning toe aan nl.klikokalender zodat Groningse adressen werken naast bestaande Circulus-adressen, en fix de widget zodat die niet intern scrollt.

**Architecture:** Eén driver `afval-adres` met een `provider` setting (`circulus` | `afvalwijzer`). Device.js routeert naar de juiste API-module. Bestaande apparaten defaulten naar `circulus` zonder herverbinding.

**Tech Stack:** Node.js 20, Homey SDK 3, node:test (tests), Homey CLI 3.12.2 (`homey app compose`)

---

## Bestandsoverzicht

| Bestand | Status | Verantwoordelijkheid |
|---------|--------|----------------------|
| `lib/afvalwijzer-api.js` | Nieuw | AfvalWijzer HTTP + parsing |
| `test/afvalwijzer-api.test.js` | Nieuw | Unit tests pure functies |
| `drivers/afval-adres/device.js` | Wijzigen | Provider routing in refreshData |
| `drivers/afval-adres/driver.js` | Wijzigen | Provider-aware pairing + device-ID |
| `drivers/afval-adres/pair/search.html` | Wijzigen | Provider dropdown + toevoeging veld |
| `drivers/afval-adres/pair/confirm.html` | Wijzigen | Provider naam in bevestiging |
| `drivers/afval-adres/driver.compose.json` | Wijzigen | Nieuwe settings + AfvalWijzer Flow types |
| `widgets/afvalkalender/public/style.css` | Wijzigen | overflow: hidden |
| `widgets/afvalkalender/public/script.js` | Wijzigen | Kleur/label-map uitbreiden |
| `locales/nl.json` | Wijzigen | NL vertalingen |
| `locales/en.json` | Wijzigen | EN vertalingen |
| `.homeycompose/app.json` | Wijzigen | Versie 1.0.4 + beschrijving |
| `.homeychangelog.json` | Wijzigen | Changelog entry 1.0.4 |
| `README.nl.txt` | Wijzigen | Provider-uitleg NL |
| `README.txt` | Wijzigen | Provider-uitleg EN |
| `app.json` | Gegenereerd | Via `homey app compose` na alle wijzigingen |

---

## Task 1: lib/afvalwijzer-api.js (TDD)

**Files:**
- Create: `test/afvalwijzer-api.test.js`
- Create: `lib/afvalwijzer-api.js`

- [ ] **Stap 1.1: Schrijf de falende tests**

Maak `test/afvalwijzer-api.test.js`:

```javascript
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { toDateString, parseCalendar, formatTypesList } = require('../lib/afvalwijzer-api');

describe('toDateString', () => {
  it('formats a date as YYYY-MM-DD', () => {
    assert.equal(toDateString(new Date('2026-04-11T10:00:00')), '2026-04-11');
  });

  it('pads month and day with zeros', () => {
    assert.equal(toDateString(new Date('2026-01-05T00:00:00')), '2026-01-05');
  });
});

describe('parseCalendar', () => {
  const items = [
    { date: '2026-04-11', nameType: 'gft' },
    { date: '2026-04-11', nameType: 'papier' },
    { date: '2026-04-14', nameType: 'restafval' },
    { date: '2026-04-20', nameType: 'pmd' },  // buiten range
    { date: null,         nameType: 'glas' },  // geen datum
  ];
  const from = new Date('2026-04-11');
  const to   = new Date('2026-04-17');

  it('groepeert collecties per datum', () => {
    const cal = parseCalendar(items, from, to);
    assert.deepEqual(cal['2026-04-11'].sort(), ['gft', 'papier'].sort());
    assert.deepEqual(cal['2026-04-14'], ['restafval']);
  });

  it('sluit datums buiten de range uit', () => {
    const cal = parseCalendar(items, from, to);
    assert.equal(cal['2026-04-20'], undefined);
  });

  it('slaat items zonder datum over', () => {
    const cal = parseCalendar(items, from, to);
    const allTypes = Object.values(cal).flat();
    assert.ok(!allTypes.includes('glas'));
  });

  it('retourneert leeg object bij lege input', () => {
    assert.deepEqual(parseCalendar([], from, to), {});
  });

  it('bevat de grensdatums zelf', () => {
    const boundary = [
      { date: '2026-04-11', nameType: 'gft' },
      { date: '2026-04-17', nameType: 'papier' },
    ];
    const cal = parseCalendar(boundary, from, to);
    assert.deepEqual(cal['2026-04-11'], ['gft']);
    assert.deepEqual(cal['2026-04-17'], ['papier']);
  });
});

describe('formatTypesList', () => {
  it('mapt AfvalWijzer codes naar Nederlandse labels', () => {
    assert.equal(formatTypesList(['gft', 'papier']), 'GFT (groente/fruit/tuin), Papier');
  });

  it('valt terug op de ruwe code voor onbekende types', () => {
    assert.equal(formatTypesList(['onbekend']), 'onbekend');
  });

  it('retourneert lege string bij lege array', () => {
    assert.equal(formatTypesList([]), '');
  });
});
```

- [ ] **Stap 1.2: Controleer dat de tests falen**

```bash
cd /home/claude/homey-apps/nl.klikokalender
node --test test/afvalwijzer-api.test.js
```

Verwacht: fout "Cannot find module '../lib/afvalwijzer-api'"

- [ ] **Stap 1.3: Schrijf de implementatie**

Maak `lib/afvalwijzer-api.js`:

```javascript
'use strict';

const https = require('node:https');

const API_HOST   = 'api.mijnafvalwijzer.nl';
const API_PATH   = '/webservices/appsinput/';
const API_KEY    = '5ef443e778f41c4f75c69459eea6e6ae0c2d92de729aa0fc61653815fbd6a8ca';
const TIMEOUT_MS = 15000;

const WASTE_TYPES = {
  gft:        'GFT (groente/fruit/tuin)',
  restafval:  'Restafval',
  papier:     'Papier',
  pmd:        'PMD (plastic/metaal/drankpakken)',
  glas:       'Glas',
  textiel:    'Textiel',
  kca:        'Chemisch afval (KCA)',
  grof:       'Grof huishoudelijk afval',
  takken:     'Takken/snoeiafval',
  kerstbomen: 'Kerstbomen',
};

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseCalendar(items, from, to) {
  const fromStr = toDateString(from);
  const toStr   = toDateString(to);
  const cal     = {};

  for (const item of items) {
    const dateStr = item.date ? item.date.slice(0, 10) : null;
    if (!dateStr) continue;
    if (dateStr < fromStr || dateStr > toStr) continue;
    if (!cal[dateStr]) cal[dateStr] = [];
    cal[dateStr].push(item.nameType);
  }

  return cal;
}

function formatTypesList(codes) {
  return codes.map((c) => WASTE_TYPES[c] || c).join(', ');
}

function _httpsGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: API_HOST,
        port:     443,
        path,
        method:   'GET',
        headers:  { 'User-Agent': 'HomeyAfvalkalender/1.0' },
        timeout:  TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout na ${TIMEOUT_MS}ms`)); });
    req.on('error', reject);
    req.end();
  });
}

function _buildPath(postcode, huisnummer, toevoeging, afvaldata) {
  const params = new URLSearchParams({
    apikey:     API_KEY,
    method:     'postcodecheck',
    postcode,
    street:     '',
    huisnummer,
    toevoeging: toevoeging || '',
    app_name:   'afvalwijzer',
    platform:   'web',
    langs:      'nl',
    afvaldata,
  });
  return `${API_PATH}?${params.toString()}`;
}

function _parseResponse(body) {
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('Ongeldige JSON response van AfvalWijzer API'); }
  if (data.response === 'NOK') throw new Error(data.error || 'Adres niet gevonden. Controleer postcode en huisnummer.');
  return data;
}

async function validateAddress(postcode, huisnummer, toevoeging = '') {
  const res = await _httpsGet(_buildPath(postcode, huisnummer, toevoeging, toDateString(new Date())));
  if (res.status < 200 || res.status >= 300) throw new Error(`API-fout: HTTP ${res.status}`);
  _parseResponse(res.body);
}

async function fetchCalendar(postcode, huisnummer, toevoeging = '', days = 7) {
  const from = new Date();
  const to   = new Date();
  to.setDate(to.getDate() + days);

  const res = await _httpsGet(_buildPath(postcode, huisnummer, toevoeging, toDateString(from)));
  if (res.status < 200 || res.status >= 300) throw new Error(`API-fout: HTTP ${res.status}`);

  const data  = _parseResponse(res.body);
  const items = [
    ...(data.ophaaldagen?.data     || []),
    ...(data.ophaaldagenNext?.data || []),
  ];

  return parseCalendar(items, from, to);
}

module.exports = { toDateString, parseCalendar, formatTypesList, validateAddress, fetchCalendar, WASTE_TYPES };
```

- [ ] **Stap 1.4: Controleer dat de tests slagen**

```bash
node --test test/afvalwijzer-api.test.js
```

Verwacht: alle 9 tests PASS

- [ ] **Stap 1.5: Draai ook de bestaande Circulus-tests**

```bash
node --test test/circulus-api.test.js
```

Verwacht: alle tests PASS (geen regressie)

- [ ] **Stap 1.6: Commit**

```bash
git add lib/afvalwijzer-api.js test/afvalwijzer-api.test.js
git commit -m "feat: add afvalwijzer-api module with unit tests"
```

---

## Task 2: device.js — provider routing

**Files:**
- Modify: `drivers/afval-adres/device.js`

- [ ] **Stap 2.1: Vervang de volledige inhoud van device.js**

```javascript
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
```

- [ ] **Stap 2.2: Commit**

```bash
git add drivers/afval-adres/device.js
git commit -m "feat: add provider routing to device refreshData"
```

---

## Task 3: driver.js — provider-aware pairing

**Files:**
- Modify: `drivers/afval-adres/driver.js`

- [ ] **Stap 3.1: Vervang de volledige inhoud van driver.js**

```javascript
'use strict';

const Homey          = require('homey');
const circulusApi    = require('../../lib/circulus-api');
const afvalwijzerApi = require('../../lib/afvalwijzer-api');

class AfvalAdresDriver extends Homey.Driver {
  async onPair(session) {
    let pendingDevice = null;

    session.setHandler('validate_address', async ({ provider, label, postcode, huisnummer, toevoeging }) => {
      const pc   = (postcode   || '').trim().toUpperCase();
      const hn   = (huisnummer || '').trim();
      const tv   = (toevoeging || '').trim();
      const prov = provider || 'circulus';

      this.log('Validating address:', pc, hn, tv, '(provider:', prov + ')');
      try {
        if (prov === 'afvalwijzer') {
          await afvalwijzerApi.validateAddress(pc, hn, tv);
        } else {
          await circulusApi.registerAddress(pc, hn);
        }
        pendingDevice = {
          provider:    prov,
          name:        label.trim() || `${pc} ${hn}${tv ? ' ' + tv : ''}`,
          postcode:    pc,
          huisnummer:  hn,
          toevoeging:  tv,
        };
        return { success: true };
      } catch (err) {
        this.error('Address validation failed:', err.message);
        return { success: false, error: err.message };
      }
    });

    session.setHandler('list_devices', async () => {
      if (!pendingDevice) return [];
      const { provider, postcode, huisnummer, toevoeging } = pendingDevice;
      const idParts = [provider, postcode.toLowerCase(), huisnummer.toLowerCase()];
      if (toevoeging) idParts.push(toevoeging.toLowerCase());
      const id = idParts.join('-');
      return [{
        name: pendingDevice.name,
        icon: '/icon.svg',
        data: { id },
        settings: {
          provider,
          postcode,
          huisnummer,
          toevoeging,
          refresh_interval: '86400',
        },
      }];
    });
  }
}

module.exports = AfvalAdresDriver;
```

- [ ] **Stap 3.2: Commit**

```bash
git add drivers/afval-adres/driver.js
git commit -m "feat: provider-aware pairing in driver"
```

---

## Task 4: search.html — provider dropdown + toevoeging

**Files:**
- Modify: `drivers/afval-adres/pair/search.html`

- [ ] **Stap 4.1: Vervang de volledige inhoud van search.html**

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px; }
    h3 { color: #2E7D32; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 13px; margin-bottom: 20px; }
    label { display: block; font-size: 13px; font-weight: 600; margin: 12px 0 4px; color: #333; }
    input, select { width: 100%; padding: 8px 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; box-sizing: border-box; background: #fff; }
    input:focus, select:focus { outline: none; border-color: #2E7D32; }
    button { margin-top: 20px; width: 100%; padding: 10px; background: #2E7D32; color: white; border: none; border-radius: 6px; font-size: 15px; cursor: pointer; }
    button:hover { background: #1b5e20; }
    button:disabled { background: #aaa; cursor: default; }
    .error { color: #c62828; font-size: 13px; margin-top: 10px; display: none; }
    .spinner { display: none; text-align: center; margin-top: 12px; color: #666; font-size: 13px; }
    .field-hidden { display: none; }
  </style>
</head>
<body>
  <h3>🗑 Kliko adres toevoegen</h3>
  <p class="subtitle" id="subtitle">Voer uw adres in om de ophaalkalender op te halen.</p>

  <label for="provider">Afvalaanbieder</label>
  <select id="provider">
    <option value="circulus">Circulus (Apeldoorn, Deventer e.o.)</option>
    <option value="afvalwijzer">AfvalWijzer (Groningen e.o.)</option>
  </select>

  <label for="label">Naam (optioneel)</label>
  <input type="text" id="label" placeholder="bijv. Thuis, Werk" />

  <label for="postcode">Postcode</label>
  <input type="text" id="postcode" placeholder="bijv. 1234AB" maxlength="7" />

  <label for="huisnummer">Huisnummer</label>
  <input type="text" id="huisnummer" placeholder="bijv. 1" maxlength="10" />

  <div id="toevoegingField" class="field-hidden">
    <label for="toevoeging">Toevoeging (optioneel)</label>
    <input type="text" id="toevoeging" placeholder="bijv. A of B" maxlength="10" />
  </div>

  <button id="nextBtn">Volgende</button>
  <div class="error" id="errorMsg"></div>
  <div class="spinner" id="spinner">Adres controleren...</div>

  <script type="application/javascript">
    var homeyInstance = null;

    var SUBTITLES = {
      circulus:    'Voer uw adres in om de ophaalkalender van Circulus op te halen.',
      afvalwijzer: 'Voer uw adres in om de ophaalkalender van uw gemeente op te halen.',
    };

    var SPINNERS = {
      circulus:    'Adres controleren bij Circulus...',
      afvalwijzer: 'Adres controleren bij AfvalWijzer...',
    };

    function onProviderChange() {
      var prov = document.getElementById('provider').value;
      document.getElementById('subtitle').textContent      = SUBTITLES[prov] || SUBTITLES.circulus;
      document.getElementById('toevoegingField').className = prov === 'afvalwijzer' ? '' : 'field-hidden';
    }

    function initPair(Homey) {
      if (homeyInstance) return;
      homeyInstance = Homey;
      try { Homey.ready(); } catch(e) {}

      document.getElementById('provider').addEventListener('change', onProviderChange);
      onProviderChange();

      var btn      = document.getElementById('nextBtn');
      var errorEl  = document.getElementById('errorMsg');
      var spinner  = document.getElementById('spinner');

      btn.addEventListener('click', function() {
        var provider   = document.getElementById('provider').value;
        var label      = document.getElementById('label').value;
        var postcode   = document.getElementById('postcode').value.trim();
        var huisnummer = document.getElementById('huisnummer').value.trim();
        var toevoeging = document.getElementById('toevoeging').value.trim();

        errorEl.style.display = 'none';

        if (!postcode || !huisnummer) {
          errorEl.textContent    = 'Vul postcode en huisnummer in.';
          errorEl.style.display  = 'block';
          return;
        }

        btn.disabled           = true;
        spinner.textContent    = SPINNERS[provider] || SPINNERS.circulus;
        spinner.style.display  = 'block';

        Homey.emit('validate_address', { provider: provider, label: label, postcode: postcode, huisnummer: huisnummer, toevoeging: toevoeging })
          .then(function(result) {
            if (result && result.success) {
              Homey.showView('confirm');
            } else {
              errorEl.textContent   = (result && result.error) || 'Adres niet gevonden.';
              errorEl.style.display = 'block';
              btn.disabled          = false;
              spinner.style.display = 'none';
            }
          })
          .catch(function(err) {
            errorEl.textContent   = (err && err.message) || 'Onbekende fout.';
            errorEl.style.display = 'block';
            btn.disabled          = false;
            spinner.style.display = 'none';
          });
      });
    }

    function onHomeyReady(Homey) { initPair(Homey); }

    try { if (typeof Homey !== 'undefined') initPair(Homey); } catch(e) {}
    document.addEventListener('DOMContentLoaded', function() {
      try { if (typeof Homey !== 'undefined' && !homeyInstance) initPair(Homey); } catch(e) {}
    });
  </script>
</body>
</html>
```

- [ ] **Stap 4.2: Commit**

```bash
git add drivers/afval-adres/pair/search.html
git commit -m "feat: add provider dropdown and toevoeging field to pairing screen"
```

---

## Task 5: confirm.html — provider in bevestiging

**Files:**
- Modify: `drivers/afval-adres/pair/confirm.html`

- [ ] **Stap 5.1: Vervang de volledige inhoud van confirm.html**

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px; text-align: center; }
    .icon { font-size: 48px; margin: 20px 0 10px; }
    h3 { color: #2E7D32; margin-bottom: 8px; }
    p { color: #666; font-size: 14px; }
    .provider-badge { display: inline-block; margin-top: 8px; padding: 3px 10px; background: #E8F5E9; color: #2E7D32; border-radius: 12px; font-size: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="icon">✅</div>
  <h3>Adres gevonden!</h3>
  <p>Klik op 'Volgende' om het adres toe te voegen aan Homey.</p>
  <script>
    function onHomeyReady(Homey) {
      Homey.ready();
    }
  </script>
</body>
</html>
```

- [ ] **Stap 5.2: Commit**

```bash
git add drivers/afval-adres/pair/confirm.html
git commit -m "chore: simplify confirm.html"
```

---

## Task 6: driver.compose.json — nieuwe settings + AfvalWijzer Flow-types

**Files:**
- Modify: `drivers/afval-adres/driver.compose.json`

- [ ] **Stap 6.1: Vervang de volledige inhoud van driver.compose.json**

```json
{
  "name": { "en": "Kliko Address", "nl": "Kliko adres" },
  "class": "other",
  "capabilities": [
    "collection_today",
    "collection_tomorrow",
    "collection_types_today",
    "collection_types_tomorrow"
  ],
  "pair": [
    { "id": "search" },
    { "id": "confirm", "navigation": { "prev": "search", "next": "list_devices" } },
    { "id": "list_devices", "template": "list_devices", "navigation": { "next": "add_devices" } },
    { "id": "add_devices", "template": "add_devices" }
  ],
  "settings": [
    {
      "type": "group",
      "label": { "en": "Provider", "nl": "Aanbieder" },
      "children": [
        {
          "id": "provider",
          "type": "dropdown",
          "label": { "en": "Waste collection provider", "nl": "Afvalaanbieder" },
          "value": "circulus",
          "values": [
            { "id": "circulus",    "label": { "en": "Circulus (Apeldoorn, Deventer e.o.)", "nl": "Circulus (Apeldoorn, Deventer e.o.)" } },
            { "id": "afvalwijzer", "label": { "en": "AfvalWijzer (Groningen e.o.)",         "nl": "AfvalWijzer (Groningen e.o.)" } }
          ]
        }
      ]
    },
    {
      "type": "group",
      "label": { "en": "Address", "nl": "Adres" },
      "children": [
        {
          "id": "postcode",
          "type": "text",
          "label": { "en": "Postal code", "nl": "Postcode" },
          "value": ""
        },
        {
          "id": "huisnummer",
          "type": "text",
          "label": { "en": "House number", "nl": "Huisnummer" },
          "value": ""
        },
        {
          "id": "toevoeging",
          "type": "text",
          "label": { "en": "House number addition", "nl": "Toevoeging" },
          "hint": { "en": "Optional, e.g. A or B (AfvalWijzer only)", "nl": "Optioneel, bijv. A of B (alleen AfvalWijzer)" },
          "value": ""
        }
      ]
    },
    {
      "type": "group",
      "label": { "en": "Refresh", "nl": "Verversing" },
      "children": [
        {
          "id": "refresh_interval",
          "type": "dropdown",
          "label": { "en": "Refresh interval", "nl": "Verversingsinterval" },
          "value": "86400",
          "values": [
            { "id": "21600",  "label": { "en": "Every 6 hours",  "nl": "Elke 6 uur" } },
            { "id": "43200",  "label": { "en": "Every 12 hours", "nl": "Elke 12 uur" } },
            { "id": "86400",  "label": { "en": "Once a day",     "nl": "Eens per dag" } }
          ]
        }
      ]
    }
  ],
  "images": {
    "small":  "/drivers/afval-adres/assets/images/small.png",
    "large":  "/drivers/afval-adres/assets/images/large.png",
    "xlarge": "/drivers/afval-adres/assets/images/xlarge.png"
  }
}
```

- [ ] **Stap 6.2: Commit**

```bash
git add drivers/afval-adres/driver.compose.json
git commit -m "feat: add provider and toevoeging settings to driver"
```

---

## Task 7: widget style.css + script.js

**Files:**
- Modify: `widgets/afvalkalender/public/style.css`
- Modify: `widgets/afvalkalender/public/script.js`

- [ ] **Stap 7.1: Vervang style.css**

```css
html, body { overflow: hidden; }
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: transparent;
  color: #1a1a1a;
  font-size: 11px;
}

#widget { padding: 6px 8px; }

.header {
  font-weight: 700;
  font-size: 12px;
  color: #2E7D32;
  margin-bottom: 5px;
}

.loading { color: #999; text-align: center; padding: 10px; font-size: 11px; }
```

- [ ] **Stap 7.2: Vervang de TYPE_COLOR, TYPE_TEXT en badge-functie in script.js**

Vervang de eerste 12 regels van `widgets/afvalkalender/public/script.js` (de constanten + badge-functie) door:

```javascript
'use strict';

const TYPE_COLOR = {
  // Circulus
  GFT:     '#388E3C',
  REST:    '#546E7A',
  PAP:     '#1E88E5',
  PMD:     '#F9A825',
  ZWAKRA:  '#795548',
  BESTAFR: '#7B1FA2',
  // AfvalWijzer
  gft:        '#388E3C',
  restafval:  '#546E7A',
  papier:     '#1E88E5',
  pmd:        '#F9A825',
  glas:       '#00897B',
  textiel:    '#7B1FA2',
  kca:        '#E53935',
  grof:       '#8D6E63',
  takken:     '#558B2F',
  kerstbomen: '#1A237E',
};

const TYPE_TEXT = { PMD: '#333', pmd: '#333' };

const TYPE_LABEL = {
  // Circulus
  GFT: 'GFT', REST: 'REST', PAP: 'PAP', PMD: 'PMD', ZWAKRA: 'ZWAKRA', BESTAFR: 'BEST',
  // AfvalWijzer
  gft: 'GFT', restafval: 'REST', papier: 'PAP', pmd: 'PMD',
  glas: 'GLAS', textiel: 'TEXT', kca: 'KCA', grof: 'GROF',
  takken: 'TAK', kerstbomen: 'KERST',
};
```

En update de `badge`-functie:

```javascript
function badge(type) {
  const bg    = TYPE_COLOR[type] || '#546E7A';
  const color = TYPE_TEXT[type]  || '#fff';
  const label = TYPE_LABEL[type] || type;
  return `<span style="display:inline-block;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;margin-right:2px;background:${bg};color:${color}">${label}</span>`;
}
```

- [ ] **Stap 7.3: Commit**

```bash
git add widgets/afvalkalender/public/style.css widgets/afvalkalender/public/script.js
git commit -m "fix: widget overflow hidden + extend badge colors for AfvalWijzer types"
```

---

## Task 8: locales

**Files:**
- Modify: `locales/nl.json`
- Modify: `locales/en.json`

- [ ] **Stap 8.1: Vervang locales/nl.json**

```json
{
  "pair": {
    "search": {
      "title": "Adres toevoegen",
      "provider_label": "Afvalaanbieder",
      "postcode_label": "Postcode",
      "housenumber_label": "Huisnummer",
      "toevoeging_label": "Toevoeging (optioneel)",
      "name_label": "Naam (optioneel)",
      "next_btn": "Volgende",
      "validating_circulus": "Adres controleren bij Circulus...",
      "validating_afvalwijzer": "Adres controleren bij AfvalWijzer...",
      "error_required": "Vul postcode en huisnummer in.",
      "error_not_found": "Adres niet gevonden. Controleer postcode en huisnummer."
    }
  },
  "settings": {
    "provider": {
      "label": "Afvalaanbieder"
    },
    "toevoeging": {
      "label": "Toevoeging"
    },
    "refresh_interval": {
      "label": "Verversingsinterval"
    }
  }
}
```

- [ ] **Stap 8.2: Vervang locales/en.json**

```json
{
  "pair": {
    "search": {
      "title": "Add address",
      "provider_label": "Waste collection provider",
      "postcode_label": "Postal code",
      "housenumber_label": "House number",
      "toevoeging_label": "House number addition (optional)",
      "name_label": "Name (optional)",
      "next_btn": "Next",
      "validating_circulus": "Checking address with Circulus...",
      "validating_afvalwijzer": "Checking address with AfvalWijzer...",
      "error_required": "Please fill in postal code and house number.",
      "error_not_found": "Address not found. Check postal code and house number."
    }
  },
  "settings": {
    "provider": {
      "label": "Waste collection provider"
    },
    "toevoeging": {
      "label": "House number addition"
    },
    "refresh_interval": {
      "label": "Refresh interval"
    }
  }
}
```

- [ ] **Stap 8.3: Commit**

```bash
git add locales/nl.json locales/en.json
git commit -m "feat: add locale strings for provider and toevoeging"
```

---

## Task 9: App metadata — versie, changelog, README

**Files:**
- Modify: `.homeycompose/app.json`
- Modify: `.homeychangelog.json`
- Modify: `README.nl.txt`
- Modify: `README.txt`

- [ ] **Stap 9.1: Vervang .homeycompose/app.json**

```json
{
  "id": "nl.klikokalender",
  "version": "1.0.4",
  "compatibility": ">=12.1.2",
  "sdk": 3,
  "platforms": ["local"],
  "name": {
    "en": "Kliko Calendar",
    "nl": "Kliko Kalender"
  },
  "description": {
    "en": "Get notified which trash containers are collected today and tomorrow. Supports Circulus and AfvalWijzer (Groningen).",
    "nl": "Ontvang een melding welke containers vandaag en morgen worden geleegd. Ondersteunt Circulus en AfvalWijzer (Groningen)."
  },
  "category": "tools",
  "tags": {
    "en": ["trash", "garbage", "collection", "circulus", "afvalwijzer", "groningen", "reminder", "waste"],
    "nl": ["afval", "container", "ophaalkalender", "circulus", "afvalwijzer", "groningen", "herinnering", "kliko"]
  },
  "permissions": [],
  "images": {
    "small":  "/assets/images/small.png",
    "large":  "/assets/images/large.png",
    "xlarge": "/assets/images/xlarge.png"
  },
  "author": {
    "name": "Jan-kees de Rijke"
  },
  "source": "https://github.com/jankeesder/homey-kliko-kalender",
  "brandColor": "#2E7D32"
}
```

- [ ] **Stap 9.2: Voeg 1.0.4 toe aan .homeychangelog.json**

Voeg bovenaan (vóór de bestaande entries) de volgende entry toe. De rest van het bestand blijft ongewijzigd:

```json
{
  "1.0.4": {
    "en": "Added support for AfvalWijzer (Groningen and other municipalities). Widget no longer scrolls internally.",
    "nl": "Ondersteuning toegevoegd voor AfvalWijzer (Groningen en andere gemeenten). Widget scrollt niet meer intern."
  },
  "1.0.3": { ... }
}
```

Het volledige bestand wordt:

```json
{
  "1.0.4": {
    "en": "Added support for AfvalWijzer (Groningen and other municipalities). Widget no longer scrolls internally.",
    "nl": "Ondersteuning toegevoegd voor AfvalWijzer (Groningen en andere gemeenten). Widget scrollt niet meer intern."
  },
  "1.0.3": {
    "en": "Driver image updated to white background (App Store requirement). README now explains multi-address support and Circulus-only scope."
  },
  "1.0.2": {
    "en": "Driver image updated to white background (App Store requirement). README now explains multi-address support and Circulus-only scope."
  },
  "1.0.1": {
    "en": "Add GitHub source reference",
    "nl": "GitHub bronverwijzing toegevoegd"
  },
  "1.0.0": {
    "en": "First release: 7-day trash collection calendar for Circulus addresses with widget and Flow support",
    "nl": "Eerste release: 7-daagse ophaalkalender voor Circulus adressen met widget en Flow ondersteuning"
  }
}
```

- [ ] **Stap 9.3: Vervang README.nl.txt**

```
Kliko Kalender toont je afvalophaalschema voor de komende 7 dagen, op basis van je adres.

Voeg je adres toe via Apparaten om te zien welke containers (GFT, REST, PAP, PMD) vandaag en morgen worden opgehaald. Gebruik de widget op je Homey dashboard voor een snel overzicht, en stel Flows in om een melding te ontvangen op ophaaldagen.

Ondersteunde aanbieders
────────────────────────
• Circulus — voor adressen in Apeldoorn, Deventer, Hengelo en omliggende gemeenten
• AfvalWijzer — voor adressen in Groningen en andere gemeenten die mijnafvalwijzer.nl gebruiken

Bij het toevoegen van een adres kies je eerst je aanbieder. Voor AfvalWijzer kun je optioneel een huisnummertoevoeging (bijv. A of B) invullen.

Meerdere adressen
──────────────────
Je kunt meerdere adressen toevoegen — elk als eigen tegel in Homey met afzonderlijke meldingen en automatiseringen. Handig als je meerdere locaties wilt bijhouden, of op een hoek woont.
```

- [ ] **Stap 9.4: Vervang README.txt**

```
Kliko Calendar shows your waste collection schedule for the next 7 days, based on your address.

Add your address via Devices to see which containers (GFT, REST, PAP, PMD) are collected today and tomorrow. Use the widget on your Homey dashboard for a quick overview, and set up Flows to receive a notification on collection days.

Supported providers
────────────────────
• Circulus — for addresses in Apeldoorn, Deventer, Hengelo and surrounding municipalities
• AfvalWijzer — for addresses in Groningen and other municipalities using mijnafvalwijzer.nl

When adding an address, first select your provider. For AfvalWijzer, you can optionally fill in a house number addition (e.g. A or B).

Multiple addresses
───────────────────
You can add multiple addresses — each as its own device in Homey with separate notifications and automations.
```

- [ ] **Stap 9.5: Commit**

```bash
git add .homeycompose/app.json .homeychangelog.json README.nl.txt README.txt
git commit -m "chore: bump version to 1.0.4, update changelog and README for multi-provider"
```

---

## Task 10: app.json regenereren + Flow conditions uitbreiden

**Files:**
- Run: `homey app compose`
- Modify: `app.json` (Flow condition values uitbreiden — niet via compose)

- [ ] **Stap 10.1: Genereer app.json via homey compose**

```bash
cd /home/claude/homey-apps/nl.klikokalender
homey app compose
```

Verwacht: geen fouten, `app.json` is bijgewerkt (versie 1.0.4, nieuwe settings).

- [ ] **Stap 10.2: Voeg AfvalWijzer-types toe aan de Flow conditions in app.json**

In `app.json`, zoek de twee condition-blokken (`collection_type_today` en `collection_type_tomorrow`). Voeg aan het einde van elk `values`-array de volgende items toe (na `BESTAFR`):

```json
{ "id": "gft",        "label": { "en": "gft (organic)",          "nl": "gft (groente/fruit/tuin)" } },
{ "id": "restafval",  "label": { "en": "residual waste",         "nl": "restafval" } },
{ "id": "papier",     "label": { "en": "paper (AfvalWijzer)",    "nl": "papier (AfvalWijzer)" } },
{ "id": "pmd",        "label": { "en": "pmd (AfvalWijzer)",      "nl": "pmd (AfvalWijzer)" } },
{ "id": "glas",       "label": { "en": "glass",                  "nl": "glas" } },
{ "id": "textiel",    "label": { "en": "textiles",               "nl": "textiel" } },
{ "id": "kca",        "label": { "en": "chemical waste",         "nl": "chemisch afval (KCA)" } },
{ "id": "grof",       "label": { "en": "bulky waste",            "nl": "grof huishoudelijk afval" } },
{ "id": "takken",     "label": { "en": "branches",               "nl": "takken/snoeiafval" } },
{ "id": "kerstbomen", "label": { "en": "christmas trees",        "nl": "kerstbomen" } }
```

- [ ] **Stap 10.3: Valideer de app**

```bash
homey app validate
```

Verwacht: geen errors (warnings over testomgeving zijn acceptabel).

- [ ] **Stap 10.4: Commit**

```bash
git add app.json
git commit -m "chore: regenerate app.json with 1.0.4, new settings and AfvalWijzer flow types"
```

---

## Task 11: Deploy naar test-Homey

**Files:**
- Modify: `widgets/afvalkalender/__assets__/` (kopieer van public/)

- [ ] **Stap 11.1: Kopieer widget-assets**

```bash
cp widgets/afvalkalender/public/index.html widgets/afvalkalender/__assets__/index.html
cp widgets/afvalkalender/public/script.js  widgets/afvalkalender/__assets__/script.js
cp widgets/afvalkalender/public/style.css  widgets/afvalkalender/__assets__/style.css
```

- [ ] **Stap 11.2: Bouw de tarball**

```bash
cd /home/claude/homey-apps/nl.klikokalender
tar czf /tmp/klikokalender-104.tar.gz \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.homeybuild' \
  --exclude='docs' \
  --exclude='test' \
  .
```

- [ ] **Stap 11.3: Deploy naar test-Homey**

```bash
curl -s -X POST "http://10.0.2.10:4859/api/manager/devkit/" \
  -H "Authorization: Bearer 8d5795ee-543c-4562-b7f2-a6271db17421:80d7a6ca-2535-4333-bec5-cc9407314fc4:7b665aef682936ab7b69b3f5a4351a9e705c7f45" \
  -F "app=@/tmp/klikokalender-104.tar.gz;type=application/gzip" \
  -F "env={}" \
  -F "debug=true" \
  -F "purgeSettings=false"
```

Verwacht: JSON-response met `{ "success": true }` of vergelijkbaar.

- [ ] **Stap 11.4: Controleer app-status**

```bash
curl -s "http://10.0.2.10:4859/api/manager/apps/app/nl.klikokalender" \
  -H "Authorization: Bearer 8d5795ee-543c-4562-b7f2-a6271db17421:80d7a6ca-2535-4333-bec5-cc9407314fc4:7b665aef682936ab7b69b3f5a4351a9e705c7f45" \
  | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('state:', j.state, '| crashed:', j.crashed, '| version:', j.version);"
```

Verwacht: `state: running | crashed: false | version: 1.0.4`

- [ ] **Stap 11.5: Testplan uitvoeren op de Homey**

1. Open Homey app → Apparaten → voeg nieuw Kliko adres toe
2. Kies **Circulus** → vul bestaand testadres in → controleer dat koppelen werkt
3. Voeg tweede adres toe → kies **AfvalWijzer** → vul Gronings adres in (bijv. 9712AB 10) → koppelen
4. Controleer widget: beide apparaten zichtbaar, geen interne scrollbalk
5. Controleer Flow condition dropdown: bevat zowel Circulus- als AfvalWijzer-types

---

## Self-review checklist

- [x] lib/afvalwijzer-api.js getest via TDD (Task 1)
- [x] Backward compat: device.js defaultt naar `'circulus'` wanneer provider-setting ontbreekt (Task 2)
- [x] Device-ID voor Circulus ongewijzigd (Task 3)
- [x] Toevoeging-veld verborgen voor Circulus (Task 4)
- [x] Flow conditions voor beide providers (Task 10)
- [x] Widget overflow:hidden (Task 7)
- [x] Versie 1.0.4 + changelog (Task 9)
- [x] Deploy + statuscheck (Task 11)
