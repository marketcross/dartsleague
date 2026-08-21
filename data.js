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
    _dataPromise = fetch(SITE_CONFIG.API_URL)
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
