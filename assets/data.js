/* Market Cross Darts League — shared data loader
   Every page fetches the same JSON once from the Apps Script web app and renders
   itself from it. Nothing here is specific to one page. */

const SITE_CONFIG = {
  // This is the live Apps Script web app URL for this league (Deploy > Manage
  // deployments > Web app URL), with "?page=api" on the end as required.
  //
  // IMPORTANT — do not reset this to a placeholder when editing this file for any
  // other reason: this exact line going missing once already took the whole site
  // down (every page failed to load with a fetch error / looked like a 404).
  API_URL: 'https://script.google.com/macros/s/AKfycbw0aMfw5fbMGXeVrs4DJTn5vYUfgaipM3At3h7UVVt9ZAe_rhSElVuX61GR3X8SKFfmpQ/exec?page=api',
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

// Groups a fixtures array by its dateISO (preserving each fixture's own order within
// its date), returning one entry per distinct date. Used by the social fixtures/
// results pickers so a visitor can jump straight to a specific match night instead of
// only ever seeing a rolling window.
function groupFixturesByDate(fixtures) {
  const byDate = {};
  const order = [];
  fixtures.forEach(f => {
    if (!byDate[f.dateISO]) { byDate[f.dateISO] = { dateISO: f.dateISO, date: f.date, fixtures: [] }; order.push(f.dateISO); }
    byDate[f.dateISO].fixtures.push(f);
  });
  return order.map(iso => byDate[iso]);
}

// ---------- Facebook "poster" frame scaling/export ----------
// Shared by social/fixtures.html, social/results.html and social/table.html: each
// wraps its downloadable content in a fixed 1080x1350 #posterFrame (Meta's current
// recommended 4:5 feed-image ratio) carrying the league's own logo/colour/footer, so
// every downloaded PNG is already the right shape — no cropping needed on Facebook's
// end. The frame is visually scaled down with a CSS transform to fit inside its
// on-page preview box on small screens; transform doesn't affect offsetWidth/Height,
// so the frame's true 1080x1350 layout size is unaffected and that's what gets
// captured (after briefly clearing the transform so html2canvas doesn't shrink it).
function fitPosterFrame(frameId, wrapId) {
  const wrap = document.getElementById(wrapId);
  const frame = document.getElementById(frameId);
  if (!wrap || !frame) return;
  const scale = wrap.clientWidth / frame.offsetWidth;
  frame.style.transform = 'scale(' + scale + ')';
  wrap.style.height = Math.round(frame.offsetHeight * scale) + 'px';
}

function downloadPosterFrame(frameId, filename, btn) {
  const frame = document.getElementById(frameId);
  const prevTransform = frame.style.transform;
  btn.disabled = true; btn.textContent = 'Generating…';
  frame.style.transform = 'none';
  html2canvas(frame, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
    frame.style.transform = prevTransform;
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
    btn.disabled = false; btn.textContent = 'Download image';
  }).catch(err => {
    frame.style.transform = prevTransform;
    btn.disabled = false; btn.textContent = 'Download image';
    showPageError(err);
  });
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

// ---------- 180s / finishes round-up ----------
// Shared by index.html (the homepage "weekly round-up") and social/results.html
// (the Facebook results card), so both stay in sync rather than drifting apart
// as two separate copies.

// Pulls every 180 and finish out of a set of fixtures, consolidated one line per
// player. Knock Out Cup / Subsidiary Cup fixtures are excluded — 180s and finishes
// only count towards these season-facing stats from league and cup group-stage
// matches (see rule 10.2 on the Rules page); a 180 thrown in a knockout still
// shows on that fixture's own page, just not in either round-up.
function weeklyHighlights(fixtures) {
  const byPlayer = {};
  fixtures.forEach(f => {
    if (f.competition === 'Knock Out Cup' || f.competition === 'Subsidiary Cup') return;
    // The Stats list only has a bare player name, not a team — work out which side
    // fielded them in this fixture from the Games breakdown, same approach as the
    // season leaderboard on the backend.
    const teamByName = {};
    (f.games || []).forEach(g => {
      [g.homePlayer1, g.homePlayer2].forEach(n => { if (n) teamByName[n] = f.homeTeam; });
      [g.awayPlayer1, g.awayPlayer2].forEach(n => { if (n) teamByName[n] = f.awayTeam; });
    });
    (f.stats || []).forEach(s => {
      if (!s.name) return;
      const team = teamByName[s.name] || '';
      const key = team + '||' + s.name;
      if (!byPlayer[key]) byPlayer[key] = { name: s.name, team, oneEighties: 0, bestFinish: null };
      if (s.type === '180') byPlayer[key].oneEighties++;
      else if (s.type === 'finish' && s.value) {
        const v = Number(s.value);
        if (byPlayer[key].bestFinish === null || v > byPlayer[key].bestFinish) byPlayer[key].bestFinish = v;
      }
    });
  });
  return Object.values(byPlayer)
    .filter(p => p.oneEighties > 0 || p.bestFinish)
    .sort((a, b) => b.oneEighties - a.oneEighties || (b.bestFinish || 0) - (a.bestFinish || 0) || a.name.localeCompare(b.name));
}

// Shared markup for a weeklyHighlights() list — used on both the homepage round-up
// and the Facebook results card, which each supply their own CSS for
// .highlight-list / .highlight-row / .chip.gold to fit their own look. Returns ''
// when there's nothing to show, so callers can hide their wrapper entirely.
function highlightsHtml(list) {
  if (!list.length) return '';
  return '<div class="highlight-list">' + list.map(p => {
    const badges = [];
    if (p.oneEighties) badges.push(`<span class="chip gold">${p.oneEighties > 1 ? p.oneEighties + '&times; ' : ''}180</span>`);
    if (p.bestFinish) badges.push(`<span class="chip gold">${p.bestFinish} checkout</span>`);
    return `
    <div class="highlight-row">
      <span class="highlight-name">${escapeHtml(p.name)}</span>
      ${p.team ? `<span class="highlight-team">${escapeHtml(p.team)}</span>` : ''}
      ${badges.join('')}
    </div>`;
  }).join('') + '</div>';
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
