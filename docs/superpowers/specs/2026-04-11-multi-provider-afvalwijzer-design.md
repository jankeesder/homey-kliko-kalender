# Ontwerp: Multi-provider uitbreiding nl.klikokalender

**Datum:** 2026-04-11  
**Versie:** 1.0.4  
**Status:** Goedgekeurd

---

## Samenvatting

De app `nl.klikokalender` wordt uitgebreid met een tweede afvalophaalservice: de **AfvalWijzer API** (mijnafvalwijzer.nl), die onder andere de gemeente Groningen bedient. De bestaande Circulus-integratie blijft volledig intact. Bestaande gebruikers merken niets van de upgrade. De widget krijgt een fix zodat deze niet intern scrollt.

---

## Doelen

1. Ondersteuning toevoegen voor de AfvalWijzer API (Groningen en andere gemeenten)
2. Widget niet-scrolbaar maken (geen interne scrollbalk)
3. Bestaande Circulus-gebruikers ongestoord laten
4. Voldoen aan Homey App Store richtlijnen
5. Testdeployment op lokale Homey

---

## Architectuur

### Provider-laag

```
afval-adres driver (device.js)
    ↓  getSetting('provider') || 'circulus'
    ├── lib/circulus-api.js     (bestaand, ongewijzigd)
    └── lib/afvalwijzer-api.js  (nieuw)
         ↓
    Beide retourneren: { 'YYYY-MM-DD': ['CODE1', 'CODE2'] }
```

De routing gebeurt via een simpele `if/else` in `device.js`. Geen factory-pattern of gedeelde interface — zo min mogelijk extra complexiteit.

### Afvalcodes per provider

| Provider    | Codes (zoals opgeslagen)                                  |
|-------------|-----------------------------------------------------------|
| Circulus    | `GFT`, `REST`, `PAP`, `PMD`, `ZWAKRA`, `BESTAFR`         |
| AfvalWijzer | `gft`, `restafval`, `papier`, `pmd`, `glas`, `textiel`, `kca`, `grof`, `takken`, `kerstbomen` |

Codes worden niet genormaliseerd. De widget en `formatTypesList` krijgen beide codereeksen in hun kleur/label-map.

---

## Componenten

### Nieuw

- `lib/afvalwijzer-api.js`
  - Exporteert `fetchCalendar(postcode, huisnummer, toevoeging, days = 7)`
  - Roept `https://api.mijnafvalwijzer.nl/webservices/appsinput/` aan
  - Combineert `ophaaldagen.data` + `ophaaldagenNext.data`
  - Filtert op datum-window en retourneert `{ 'YYYY-MM-DD': ['code'] }`
  - Exporteert `WASTE_TYPES` map (code → Nederlandse label)
  - Exporteert `validateAddress(postcode, huisnummer, toevoeging)` voor smoke-test tijdens koppelen

### Gewijzigd

| Bestand | Wijziging |
|---------|-----------|
| `drivers/afval-adres/driver.js` | Provider-dropdown in koppelscherm; device-ID-prefix provider-afhankelijk |
| `drivers/afval-adres/device.js` | `refreshData()` roept juiste API aan; defaultt naar `'circulus'` |
| `drivers/afval-adres/pair/search.html` | Provider-dropdown + toevoeging-veld (zichtbaar bij AfvalWijzer) |
| `drivers/afval-adres/pair/confirm.html` | Toont gekozen provider ter bevestiging |
| `drivers/afval-adres/driver.compose.json` | `provider`-setting, `toevoeging`-setting, AfvalWijzer-typen in Flow conditions |
| `widgets/afvalkalender/public/style.css` | `html, body { overflow: hidden; }` |
| `widgets/afvalkalender/public/script.js` | Kleur/label-map uitgebreid met AfvalWijzer-codes |
| `locales/nl.json` + `locales/en.json` | Vertalingen voor provider-label en toevoeging |
| `app.json` | Versie 1.0.4; app-beschrijving noemt nu ook AfvalWijzer |
| `.homeychangelog.json` | Entry voor 1.0.4 (NL + EN) |
| `README.txt` + `README.nl.txt` | Sectie over providers: welke aanbieder voor welke gemeente, uitleg toevoeging |

### Ongewijzigd

- `lib/circulus-api.js`
- `widgets/afvalkalender/api.js`
- `app.js`
- Alle Flow triggers en actions
- Alle capabilities

---

## Data flow

### Koppelen

```
search.html
  1. Dropdown "Afvalaanbieder": Circulus | Groningen (AfvalWijzer)
  2. Bij AfvalWijzer: toevoeging-veld verschijnt
  3. Invullen postcode + huisnummer (+ optioneel toevoeging)
  4. "Volgende" → driver.js:
       Circulus:    registerAddress()          → session cookie
       AfvalWijzer: fetchCalendar() 1-dag      → smoke test (status: ok?)
  5. Succes → confirm.html → apparaat aangemaakt
```

**Device settings na koppelen:**

```json
{
  "provider": "circulus" | "afvalwijzer",
  "postcode": "9712AB",
  "huisnummer": "10",
  "toevoeging": "",
  "refresh_interval": "86400"
}
```

**Device ID:**
- Circulus: `circulus-{postcode}-{huisnummer}` *(bestaand formaat)*
- AfvalWijzer: `afvalwijzer-{postcode}-{huisnummer}` (met `-{toevoeging}` indien gevuld)

### Refresh (device.js)

```
refreshData()
  → provider = getSetting('provider') || 'circulus'
  → Circulus:    registerAddress() + fetchCalendar(session, 7)
  → AfvalWijzer: fetchCalendar(postcode, huisnummer, toevoeging, 7)
  → setStoreValue('calendar', { 'YYYY-MM-DD': ['CODE',...] })
  → _updateCapabilities()   ← ongewijzigd
```

### Widget

- `api.js` ongewijzigd — leest opgeslagen kalender, bouwt 7-daagse lijst
- `script.js` uitgebreide kleurmap:
  - Circulus-codes (hoofdletters): bestaande kleuren
  - AfvalWijzer-codes (kleine letters): nieuwe kleuren
- `style.css`: `html, body { overflow: hidden; }` — widget scrollt niet intern; Homey past de hoogte aan via `homey.ready({ height })`

---

## Backward compatibility

| Scenario | Gedrag |
|----------|--------|
| Bestaand Circulus-apparaat | `provider` setting ontbreekt → defaultt naar `'circulus'` → werkt zoals voorheen |
| Bestaande opgeslagen kalender | Codes zijn Circulus-formaat (hoofdletters) → widget toont ze correct |
| Flow cards bestaande gebruiker | Ongewijzigd — triggers, conditions en actions werken identiek |
| Device ID bestaande apparaten | Ongewijzigd — `circulus-{postcode}-{huisnummer}` |

---

## Flow cards

De condition-dropdown ("Een bepaald type wordt vandaag/morgen opgehaald") wordt uitgebreid met AfvalWijzer-typen. Bestaande Circulus-typen blijven staan. Volgorde: Circulus-typen eerst, dan AfvalWijzer-typen.

---

## Richtlijnen compliance

- Versie bumpt naar **1.0.4**
- `app.json` beschrijving bijgewerkt (vermeldt beide providers)
- Changelog ingevuld voor App Store
- API-key AfvalWijzer is een publiek bekende key — geen secrets-issue
- Toevoeging-setting heeft lege string als default — voldoet aan settings-spec

---

## Gebruikersinstructies

- `README.nl.txt`: sectie "Ondersteunde aanbieders" met uitleg welke gemeenten bij welke provider horen en wat een toevoeging is
- `README.txt`: Engelse equivalent
- Koppelscherm subtitle is provider-afhankelijk:
  - Circulus: "Voer uw adres in om de ophaalkalender van Circulus op te halen."
  - AfvalWijzer: "Voer uw adres in om de ophaalkalender van uw gemeente op te halen."

---

## Testdeployment

**API-key test Homey:** `8d5795ee-543c-4562-b7f2-a6271db17421:80d7a6ca-2535-4333-bec5-cc9407314fc4:7b665aef682936ab7b69b3f5a4351a9e705c7f45`

```bash
cd /home/claude/homey-apps/nl.klikokalender
cp widgets/afvalkalender/public/* widgets/afvalkalender/__assets__/
tar czf /tmp/klikokalender-test.tar.gz .
curl -s -X POST "http://10.0.2.10:4859/api/manager/devkit/" \
  -H "Authorization: Bearer 8d5795ee-543c-4562-b7f2-a6271db17421:80d7a6ca-2535-4333-bec5-cc9407314fc4:7b665aef682936ab7b69b3f5a4351a9e705c7f45" \
  -F "app=@/tmp/klikokalender-test.tar.gz;type=application/gzip" \
  -F "env={}" -F "debug=true" -F "purgeSettings=false"
```

---

## Testplan

1. Bestaand Circulus-apparaat herstart → capabilities werken nog → Flow triggers vuren
2. Nieuw Circulus-apparaat koppelen via nieuwe koppelflow → werkt identiek aan v1.0.3
3. Nieuw AfvalWijzer-apparaat koppelen (Groningen postcode) → data geladen
4. Widget toont beide apparaten naast elkaar (multi-device weergave)
5. Widget scrollt niet — hoogte past zich aan via `homey.ready()`
6. Flow condition met AfvalWijzer-type werkt correct
