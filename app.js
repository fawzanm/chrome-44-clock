/* ============================================================
   Retro Digital Dashboard — app.js
   ES5 only — Chrome 44 / Android WebView compatible
   ============================================================ */

(function () {
  'use strict';

  /* --------------------------------------------------------
     NAMESPACE
     -------------------------------------------------------- */
  var APP = {};

  /* --------------------------------------------------------
     THEME COLOUR MAPS (no CSS variables — Chrome 44 compat)
     -------------------------------------------------------- */
  APP.themes = {
    'theme-cyan':  { glow: '#00ffff', dim: '#007a7a', bg: 'rgba(0,255,255,0.06)', accent: '#00cccc' },
    'theme-green': { glow: '#39ff14', dim: '#1a7a0a', bg: 'rgba(57,255,20,0.06)',  accent: '#2ecc40' },
    'theme-amber': { glow: '#ffbf00', dim: '#7a5c00', bg: 'rgba(255,191,0,0.06)',  accent: '#e6ac00' }
  };

  /* --------------------------------------------------------
     STATE
     -------------------------------------------------------- */
  APP.state = {
    theme: 'theme-cyan',
    format24: true,
    showSeconds: true,
    prayerMethod: 'dubai',
    asrMethod: 'standard',
    todayStr: '',
    todayTimes: null,
    tomorrowTimes: null,
    nextPrayer: null,
    // stopwatch
    swRunning: false,
    swStartTime: 0,
    swElapsed: 0,
    swLaps: [],
    swInterval: null
  };

  /* --------------------------------------------------------
     PRAYER CALCULATION METHODS
     Angles: fajrAngle, ishaAngle, ishaMinutes (if used),
             maghribMinutes (minutes after sunset, usually 0)
     -------------------------------------------------------- */
  APP.methods = {
    'dubai':   { name: 'Dubai (GIAE)',         fajr: 18.2, isha: 18.2, maghribMin: 0, ishaMin: 0 },
    'mwl':     { name: 'Muslim World League',  fajr: 18,   isha: 17,   maghribMin: 0, ishaMin: 0 },
    'isna':    { name: 'ISNA',                 fajr: 15,   isha: 15,   maghribMin: 0, ishaMin: 0 },
    'egypt':   { name: 'Egyptian Authority',   fajr: 19.5, isha: 17.5, maghribMin: 0, ishaMin: 0 },
    'karachi': { name: 'Karachi',              fajr: 18,   isha: 18,   maghribMin: 0, ishaMin: 0 }
  };

  /* Default Dubai coordinates */
  APP.lat = 25.2048;
  APP.lon = 55.2708;
  APP.tz  = 4; // UTC+4, no DST

  /* --------------------------------------------------------
     PRAYER NAMES (order matters)
     -------------------------------------------------------- */
  APP.prayerNames = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

  /* --------------------------------------------------------
     DOM REFERENCES
     -------------------------------------------------------- */
  var $ = function (id) { return document.getElementById(id); };

  APP.dom = {};

  function cacheDom() {
    APP.dom.clockHours   = $('clock-hours');
    APP.dom.clockMinutes = $('clock-minutes');
    APP.dom.clockSeconds = $('clock-seconds');
    APP.dom.clockColon1  = $('clock-colon1');
    APP.dom.clockColon2  = $('clock-colon2');
    APP.dom.clockAmpm    = $('clock-ampm');
    APP.dom.clockDate    = $('clock-date');
    APP.dom.clockSecsWrap = $('clock-seconds-wrap');
    APP.dom.nextLabel    = $('next-prayer-label');
    APP.dom.nextCountdown = $('next-prayer-countdown');
    APP.dom.nextBanner   = $('next-prayer-banner');
    APP.dom.swToggle     = $('stopwatch-toggle');
    APP.dom.swPanel      = $('stopwatch-panel');
    APP.dom.swDisplay    = $('stopwatch-display');
    APP.dom.swMs         = $('stopwatch-ms');
    APP.dom.swStart      = $('sw-start');
    APP.dom.swReset      = $('sw-reset');
    APP.dom.swLap        = $('sw-lap');
    APP.dom.lapList      = $('lap-list');
    APP.dom.settingsBtn  = $('settings-btn');
    APP.dom.settingsOver = $('settings-overlay');
    APP.dom.settingsClose = $('settings-close');
    APP.dom.setTheme     = $('set-theme');
    APP.dom.setFormat    = $('set-format');
    APP.dom.setSeconds   = $('set-seconds');
    APP.dom.setMethod    = $('set-method');
    APP.dom.setAsr       = $('set-asr');
    APP.dom.errorBar     = $('error-bar');
    APP.dom.prayerGrid   = $('prayer-grid');
    APP.dom.clockDisplay = $('clock-display');
  }

  /* --------------------------------------------------------
     HELPERS
     -------------------------------------------------------- */
  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function pad3(n) {
    if (n < 10) return '00' + n;
    if (n < 100) return '0' + n;
    return '' + n;
  }

  var DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                     'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  function formatDate(d) {
    return DAY_NAMES[d.getDay()] + '  ' + pad2(d.getDate()) + ' ' +
           MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
  }

  function toDateStr(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function showError(msg) {
    APP.dom.errorBar.textContent = msg;
    APP.dom.errorBar.className = '';
  }

  function hideError() {
    APP.dom.errorBar.className = 'hidden';
  }

  /* --------------------------------------------------------
     MATH HELPERS FOR PRAYER TIMES
     -------------------------------------------------------- */
  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;

  function sin(d)  { return Math.sin(d * RAD); }
  function cos(d)  { return Math.cos(d * RAD); }
  function tan(d)  { return Math.tan(d * RAD); }
  function asin(x) { return DEG * Math.asin(x); }
  function acos(x) { return DEG * Math.acos(x); }
  function atan2(y, x) { return DEG * Math.atan2(y, x); }

  /* Fix angle to [0, 360) */
  function fixAngle(a) {
    a = a - 360 * Math.floor(a / 360);
    return a < 0 ? a + 360 : a;
  }

  /* Fix hour to [0, 24) */
  function fixHour(h) {
    h = h - 24 * Math.floor(h / 24);
    return h < 0 ? h + 24 : h;
  }

  /* --------------------------------------------------------
     SOLAR CALCULATIONS (based on NOAA / PrayTimes.org algo)
     -------------------------------------------------------- */

  /* Julian Date from year, month, day */
  function julianDate(year, month, day) {
    if (month <= 2) {
      year  -= 1;
      month += 12;
    }
    var A = Math.floor(year / 100);
    var B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (year + 4716)) +
           Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
  }

  /* Sun position for a given Julian date */
  function sunPosition(jd) {
    var D = jd - 2451545.0;
    var g = fixAngle(357.529 + 0.98560028 * D);
    var q = fixAngle(280.459 + 0.98564736 * D);
    var L = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
    // var R = 1.00014 - 0.01671 * cos(g) - 0.00014 * cos(2 * g);
    var e = 23.439 - 0.00000036 * D;
    var RA = atan2(cos(e) * sin(L), cos(L)) / 15;
    var decl = asin(sin(e) * sin(L));
    var eqt = q / 15 - fixHour(RA);
    // Fix wrap-around at 0/24h boundary
    if (eqt > 12) eqt -= 24;
    if (eqt < -12) eqt += 24;
    return { declination: decl, equation: eqt };
  }

  /* Compute the time (in hours) for a given angle below horizon */
  function computeTime(angle, decl, lat) {
    var part = (-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat));
    // Clamp to [-1, 1] to avoid NaN at extreme latitudes
    if (part > 1) part = 1;
    if (part < -1) part = -1;
    return acos(part) / 15;
  }

  /* Mid-day (Dhuhr) time */
  function midDay(eqt, lon, tz) {
    return fixHour(12 - eqt - lon / 15 + tz);
  }

  /* --------------------------------------------------------
     computePrayerTimes(dateObj)
     Returns object: { fajr, sunrise, dhuhr, asr, maghrib, isha }
     Each value is a Date object.
     -------------------------------------------------------- */
  function computePrayerTimes(dateObj) {
    var year  = dateObj.getFullYear();
    var month = dateObj.getMonth() + 1;
    var day   = dateObj.getDate();

    var method = APP.methods[APP.state.prayerMethod] || APP.methods['dubai'];
    var lat = APP.lat;
    var lon = APP.lon;
    var tz  = APP.tz;

    var jd = julianDate(year, month, day);
    var sun = sunPosition(jd + 0.5); // noon
    var decl = sun.declination;
    var eqt  = sun.equation;

    // Dhuhr
    var dhuhrH = midDay(eqt, lon, tz);

    // Sunrise & Sunset (0.833 deg = apparent sun radius + refraction)
    var sunriseOffset = computeTime(0.833, decl, lat);
    var sunriseH = dhuhrH - sunriseOffset;
    var sunsetH  = dhuhrH + sunriseOffset;

    // Fajr
    var fajrOffset = computeTime(method.fajr, decl, lat);
    var fajrH = dhuhrH - fajrOffset;

    // Isha
    var ishaH;
    if (method.ishaMin > 0) {
      ishaH = sunsetH + method.ishaMin / 60;
    } else {
      var ishaOffset = computeTime(method.isha, decl, lat);
      ishaH = dhuhrH + ishaOffset;
    }

    // Maghrib
    var maghribH = sunsetH + method.maghribMin / 60;

    // Asr — shadow-length formula
    var asrFactor = (APP.state.asrMethod === 'hanafi') ? 2 : 1;
    var asrA = Math.atan(1.0 / (asrFactor + Math.tan((lat - decl) * RAD)));
    var asrCosH = (Math.sin(asrA) - Math.sin(lat * RAD) * Math.sin(decl * RAD)) /
                  (Math.cos(lat * RAD) * Math.cos(decl * RAD));
    if (asrCosH > 1) asrCosH = 1;
    if (asrCosH < -1) asrCosH = -1;
    var asrOffset = DEG * Math.acos(asrCosH) / 15;
    var asrH = dhuhrH + asrOffset;

    // Convert hours to Date objects
    function hoursToDate(h) {
      h = fixHour(h);
      var totalMin = Math.round(h * 60);
      var hh = Math.floor(totalMin / 60) % 24;
      var mm = totalMin % 60;
      var d = new Date(year, month - 1, day, hh, mm, 0, 0);
      return d;
    }

    return {
      fajr:    hoursToDate(fajrH),
      sunrise: hoursToDate(sunriseH),
      dhuhr:   hoursToDate(dhuhrH),
      asr:     hoursToDate(asrH),
      maghrib: hoursToDate(maghribH),
      isha:    hoursToDate(ishaH)
    };
  }

  /* --------------------------------------------------------
     getNextPrayer(now, todayTimes, tomorrowTimes)
     Returns { name: string, time: Date } or null
     -------------------------------------------------------- */
  function getNextPrayer(now, todayTimes, tomorrowTimes) {
    var i, name, t;
    var nowMs = now.getTime();

    // Check today's prayers
    for (i = 0; i < APP.prayerNames.length; i++) {
      name = APP.prayerNames[i];
      t = todayTimes[name];
      if (t && t.getTime() > nowMs) {
        return { name: name, time: t };
      }
    }

    // All today's prayers passed — check tomorrow
    if (tomorrowTimes) {
      for (i = 0; i < APP.prayerNames.length; i++) {
        name = APP.prayerNames[i];
        t = tomorrowTimes[name];
        if (t && t.getTime() > nowMs) {
          return { name: name, time: t };
        }
      }
    }

    return null;
  }

  /* --------------------------------------------------------
     THEME APPLICATION (no CSS variables — direct style writes)
     -------------------------------------------------------- */
  function applyThemeColors() {
    var t = APP.themes[APP.state.theme];
    if (!t) return;
    var glow = t.glow;
    var dim  = t.dim;

    // Body class
    document.body.className = APP.state.theme;

    // Clock glow
    var shadow = '0 0 10px ' + glow + ', 0 0 30px ' + dim + ', 0 0 60px ' + dim;
    APP.dom.clockDisplay.style.color = glow;
    APP.dom.clockDisplay.style.textShadow = shadow;

    // Date
    APP.dom.clockDate.style.color = glow;

    // Banner
    APP.dom.nextBanner.style.borderColor = dim;
    APP.dom.nextBanner.style.backgroundColor = t.bg;
    APP.dom.nextBanner.style.color = glow;
    APP.dom.nextBanner.style.textShadow = '0 0 8px ' + dim;

    // Prayer cards
    var cards = APP.dom.prayerGrid.querySelectorAll('.prayer-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].style.color = glow;
      cards[i].style.textShadow = '0 0 6px ' + dim;
    }

    // Stopwatch
    if (APP.dom.swDisplay) {
      APP.dom.swDisplay.style.color = glow;
      APP.dom.swDisplay.style.textShadow = shadow;
    }

    // Buttons
    var btns = document.querySelectorAll('.btn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].style.color = glow;
      btns[j].style.borderColor = dim;
    }

    // Settings modal heading
    var h2 = document.querySelector('#settings-modal h2');
    if (h2) {
      h2.style.color = glow;
      h2.style.textShadow = '0 0 8px ' + dim;
    }
  }

  /* --------------------------------------------------------
     FORMAT TIME for prayer display
     -------------------------------------------------------- */
  function formatPrayerTime(d) {
    if (!d) return '--:--';
    var h = d.getHours();
    var m = d.getMinutes();
    if (APP.state.format24) {
      return pad2(h) + ':' + pad2(m);
    }
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return pad2(h) + ':' + pad2(m) + ' ' + ampm;
  }

  /* --------------------------------------------------------
     RENDER: CLOCK
     -------------------------------------------------------- */
  APP.colonVisible = true;

  function renderClock(now) {
    var h = now.getHours();
    var m = now.getMinutes();
    var s = now.getSeconds();
    var ampmStr = '';

    if (!APP.state.format24) {
      ampmStr = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      if (h === 0) h = 12;
    }

    APP.dom.clockHours.textContent   = pad2(h);
    APP.dom.clockMinutes.textContent = pad2(m);
    APP.dom.clockSeconds.textContent = pad2(s);
    APP.dom.clockAmpm.textContent    = ampmStr;

    // Blink colon
    APP.colonVisible = !APP.colonVisible;
    var cls = APP.colonVisible ? 'colon' : 'colon colon-off';
    APP.dom.clockColon1.className = cls;
    if (APP.state.showSeconds) {
      APP.dom.clockColon2.className = cls;
    }

    // Show/hide seconds
    APP.dom.clockSecsWrap.style.display = APP.state.showSeconds ? '' : 'none';

    // Date line
    APP.dom.clockDate.textContent = formatDate(now);
  }

  /* --------------------------------------------------------
     RENDER: PRAYERS
     -------------------------------------------------------- */
  function renderPrayers(now) {
    var times = APP.state.todayTimes;
    if (!times) return;

    var next = APP.state.nextPrayer;
    var nowMs = now.getTime();

    for (var i = 0; i < APP.prayerNames.length; i++) {
      var name = APP.prayerNames[i];
      var el = document.getElementById('pt-' + name);
      var card = el ? el.parentNode : null;
      if (!el || !card) continue;

      el.textContent = formatPrayerTime(times[name]);

      // Reset classes
      card.className = 'prayer-card';

      if (next && next.name === name && next.time.getTime() === times[name].getTime()) {
        card.className = 'prayer-card active';
      } else if (times[name] && times[name].getTime() <= nowMs) {
        card.className = 'prayer-card passed';
      }
    }

    // If next prayer is tomorrow, all today cards are passed
    if (next && APP.state.tomorrowTimes && next.time.getTime() === APP.state.tomorrowTimes[next.name].getTime()) {
      var allCards = APP.dom.prayerGrid.querySelectorAll('.prayer-card');
      for (var j = 0; j < allCards.length; j++) {
        allCards[j].className = 'prayer-card passed';
      }
    }
  }

  /* --------------------------------------------------------
     RENDER: NEXT PRAYER BANNER
     -------------------------------------------------------- */
  function renderNextBanner(now) {
    var next = APP.state.nextPrayer;
    if (!next) {
      APP.dom.nextLabel.textContent = 'NEXT: ---';
      APP.dom.nextCountdown.textContent = '--:--:--';
      return;
    }

    APP.dom.nextLabel.textContent = 'NEXT: ' + next.name.toUpperCase();

    var diff = next.time.getTime() - now.getTime();
    if (diff < 0) diff = 0;

    var totalSec = Math.floor(diff / 1000);
    var hh = Math.floor(totalSec / 3600);
    var mm = Math.floor((totalSec % 3600) / 60);
    var ss = totalSec % 60;

    APP.dom.nextCountdown.textContent = pad2(hh) + ':' + pad2(mm) + ':' + pad2(ss);
  }

  /* --------------------------------------------------------
     RECALCULATE PRAYER TIMES
     -------------------------------------------------------- */
  function recalcPrayers() {
    try {
      var now = new Date();
      // Compute for today
      APP.state.todayTimes = computePrayerTimes(now);

      // Compute for tomorrow
      var tomorrow = new Date(now.getTime() + 86400000);
      APP.state.tomorrowTimes = computePrayerTimes(tomorrow);

      APP.state.nextPrayer = getNextPrayer(now, APP.state.todayTimes, APP.state.tomorrowTimes);
      APP.state.todayStr = toDateStr(now);

      hideError();
    } catch (e) {
      showError('Prayer calc error: ' + e.message);
    }
  }

  /* --------------------------------------------------------
     STOPWATCH
     -------------------------------------------------------- */
  function renderStopwatch() {
    var elapsed = APP.state.swElapsed;
    if (APP.state.swRunning) {
      elapsed += Date.now() - APP.state.swStartTime;
    }

    var totalMs = elapsed;
    var ms = totalMs % 1000;
    var totalSec = Math.floor(totalMs / 1000);
    var ss = totalSec % 60;
    var mm = Math.floor(totalSec / 60) % 60;
    var hh = Math.floor(totalSec / 3600);

    APP.dom.swDisplay.innerHTML = pad2(hh) + ':' + pad2(mm) + ':' + pad2(ss) +
      '<span id="stopwatch-ms" style="font-size:22px;opacity:0.5">.' + pad3(ms) + '</span>';
  }

  function startStopwatch() {
    if (APP.state.swRunning) {
      // Pause
      APP.state.swElapsed += Date.now() - APP.state.swStartTime;
      APP.state.swRunning = false;
      APP.dom.swStart.textContent = 'START';
      if (APP.state.swInterval) {
        clearInterval(APP.state.swInterval);
        APP.state.swInterval = null;
      }
    } else {
      // Start
      APP.state.swStartTime = Date.now();
      APP.state.swRunning = true;
      APP.dom.swStart.textContent = 'PAUSE';
      APP.state.swInterval = setInterval(renderStopwatch, 47);
    }
  }

  function resetStopwatch() {
    APP.state.swRunning = false;
    APP.state.swElapsed = 0;
    APP.state.swStartTime = 0;
    APP.state.swLaps = [];
    APP.dom.swStart.textContent = 'START';
    APP.dom.lapList.innerHTML = '';
    if (APP.state.swInterval) {
      clearInterval(APP.state.swInterval);
      APP.state.swInterval = null;
    }
    renderStopwatch();
  }

  function lapStopwatch() {
    if (!APP.state.swRunning) return;
    var elapsed = APP.state.swElapsed + (Date.now() - APP.state.swStartTime);
    APP.state.swLaps.push(elapsed);

    var totalSec = Math.floor(elapsed / 1000);
    var ss = totalSec % 60;
    var mm = Math.floor(totalSec / 60) % 60;
    var hh = Math.floor(totalSec / 3600);
    var ms = elapsed % 1000;

    var div = document.createElement('div');
    div.className = 'lap-entry';
    div.textContent = 'LAP ' + APP.state.swLaps.length + '  ' +
      pad2(hh) + ':' + pad2(mm) + ':' + pad2(ss) + '.' + pad3(ms);
    // Insert at top
    if (APP.dom.lapList.firstChild) {
      APP.dom.lapList.insertBefore(div, APP.dom.lapList.firstChild);
    } else {
      APP.dom.lapList.appendChild(div);
    }
  }

  /* --------------------------------------------------------
     SETTINGS: LOAD / SAVE / APPLY
     -------------------------------------------------------- */
  function loadSettings() {
    try {
      var raw = localStorage.getItem('retro_dash_settings');
      if (raw) {
        var s = JSON.parse(raw);
        if (s.theme)    APP.state.theme = s.theme;
        if (s.format)   APP.state.format24 = (s.format === '24');
        if (typeof s.showSeconds !== 'undefined') APP.state.showSeconds = !!s.showSeconds;
        if (s.method)   APP.state.prayerMethod = s.method;
        if (s.asr)      APP.state.asrMethod = s.asr;
      }
    } catch (e) {
      // ignore
    }
  }

  function saveSettings() {
    try {
      var data = {
        theme: APP.state.theme,
        format: APP.state.format24 ? '24' : '12',
        showSeconds: APP.state.showSeconds,
        method: APP.state.prayerMethod,
        asr: APP.state.asrMethod
      };
      localStorage.setItem('retro_dash_settings', JSON.stringify(data));
    } catch (e) {
      // ignore
    }
  }

  function applySettingsToUI() {
    APP.dom.setTheme.value   = APP.state.theme;
    APP.dom.setFormat.value  = APP.state.format24 ? '24' : '12';
    APP.dom.setSeconds.value = APP.state.showSeconds ? '1' : '0';
    APP.dom.setMethod.value  = APP.state.prayerMethod;
    APP.dom.setAsr.value     = APP.state.asrMethod;
  }

  function readSettingsFromUI() {
    APP.state.theme        = APP.dom.setTheme.value;
    APP.state.format24     = (APP.dom.setFormat.value === '24');
    APP.state.showSeconds  = (APP.dom.setSeconds.value === '1');
    APP.state.prayerMethod = APP.dom.setMethod.value;
    APP.state.asrMethod    = APP.dom.setAsr.value;
  }

  /* --------------------------------------------------------
     MAIN TICK (every 1000ms)
     -------------------------------------------------------- */
  function tick() {
    try {
      var now = new Date();

      // Check if date changed → recalculate
      var todayStr = toDateStr(now);
      if (todayStr !== APP.state.todayStr) {
        recalcPrayers();
      }

      // Update next prayer (in case we crossed a prayer time)
      APP.state.nextPrayer = getNextPrayer(now, APP.state.todayTimes, APP.state.tomorrowTimes);

      renderClock(now);
      renderPrayers(now);
      renderNextBanner(now);
    } catch (e) {
      showError('Tick error: ' + e.message);
    }
  }

  /* --------------------------------------------------------
     EVENT BINDINGS
     -------------------------------------------------------- */
  function bindEvents() {
    // Stopwatch toggle
    APP.dom.swToggle.addEventListener('click', function () {
      if (APP.dom.swPanel.className.indexOf('hidden') !== -1) {
        APP.dom.swPanel.className = '';
        APP.dom.swToggle.textContent = 'HIDE STOPWATCH';
      } else {
        APP.dom.swPanel.className = 'hidden';
        APP.dom.swToggle.textContent = 'STOPWATCH';
      }
    });

    APP.dom.swStart.addEventListener('click', startStopwatch);
    APP.dom.swReset.addEventListener('click', resetStopwatch);
    APP.dom.swLap.addEventListener('click', lapStopwatch);

    // Settings open/close
    APP.dom.settingsBtn.addEventListener('click', function () {
      applySettingsToUI();
      APP.dom.settingsOver.className = '';
    });

    APP.dom.settingsClose.addEventListener('click', function () {
      APP.dom.settingsOver.className = 'hidden';
    });

    // Settings change listeners (apply immediately)
    var settingEls = [APP.dom.setTheme, APP.dom.setFormat, APP.dom.setSeconds,
                      APP.dom.setMethod, APP.dom.setAsr];
    for (var i = 0; i < settingEls.length; i++) {
      settingEls[i].addEventListener('change', function () {
        readSettingsFromUI();
        saveSettings();
        applyThemeColors();
        recalcPrayers();
      });
    }

    // Close settings on overlay click
    APP.dom.settingsOver.addEventListener('click', function (e) {
      if (e.target === APP.dom.settingsOver) {
        APP.dom.settingsOver.className = 'hidden';
      }
    });
  }

  /* --------------------------------------------------------
     INIT
     -------------------------------------------------------- */
  function init() {
    try {
      cacheDom();
      loadSettings();
      applyThemeColors();
      recalcPrayers();
      tick(); // immediate first render
      setInterval(tick, 1000);
      bindEvents();
      renderStopwatch(); // initial 00:00:00
    } catch (e) {
      var errEl = document.getElementById('error-bar');
      if (errEl) {
        errEl.textContent = 'Init error: ' + e.message;
        errEl.className = '';
      }
    }
  }

  /* Start when DOM ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Expose for debugging */
  window.APP = APP;

})();
