'use strict';

const TYPE_COLOR = {
  // Circulus (uppercase 3-6 letter codes)
  GFT:      '#388E3C',
  REST:     '#546E7A',
  PAP:      '#1E88E5',
  PMD:      '#F9A825',
  ZWAKRA:   '#795548',
  BESTAFR:  '#7B1FA2',
  // Groningen Burgerportaal (uppercase)
  RESTAFVAL: '#546E7A',
  PAPIER:    '#1E88E5',
  PMDREST:   '#FF8F00',
  OPK:       '#1E88E5',
  KCA:       '#E53935',
};

const TYPE_TEXT = { PMD: '#333', PMDREST: '#333' };

const TYPE_LABEL = {
  // Circulus
  GFT: 'GFT', REST: 'REST', PAP: 'PAP', PMD: 'PMD', ZWAKRA: 'ZWAKRA', BESTAFR: 'BEST',
  // Groningen Burgerportaal
  RESTAFVAL: 'REST', PAPIER: 'PAP', PMDREST: 'PMDREST', OPK: 'OPK', KCA: 'KCA',
};

let _homey;
let _allCalendars = {};
let _readyCalled  = false;

function _signalReady() {
  if (_readyCalled) return;
  _readyCalled = true;
  const h = document.getElementById('widget').scrollHeight;
  _homey.ready({ height: h || 200 });
}

async function load() {
  const list = document.getElementById('daysList');
  try {
    _allCalendars = await _homey.api('GET', '/calendar');
    render();
  } catch (err) {
    list.innerHTML = `<div class="loading">Fout: ${err.message}</div>`;
    _signalReady();
  }
}

function badge(type) {
  const bg    = TYPE_COLOR[type] || '#546E7A';
  const color = TYPE_TEXT[type]  || '#fff';
  const label = TYPE_LABEL[type] || type;
  return `<span style="display:inline-block;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;margin-right:2px;background:${bg};color:${color}">${label}</span>`;
}

function render() {
  const list    = document.getElementById('daysList');
  const entries = Object.values(_allCalendars);

  if (entries.length === 0) {
    list.innerHTML = '<div class="loading">Geen data beschikbaar.</div>';
    _signalReady();
    return;
  }

  const multi = entries.length > 1;

  let html = '<div style="width:100%;font-size:11px">';

  if (multi) {
    html += '<div style="display:flex;background:#2E7D32;border-radius:4px 4px 0 0;padding:2px 0;margin-bottom:2px">';
    html += '<div style="flex:0 0 58px"></div>';
    entries.forEach((d) => {
      html += `<div style="flex:1;padding:2px 4px 2px 8px;color:#fff;font-size:10px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center">${d.deviceName}</div>`;
    });
    html += '</div>';
  }

  entries[0].days.forEach((_, i) => {
    const isToday = i === 0;
    const hasAny  = entries.some((d) => d.days[i].hasCollection);
    const rowBg   = (isToday || hasAny) ? 'rgba(46,125,50,0.09)' : 'transparent';
    const dayClr  = '#999';
    const dayWght = isToday ? '700' : '400';

    html += `<div style="display:flex;align-items:center;background:${rowBg};border-radius:3px;margin-bottom:1px;padding:2px 0">`;
    html += `<div style="flex:0 0 58px;padding:2px 4px;font-size:10px;color:${dayClr};font-weight:${dayWght};white-space:nowrap">${entries[0].days[i].dayLabel}</div>`;

    entries.forEach((d) => {
      const day  = d.days[i];
      const cell = day.types.length > 0 ? day.types.map(badge).join('') : '';
      html += `<div style="flex:1;padding:2px 2px;text-align:center">${cell}</div>`;
    });

    html += '</div>';
  });

  html += '</div>';
  list.innerHTML = html;

  if (!multi) {
    document.getElementById('deviceName').textContent = entries[0].deviceName;
  }

  _signalReady();
}

async function init() {
  const list = document.getElementById('daysList');
  try {
    const devices = await _homey.api('GET', '/devices');

    if (!devices || devices.length === 0) {
      list.innerHTML = '<div class="loading">Geen kliko adres gevonden. Voeg eerst een adres toe via Apparaten.</div>';
      _signalReady();
      return;
    }

    if (devices.length > 1) {
      document.getElementById('deviceName').style.display = 'none';
    }

    load();
  } catch (err) {
    list.innerHTML = `<div class="loading">Fout: ${err.message}</div>`;
    _signalReady();
  }
}

function onHomeyReady(Homey) {
  _homey = Homey;
  init();
}
