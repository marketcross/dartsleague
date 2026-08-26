/* Market Cross Darts League — shared data loader
   Every page fetches the same JSON once from the Apps Script web app and renders
   itself from it. Nothing here is specific to one page. */

const SITE_CONFIG = {
  // Paste your Apps Script web app URL here (Deploy > Manage deployments > Web app URL),
  // keeping "?page=api" on the end exactly as shown. Example:
  // 'https://script.google.com/macros/s/AKfycbXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec?page=api'
  API_URL: 'PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE?page=api',
};

let _dataPromise = null;

// Fetches once and caches for the lifetime of the page (every page calls this on load).
function loadLeagueData() {
  if (!_dataPromise) {
    _dataPromise = fetch(SITE_CONFIG.API_URL.trim())
      .then(r => {
        if (!r.ok) throw new Error('Server returned ' + r.status);
        return r.json();
      })
      .catch(err => { _dataPromise = null; throw err; });
  }
  return _dataPromise;
}

function showPageError(err) {
  const el = document.getElementById('errBanner');
  if (!el) return;
  const msg = (err && err.message) ? err.message : String(err);
  el.textContent = "Couldn't load league data (" + msg + "). If you're setting this site up for the first time, check that assets/data.js has your Apps Script URL, and that it's deployed as a web app.";
  el.style.display = 'block';
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function teamParam(name) {
  return encodeURIComponent(name);
}

// The Apps Script web app's base URL (no "?page=..." on the end) — used as the
// target for the background RPC calls below. The captain portal and player admin
// pages themselves are just ordinary pages on this site now (see captainPortalUrl /
// playerAdminUrl) rather than being served directly by Apps Script, because Apps
// Script's own page-serving mechanism is unreliable on iOS Safari/WebKit.
function appBaseUrl() {
  // Split on the first "?" rather than matching "?page=api" exactly, so this still
  // works even if the pasted URL has extra whitespace or a slightly different query
  // string on the end.
  return SITE_CONFIG.API_URL.trim().split('?')[0];
}
function captainPortalUrl() {
  return 'portal.html';
}
function playerAdminUrl() {
  return 'admin.html';
}

// ---------- Captain portal / admin RPC helper ----------
// portal.html and admin.html use this instead of google.script.run to read and write
// the Apps Script backend, as a background fetch() call rather than a full page load
// through script.google.com — which is what sidesteps the iOS loading problem above.
//
// Deliberately POSTs a plain string body with no explicit Content-Type header, so the
// browser defaults it to "text/plain" — that keeps this a CORS "simple request" (no
// preflight OPTIONS round trip), which is what keeps this feeling as fast as the old
// google.script.run version did.
const PASSCODE_KEY = 'mcdlPasscode';

function callRpc(fn, ...args) {
  const payload = { fn: fn, args: args, passcode: getStoredPasscode() };
  return fetch(appBaseUrl(), { method: 'POST', body: JSON.stringify(payload) })
    .then(r => {
      if (!r.ok) throw new Error('Server returned ' + r.status);
      return r.json();
    })
    .then(data => {
      if (!data.ok) throw new Error(data.error || 'Something went wrong.');
      return data.result;
    });
}

function getStoredPasscode() {
  try { return localStorage.getItem(PASSCODE_KEY) || ''; } catch (e) { return ''; }
}
function setStoredPasscode(code) {
  try { localStorage.setItem(PASSCODE_KEY, code); } catch (e) { /* storage unavailable */ }
}
function clearStoredPasscode() {
  try { localStorage.removeItem(PASSCODE_KEY); } catch (e) { /* storage unavailable */ }
}

// Submitted fixtures (results) newest first; everything else (upcoming) soonest first.
function splitFixtures(fixtures) {
  const results = fixtures.filter(f => f.status === 'Submitted').slice().sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  const upcoming = fixtures.filter(f => f.status !== 'Submitted').slice().sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  return { results, upcoming };
}

function statusLabel(status) {
  if (status === 'Submitted') return { text: 'Result', cls: 'submitted' };
  if (status === 'In progress') return { text: 'In progress', cls: 'progress' };
  return { text: 'Upcoming', cls: 'upcoming' };
}

// Renders a game's leg score from the winning team's perspective vs a given team name.
function scoreForTeam(game, teamName) {
  if (!game.score || !game.winnerTeam) return '—';
  const [winLegs, loseLegs] = game.score.split('-');
  return game.winnerTeam === teamName ? `${winLegs}–${loseLegs}` : `${loseLegs}–${winLegs}`;
}

// ---------- League / cup table rendering ----------
// Shared by index.html (division tables + the home page cup table) and cups.html
// (the cup table repeated at the bottom of the rules page), so both stay in sync
// automatically rather than drifting apart as two separate copies.

// On a cup table only, the top 4 positions go through to the Knock Out Cup and
// 5th-8th go into the Subsidiary Cup (see cupKnockoutPairings_ in Code.gs) — flag
// that on each row with a small chip, same as how a football table shades its
// European/relegation zones.
function cupZoneChip(i) {
  if (i < 4) return '<span class="chip gold">Knock Out Cup</span>';
  if (i < 8) return '<span class="chip brand">Subsidiary Cup</span>';
  return '';
}

function leagueTableHtml(table, isCup) {
  if (!table.length) return '<p class="empty">No teams set up yet.</p>';
  return `<table class="data">
    <thead><tr>
      <th>Team</th><th class="num">P</th><th class="num">W</th><th class="num">L</th>
      <th class="num">Pts</th><th class="num">Game +/-</th>
    </tr></thead>
    <tbody>
      ${table.map((t, i) => `
      <tr class="${i === 0 ? 'leader' : ''}${isCup && i === 3 && table.length > 4 ? ' cup-cutline' : ''}">
        <td><a href="team.html?name=${teamParam(t.team)}">${escapeHtml(t.team)}</a>${isCup ? cupZoneChip(i) : ''}</td>
        <td class="num">${t.played}</td><td class="num">${t.won}</td><td class="num">${t.lost}</td>
        <td class="num">${t.points}</td><td class="num">${t.gameDiff > 0 ? '+' : ''}${t.gameDiff}</td>
      </tr>`).join('')}
    </tbody>
  </table>${isCup ? `<p class="page-sub" style="margin:12px 0 0;">Top 4 go through to the Knock Out Cup · 5th–8th go into the Subsidiary Cup.</p>` : ''}`;
}
