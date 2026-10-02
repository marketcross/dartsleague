/**
 * MARKET CROSS DARTS LEAGUE — Captain Results Portal
 * ---------------------------------------------------
 * This is a container-bound Apps Script: it lives inside, and only works inside,
 * the Google Sheet you paste it into (Extensions > Apps Script).
 *
 * ONE-TIME SETUP
 *   1. Run `setup` once (pick it from the function dropdown above the toolbar, click ▶ Run).
 *      It creates every tab this needs. Safe to re-run later — it won't wipe existing data.
 *   2. Add your teams to the Teams tab (one team name per row).
 *   3. Add fixtures to the Fixtures tab — just the Date, HomeTeam, AwayTeam columns, one row per
 *      fixture. Leave FixtureID and Status blank.
 *   4. From the spreadsheet's menu bar, use "Market Cross Darts League > Sync fixtures". This
 *      generates a FixtureID for every new row and creates its 9 game rows on the Games tab.
 *   5. Deploy: Deploy > New deployment > type "Web app" > Execute as "Me" > Who has access "Anyone"
 *      > Deploy. Copy the URL it gives you and send that to captains.
 *
 * Re-running `syncFixtures` later (e.g. adding a fixture mid-season) only touches new rows —
 * existing fixtures and their results are left alone.
 */

const SHEET = {
  TEAMS: 'Teams',
  PLAYERS: 'Players',
  FIXTURES: 'Fixtures',
  GAMES: 'Games',
  STATS: 'Stats',
  TABLE: 'LeagueTable',
  NEWS: 'News',
  COMMITTEE: 'Committee',
  HONOURS: 'Honours',
};

// 3 pairs games, then 6 singles games — 9 games per fixture, 1 league point per game won.
const GAMES_PER_FIXTURE = [
  { n: 1, type: 'Pairs' }, { n: 2, type: 'Pairs' }, { n: 3, type: 'Pairs' },
  { n: 4, type: 'Singles' }, { n: 5, type: 'Singles' }, { n: 6, type: 'Singles' },
  { n: 7, type: 'Singles' }, { n: 8, type: 'Singles' }, { n: 9, type: 'Singles' },
];

// ---------- ONE-TIME SETUP ----------

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Force UK date parsing/display (DD/MM/YYYY) so typed dates never get misread as US-style.
  if (ss.getSpreadsheetLocale() !== 'en_GB') ss.setSpreadsheetLocale('en_GB');
  // Division is free text on purpose (like Honours' Competition column) — "Division 1"
  // / "Division 2" today, but nothing stops you renaming or adding one later. Captain and
  // VenueAddress are both optional — leave either blank and that team simply won't show
  // that detail on the Contacts page.
  ensureSheet_(ss, SHEET.TEAMS, ['TeamName', 'Division', 'Captain', 'VenueAddress']);
  ensureSheet_(ss, SHEET.PLAYERS, ['TeamName', 'PlayerName', 'Archived']);
  // Competition is added on the END, not inserted in the middle — every other column
  // keeps the exact same position, so nothing that already writes to specific Fixtures
  // columns (syncFixtures, submitFixture, etc.) needs to change. Leave it BLANK for a
  // normal weekly league fixture (its division is worked out from the two teams' own
  // Division); only fill it in for a cup fixture: "Cup" for the group stage, or
  // "Knock Out Cup" / "Subsidiary Cup" for that competition's knockout matches.
  ensureSheet_(ss, SHEET.FIXTURES, ['FixtureID', 'Date', 'HomeTeam', 'AwayTeam', 'Status', 'HomePoints', 'AwayPoints', 'SubmittedAt', 'Competition']);
  const gamesSheet = ensureSheet_(ss, SHEET.GAMES, ['FixtureID', 'GameNumber', 'Type', 'HomePlayer1', 'HomePlayer2', 'AwayPlayer1', 'AwayPlayer2', 'Winner', 'Score']);
  // Force these columns to plain text — otherwise Sheets can auto-convert a score
  // like "2-1" into an actual date (it looks like a day-month pattern) and silently
  // corrupt it.
  gamesSheet.getRange(2, 4, Math.max(gamesSheet.getMaxRows() - 1, 1), 6).setNumberFormat('@');
  const statsSheet = ensureSheet_(ss, SHEET.STATS, ['StatID', 'FixtureID', 'PlayerName', 'Type', 'Value', 'LoggedAt']);
  // Same fix as the Games sheet above, for the same reason: a "180" here can otherwise get
  // auto-converted to the number 180 and silently stop matching.
  statsSheet.getRange(2, 4, Math.max(statsSheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  // One combined sheet, tagged by Competition ("Division 1" / "Division 2" / "Cup") —
  // simplest way to show all three tables without needing three separate tabs. This
  // sheet is just a convenience snapshot for glancing at in the spreadsheet itself;
  // the live website always computes its tables fresh, it never reads this sheet.
  ensureSheet_(ss, SHEET.TABLE, ['Competition', 'TeamName', 'Played', 'Won', 'Lost', 'Points', 'GamesWon', 'GamesLost', 'GameDiff']);
  ensureSheet_(ss, SHEET.NEWS, ['Date', 'Headline', 'Body']);
  ensureSheet_(ss, SHEET.COMMITTEE, ['Role', 'Name', 'Email', 'Phone']);
  // Competition is free text on purpose — "League" today, or "Division 1" / "Division 2"
  // if the league splits later, plus whatever cups/pairs/singles competitions you run.
  // One row per competition per season; leave RunnerUp blank if you don't want to record one.
  ensureSheet_(ss, SHEET.HONOURS, ['Season', 'Competition', 'Winner', 'RunnerUp']);
  SpreadsheetApp.getActiveSpreadsheet().toast('Add your teams to the Teams tab, then fixtures to the Fixtures tab.', 'Setup complete', 8);
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeaders = headers.every((h, i) => firstRow[i] === h);
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ---------- SPREADSHEET MENU ----------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Market Cross Darts League')
    .addItem('Run setup (first time only)', 'setup')
    .addItem('Set season access code', 'setPasscode')
    .addItem('Sync fixtures (generate IDs + games)', 'syncFixtures')
    .addItem('Recalculate league table', 'recalcLeagueTable')
    .addItem('Show cup knockout pairings', 'showCupKnockoutPairings')
    .addItem('Merge duplicate players', 'mergePlayers')
    .addItem('Clear demo data (start new season)', 'clearDemoData')
    .addToUi();
}

// ---------- CLEAR DEMO DATA ----------
// Wipes every row (keeping headers) from the sheets that hold season-to-season
// playing data, ready to start entering the real new season. Deliberately leaves
// Committee and Honours alone — those hold real, already-curated information
// (the committee's contact details, the season-by-season history), not demo data,
// so a "start new season" reset must never touch them.
function clearDemoData() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    'Clear demo data',
    'This permanently removes every row from Teams, Players, Fixtures, Games, Stats, ' +
      'LeagueTable and News — ready for the new season.\n\n' +
      'Committee and Honours are left untouched.\n\n' +
      "This cannot be undone — make sure you don't still need any of it. Continue?",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [SHEET.TEAMS, SHEET.PLAYERS, SHEET.FIXTURES, SHEET.GAMES, SHEET.STATS, SHEET.TABLE, SHEET.NEWS].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  });

  ss.toast(
    'Demo data cleared. Add your real teams to the Teams tab, then fixtures to the Fixtures tab, then run "Sync fixtures".',
    'Ready for the new season', 10
  );
}

// ---------- MERGE DUPLICATE PLAYERS ----------
// Deliberately a spreadsheet-menu function, not something exposed on the captain
// portal or player admin page — it only ever runs for someone who has this Sheet
// open with edit access (you, or anyone you've specifically shared it with), which
// is a completely different, much narrower audience than the season passcode
// everyone on portal.html/admin.html shares. Nothing needed to build for that beyond
// putting it here.
function mergePlayers() {
  const ui = SpreadsheetApp.getUi();

  const teamResult = ui.prompt('Merge duplicate players — step 1 of 3', 'Team name (exactly as it appears on the Teams tab):', ui.ButtonSet.OK_CANCEL);
  if (teamResult.getSelectedButton() !== ui.Button.OK) return;
  const team = teamResult.getResponseText().trim();
  if (!getTeams().includes(team)) {
    ui.alert('No team called "' + team + '" was found on the Teams tab — check the spelling and try again.');
    return;
  }

  const keepResult = ui.prompt('Merge duplicate players — step 2 of 3', 'Name to KEEP (the correct spelling) for ' + team + ':', ui.ButtonSet.OK_CANCEL);
  if (keepResult.getSelectedButton() !== ui.Button.OK) return;
  const keepName = keepResult.getResponseText().trim();

  const dupResult = ui.prompt('Merge duplicate players — step 3 of 3', 'Duplicate name to merge INTO "' + keepName + '" (this one will be removed from the roster afterwards):', ui.ButtonSet.OK_CANCEL);
  if (dupResult.getSelectedButton() !== ui.Button.OK) return;
  const dupName = dupResult.getResponseText().trim();

  if (!keepName || !dupName) { ui.alert('Both names are required.'); return; }
  if (keepName === dupName) { ui.alert('Those are the same name — nothing to merge.'); return; }

  const rosterNames = getAllPlayers_(team).map(p => p.PlayerName);
  if (!rosterNames.includes(keepName)) {
    ui.alert('"' + keepName + '" isn\'t on the ' + team + ' roster — check the spelling (capitalisation included) and try again.');
    return;
  }
  if (!rosterNames.includes(dupName)) {
    ui.alert('"' + dupName + '" isn\'t on the ' + team + ' roster — check the spelling and try again.');
    return;
  }

  // Cross-reference the Fixtures sheet so every rename below can be scoped to games
  // and stats that actually belong to THIS team — if the exact same name also
  // belongs to a genuinely different person on another team (which does happen in
  // this league), their games and stats must be left completely untouched.
  const fixturesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.FIXTURES);
  const fixturesData = fixturesSheet.getDataRange().getValues();
  const fixtureTeams = {}; // fixtureId -> { home, away }
  for (let r = 1; r < fixturesData.length; r++) {
    fixtureTeams[fixturesData[r][0]] = { home: fixturesData[r][2], away: fixturesData[r][3] };
  }

  const gamesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.GAMES);
  const gamesData = gamesSheet.getDataRange().getValues();
  let gameCells = 0;

  // Which fixtures did "dupName" actually play in FOR THIS TEAM — used again below
  // to scope the Stats rename correctly (the Stats sheet has no team column of its
  // own, only a fixture + player name).
  const dupFixturesForTeam = {};
  for (let r = 1; r < gamesData.length; r++) {
    const fx = fixtureTeams[gamesData[r][0]];
    if (!fx) continue;
    if (fx.home === team && (gamesData[r][3] === dupName || gamesData[r][4] === dupName)) dupFixturesForTeam[gamesData[r][0]] = true;
    if (fx.away === team && (gamesData[r][5] === dupName || gamesData[r][6] === dupName)) dupFixturesForTeam[gamesData[r][0]] = true;
  }

  for (let r = 1; r < gamesData.length; r++) {
    const fx = fixtureTeams[gamesData[r][0]];
    if (!fx) continue;
    if (fx.home === team) {
      [3, 4].forEach(c => { if (gamesData[r][c] === dupName) { gamesData[r][c] = keepName; gameCells++; } });
    }
    if (fx.away === team) {
      [5, 6].forEach(c => { if (gamesData[r][c] === dupName) { gamesData[r][c] = keepName; gameCells++; } });
    }
  }

  const statsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.STATS);
  const statsData = statsSheet.getDataRange().getValues();
  let statRows = 0;
  for (let r = 1; r < statsData.length; r++) {
    if (statsData[r][2] === dupName && dupFixturesForTeam[statsData[r][1]]) statRows++; // PlayerName col 2, FixtureID col 1
  }

  const confirm = ui.alert(
    'Confirm merge',
    'This will rename "' + dupName + '" to "' + keepName + '" in ' + gameCells + ' game result(s) and ' + statRows +
      ' logged stat(s) belonging to ' + team + ', then remove "' + dupName + '" from the ' + team + ' roster.' +
      (gameCells === 0 && statRows === 0 ? '\n\n(No games or stats found for this name on this team yet — it will just be removed from the roster.)' : '') +
      '\n\nThis cannot be undone — continue?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  gamesSheet.getRange(1, 1, gamesData.length, gamesData[0].length).setValues(gamesData);

  for (let r = 1; r < statsData.length; r++) {
    if (statsData[r][2] === dupName && dupFixturesForTeam[statsData[r][1]]) statsData[r][2] = keepName;
  }
  statsSheet.getRange(1, 1, statsData.length, statsData[0].length).setValues(statsData);

  const playersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.PLAYERS);
  const playersData = playersSheet.getDataRange().getValues();
  for (let r = playersData.length - 1; r >= 1; r--) {
    if (playersData[r][0] === team && playersData[r][1] === dupName) {
      playersSheet.deleteRow(r + 1);
      break;
    }
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Merged "' + dupName + '" into "' + keepName + '" — ' + gameCells + ' game result(s) and ' + statRows + ' stat(s) updated.',
    'Merge complete', 8
  );
}

// ---------- ACCESS CODE ----------
// A single season-wide code, set by the league admin from this menu, that every
// captain enters once in the portal (then it's remembered on their device). This is
// not meant to be strong security — just a way to stop a stray link ending up in the
// wrong hands — so it's stored as a script property, not anything more elaborate.

function setPasscode() {
  const ui = SpreadsheetApp.getUi();
  const current = PropertiesService.getScriptProperties().getProperty('SEASON_PASSCODE');
  const result = ui.prompt(
    'Season access code',
    (current ? 'An access code is already set. ' : 'No access code is set yet — captains can get straight in. ') +
      'Enter the code captains should use this season (leave blank and click OK to remove it):',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;
  const code = result.getResponseText().trim();
  if (!code) {
    PropertiesService.getScriptProperties().deleteProperty('SEASON_PASSCODE');
    SpreadsheetApp.getActiveSpreadsheet().toast('Access code removed — the portal is now open to anyone with the link.', 'Done', 6);
    return;
  }
  PropertiesService.getScriptProperties().setProperty('SEASON_PASSCODE', code);
  SpreadsheetApp.getActiveSpreadsheet().toast('Access code set. Share it with your captains separately from the portal link.', 'Done', 6);
}

function checkPasscode(code) {
  const saved = PropertiesService.getScriptProperties().getProperty('SEASON_PASSCODE');
  if (!saved) return true; // no code configured — don't lock anyone out
  if (String(code || '').trim() !== saved) {
    throw new Error("That code isn't right — check with your league admin.");
  }
  return true;
}

// ---------- FIXTURES ADMIN ----------

function syncFixtures() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fixturesSheet = ss.getSheetByName(SHEET.FIXTURES);
  const gamesSheet = ss.getSheetByName(SHEET.GAMES);
  const range = fixturesSheet.getDataRange();
  const data = range.getValues(); // one read for the whole tab, not one per row

  const gameRowsToAppend = [];
  let created = 0;

  for (let r = 1; r < data.length; r++) {
    const [fixtureId, , home, away] = data[r];
    if (!home || !away) continue;   // blank row, skip
    if (fixtureId) continue;        // already synced, skip

    const newId = 'FX' + (r + 1);   // stable — based on this row's position
    data[r][0] = newId;             // FixtureID column, updated in memory
    data[r][4] = 'Not started';     // Status column, updated in memory
    GAMES_PER_FIXTURE.forEach(g => gameRowsToAppend.push([newId, g.n, g.type, '', '', '', '', '', '']));
    created++;
  }

  if (created === 0) {
    SpreadsheetApp.getActiveSpreadsheet().toast('No new fixtures to sync — every row already has an ID, or a Date/HomeTeam/AwayTeam is missing on some row.', 'Sync fixtures', 8);
    return;
  }

  range.setValues(data); // one write for every fixture row, however many there are
  if (gameRowsToAppend.length) {
    gamesSheet.getRange(gamesSheet.getLastRow() + 1, 1, gameRowsToAppend.length, 9).setValues(gameRowsToAppend);
  }
  SpreadsheetApp.getActiveSpreadsheet().toast(created + ' fixture(s) synced.', 'Sync fixtures', 8);
}

// ---------- WEB APP ENTRY POINT ----------

function doGet(e) {
  const page = e && e.parameter && e.parameter.page;
  if (page === 'admin') {
    return HtmlService.createHtmlOutputFromFile('Admin')
      .setTitle('Market Cross Darts League — Player Admin')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (page === 'api') {
    // Public, read-only JSON for the league website (GitHub Pages) to fetch. No passcode —
    // this only ever exposes fixtures/results/stats that are already meant to be public.
    // Served from a short-lived cache when possible — see getPublicDataJsonCached_.
    return ContentService.createTextOutput(getPublicDataJsonCached_())
      .setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Market Cross Darts League — Captain Portal')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- RPC ENDPOINT (called by the website's portal.html / admin.html) ----------
// The captain portal and player admin used to be served AS Apps Script HTML pages
// (Index.html / Admin.html above) and talked to this script via google.script.run.
// That works fine on desktop, but Apps Script's HtmlService page-serving mechanism
// (it redirects the browser through a second Google domain to actually deliver the
// page) is known to be unreliable on iOS Safari/WebKit — it can just fail to load
// with a generic Google error, for reasons outside anyone's control. So the portal
// and admin UI now live as ordinary pages on the GitHub Pages website instead, and
// talk to this script only via background fetch() calls to this one RPC endpoint —
// the same mechanism the public read-only site has always used successfully for
// ?page=api, just extended to also accept write actions via POST.
//
// Index.html/Admin.html above are left in place and still work if visited directly
// (harmless to keep as a fallback) but nothing links to them any more.

// Read-only functions: no passcode required (matches the old behaviour, where the
// captain portal always loaded teams/fixtures before the passcode was entered).
const RPC_READ_FUNCTIONS = {
  getTeams: getTeams,
  getFixturesForTeam: getFixturesForTeam,
  getRoster: getRoster,
  getAdminRoster: getAdminRoster,
  getFixtureDraft: getFixtureDraft,
};

// Write functions: require the correct season passcode on every call, not just once
// at the gate. Calling this endpoint directly (bypassing the site) is easy for anyone
// who looks at the site's JS, so unlike the old google.script.run version, the code
// is now actually enforced server-side rather than being a client-side-only gate.
const RPC_WRITE_FUNCTIONS = {
  addPlayer: addPlayer,
  adminAddPlayer: adminAddPlayer,
  setPlayerArchived: setPlayerArchived,
  saveGame: saveGame,
  addStat: addStat,
  updateStat: updateStat,
  deleteStat: deleteStat,
  submitFixture: submitFixture,
};

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'Malformed request.' });
  }
  return handleRpc_(payload);
}

function handleRpc_(payload) {
  const fn = payload && payload.fn;
  const args = (payload && Array.isArray(payload.args)) ? payload.args : [];
  try {
    if (fn === 'checkPasscode') {
      checkPasscode(args[0]);
      return jsonOutput_({ ok: true, result: true });
    }
    if (Object.prototype.hasOwnProperty.call(RPC_READ_FUNCTIONS, fn)) {
      return jsonOutput_({ ok: true, result: RPC_READ_FUNCTIONS[fn].apply(null, args) });
    }
    if (Object.prototype.hasOwnProperty.call(RPC_WRITE_FUNCTIONS, fn)) {
      checkPasscode(payload && payload.passcode); // throws if a code is set and this doesn't match
      return jsonOutput_({ ok: true, result: runWriteLocked_(fn, args) });
    }
    return jsonOutput_({ ok: false, error: 'Unknown request.' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: (err && err.message) ? err.message : String(err) });
  }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- ONE WRITE AT A TIME ----------
// On a match night several captains can be saving at the very same moment. Without
// this, some writes can collide and silently lose data — e.g. two 180s logged in the
// same second both pick the same "next empty row" on the Stats tab and one overwrites
// the other, or a stat deleted while another is being added removes the wrong row.
//
// So every write from the portal/admin page now queues for a lock and runs one after
// another. Each write only takes a moment, so a queue of 6+ captains clears in a few
// seconds; nobody notices the wait, and nothing is ever overwritten. If the lock ever
// can't be had within 30 seconds the save is refused with a clear message instead of
// being half-done, and nothing in the sheet is changed by that attempt.
function runWriteLocked_(fn, args) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    throw new Error('The results sheet is busy right now — please try that again in a moment. Anything already saved is safe.');
  }
  try {
    const result = RPC_WRITE_FUNCTIONS[fn].apply(null, args);
    SpreadsheetApp.flush(); // make sure this write is fully in the sheet before the next one starts
    // A submitted result should show on the public site straight away, so throw away
    // the cached copy now rather than waiting for it to expire.
    if (fn === 'submitFixture') clearPublicDataCache_();
    return result;
  } finally {
    lock.releaseLock();
  }
}

// ---------- READ ENDPOINTS (called from Index.html) ----------

// Optionally takes already-fetched Teams rows — see getTeamDivisions_ above for why.
function getTeams(rows) {
  return (rows || sheetRows_(SHEET.TEAMS)).map(r => r.TeamName).filter(Boolean);
}

// name -> division ("Division 1" / "Division 2" / whatever's typed in). A team with
// no Division filled in yet comes back as '' rather than undefined, so downstream
// code can always safely compare/group by it without an extra null check.
//
// Optionally takes already-fetched Teams rows (getPublicData reads the Teams sheet
// once and passes them to every helper that needs it, rather than each helper
// re-reading the same sheet) — every other caller keeps working exactly as before,
// since leaving this blank just falls back to reading the sheet itself.
function getTeamDivisions_(rows) {
  const map = {};
  (rows || sheetRows_(SHEET.TEAMS)).forEach(r => { if (r.TeamName) map[r.TeamName] = r.Division || ''; });
  return map;
}

// One row per team with a captain and/or venue address filled in, for the Contacts page —
// a team with neither is left out entirely rather than showing an empty row.
// Same optional-pre-fetched-rows pattern as getTeamDivisions_ above.
function getTeamContacts_(rows) {
  return (rows || sheetRows_(SHEET.TEAMS))
    .filter(r => r.TeamName && (r.Captain || r.VenueAddress))
    .map(r => ({ team: r.TeamName, captain: r.Captain || '', venueAddress: r.VenueAddress || '' }))
    .sort((a, b) => a.team.localeCompare(b.team));
}

// Fixture Date cells are usually real Sheets dates, but if one was ever typed/pasted as
// plain text (e.g. UK-style "21/08/2026"), JavaScript's native Date parser misreads it
// (treats "21" as a month) and silently produces an invalid date. Parse defensively.
function parseDate_(raw) {
  if (raw instanceof Date && !isNaN(raw)) return raw;
  const str = String(raw || '').trim();
  if (!str) return null;
  const uk = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (uk) {
    let dd = Number(uk[1]), mm = Number(uk[2]), yyyy = uk[3];
    if (yyyy.length === 2) yyyy = '20' + yyyy;
    const d = new Date(Number(yyyy), mm - 1, dd);
    if (!isNaN(d)) return d;
  }
  const fallback = new Date(str);
  return isNaN(fallback) ? null : fallback;
}

function getFixturesForTeam(teamName) {
  const allGames = sheetRows_(SHEET.GAMES);
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const fixtures = sheetRows_(SHEET.FIXTURES)
    .filter(f => f.HomeTeam === teamName || f.AwayTeam === teamName)
    .map(f => ({ f, parsedDate: parseDate_(f.Date) }))
    .filter(({ parsedDate }) => {
      if (!parsedDate) return false;
      const fixtureDay = Utilities.formatDate(parsedDate, tz, 'yyyy-MM-dd');
      // Dates have no time-of-day, so compare by calendar day rather than exact
      // milliseconds: yesterday/today/tomorrow covers "within 24h before or after".
      const dayDiff = Math.round((new Date(fixtureDay) - new Date(today)) / 86400000);
      return Math.abs(dayDiff) <= 1;
    })
    .sort((a, b) => a.parsedDate - b.parsedDate)
    .map(({ f }) => f);

  return fixtures.map(f => {
    const games = allGames.filter(g => g.FixtureID === f.FixtureID);
    const parsedDate = parseDate_(f.Date);
    return {
      fixtureId: f.FixtureID,
      date: parsedDate ? Utilities.formatDate(parsedDate, tz, 'EEE d MMM yyyy') : String(f.Date),
      isHome: f.HomeTeam === teamName,
      opponent: f.HomeTeam === teamName ? f.AwayTeam : f.HomeTeam,
      status: f.Status,
      gamesEntered: games.filter(g => g.Winner).length,
      gamesTotal: games.length,
    };
  });
}

function isArchived_(v) {
  return v === true || v === 'TRUE' || v === 'true';
}

function getAllPlayers_(teamName) {
  return sheetRows_(SHEET.PLAYERS).filter(p => p.TeamName === teamName);
}

// Roster used everywhere in the captain portal (player pickers, squad lists) — archived
// players are hidden here but still exist in the sheet, so past results referencing them
// are untouched.
function getRoster(teamName) {
  return getAllPlayers_(teamName).filter(p => !isArchived_(p.Archived)).map(p => p.PlayerName);
}

// Full roster including archived players, for the admin page only.
function getAdminRoster(teamName) {
  return getAllPlayers_(teamName)
    .map(p => ({ name: p.PlayerName, archived: isArchived_(p.Archived) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function addPlayerRow_(teamName, playerName) {
  const raw = String(playerName || '').trim().replace(/\s+/g, ' ');
  const parts = raw.split(' ').filter(Boolean);
  if (parts.length < 2 || parts.some(p => p.length < 2)) {
    throw new Error('Please enter a first name and surname.');
  }
  // Capitalise each word (e.g. "john smith" -> "John Smith").
  const clean = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
  // Check against EVERY player (including archived) so re-typing an archived name never
  // creates a duplicate row — it just stays archived until someone unarchives it.
  const existing = getAllPlayers_(teamName).map(p => p.PlayerName);
  if (!existing.includes(clean)) {
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.PLAYERS).appendRow([teamName, clean, false]);
  }
  return clean;
}

function addPlayer(teamName, playerName) {
  addPlayerRow_(teamName, playerName);
  return getRoster(teamName);
}

function adminAddPlayer(teamName, playerName) {
  addPlayerRow_(teamName, playerName);
  return getAdminRoster(teamName);
}

function setPlayerArchived(teamName, playerName, archived) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.PLAYERS);
  const data = sheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (data[r][0] === teamName && data[r][1] === playerName) {
      sheet.getRange(r + 1, 3).setValue(!!archived);
      return getAdminRoster(teamName);
    }
  }
  throw new Error('Could not find that player — try refreshing the page.');
}

function getFixtureDraft(fixtureId) {
  const fixture = sheetRows_(SHEET.FIXTURES).find(f => f.FixtureID === fixtureId);
  if (!fixture) {
    throw new Error('Could not find that fixture (ID "' + fixtureId + '"). It may have been deleted, or its row moved — go back and pick it again from the list.');
  }
  const games = sheetRows_(SHEET.GAMES)
    .filter(g => g.FixtureID === fixtureId)
    .sort((a, b) => a.GameNumber - b.GameNumber);
  if (games.length === 0) {
    throw new Error('This fixture has no game rows yet — run "Sync fixtures" from the menu, then try again.');
  }
  const stats = sheetRows_(SHEET.STATS).filter(s => s.FixtureID === fixtureId);
  // Hand-rolled JSON rather than returning the object directly: google.script.run's own
  // serialization has been observed silently turning nested objects (this one carries a
  // raw Date from the Fixtures row) into a bare null on the client. Stringifying here and
  // parsing on the client sidesteps that entirely.
  return JSON.stringify({ games, stats });
}

// ---------- WRITE ENDPOINTS ----------

function saveGame(fixtureId, gameNumber, gameData) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.GAMES);
  const data = sheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (data[r][0] === fixtureId && Number(data[r][1]) === Number(gameNumber)) {
      const targetRange = sheet.getRange(r + 1, 4, 1, 6);
      // Belt-and-braces: force plain text on this row every time, so a score like "2-1"
      // can never get silently reinterpreted by Sheets as a date, even on a sheet that
      // predates the setup()-time formatting, and self-heals a previously corrupted row.
      targetRange.setNumberFormat('@');
      targetRange.setValues([[
        gameData.homePlayer1 || '', gameData.homePlayer2 || '',
        gameData.awayPlayer1 || '', gameData.awayPlayer2 || '',
        gameData.winner || '', gameData.score || '',
      ]]);
      break;
    }
  }
  markInProgress_(fixtureId);
  return true;
}

function markInProgress_(fixtureId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.FIXTURES);
  const data = sheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (data[r][0] === fixtureId && data[r][4] === 'Not started') {
      sheet.getRange(r + 1, 5).setValue('In progress');
      break;
    }
  }
}

function addStat(fixtureId, playerName, type, value) {
  if (type === 'finish') {
    const v = Number(value);
    if (!v || v < 100 || v > 170) throw new Error('Checkout must be between 100 and 170.');
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.STATS);
  const statId = Utilities.getUuid();
  const row = sheet.getLastRow() + 1;
  // Force the Type column to plain text before writing — otherwise Sheets silently stores
  // a "180" entry as the number 180 instead of the text "180", which then fails to match
  // the string comparison downstream (a player's 180s go uncounted with no error shown).
  sheet.getRange(row, 4).setNumberFormat('@');
  sheet.getRange(row, 1, 1, 6).setValues([[statId, fixtureId, playerName, type, value || '', new Date()]]);
  markInProgress_(fixtureId);
  return statId;
}

function updateStat(statId, value) {
  const v = Number(value);
  if (!v || v < 100 || v > 170) throw new Error('Checkout must be between 100 and 170.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.STATS);
  const data = sheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (data[r][0] === statId) { sheet.getRange(r + 1, 5).setValue(v); break; }
  }
  return true;
}

function deleteStat(statId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.STATS);
  const data = sheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (data[r][0] === statId) { sheet.deleteRow(r + 1); break; }
  }
  return true;
}

function isGameComplete_(g) {
  if (!g.HomePlayer1 || !g.AwayPlayer1) return false;
  if (g.Type === 'Pairs' && (!g.HomePlayer2 || !g.AwayPlayer2)) return false;
  return !!(g.Winner && g.Score);
}

function submitFixture(fixtureId) {
  const games = sheetRows_(SHEET.GAMES).filter(g => g.FixtureID === fixtureId);
  const missing = games.filter(g => !isGameComplete_(g)).length;
  if (missing > 0) {
    throw new Error(missing + ' of ' + games.length + ' games still need a player and result before this can be submitted.');
  }
  const homePoints = games.filter(g => g.Winner === 'Home').length;
  const awayPoints = games.filter(g => g.Winner === 'Away').length;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.FIXTURES);
  const data = sheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (data[r][0] === fixtureId) {
      sheet.getRange(r + 1, 5, 1, 4).setValues([['Submitted', homePoints, awayPoints, new Date()]]);
      break;
    }
  }
  recalcLeagueTable();
  return { homePoints, awayPoints, gamesEntered: games.filter(g => g.Winner).length, gamesTotal: games.length };
}

// ---------- LEAGUE TABLE ----------

// Pure computation (no sheet writes, no sheet reads of its own — callers pass in
// already-fetched rows) so both recalcLeagueTable() and the public website API can
// share the same logic. Each sheet should only be read once per web request; reading
// it fresh inside every helper is what was making the site slow to load.
//
// Tiebreaker is game difference (games won minus games lost), not leg difference —
// winning a game 2-0 counts exactly the same as winning it 2-1, matching how points
// are awarded (1 point per game won, regardless of the leg score within it).
function computeLeagueTable_(teams, allFixtures, allGamesIn) {
  const fixtures = allFixtures.filter(f => f.Status === 'Submitted');
  const allGames = allGamesIn;

  const stats = {};
  teams.forEach(t => { stats[t] = { played: 0, won: 0, lost: 0, points: 0, gamesWon: 0, gamesLost: 0, legsFor: 0, legsAgainst: 0 }; });

  fixtures.forEach(f => {
    const games = allGames.filter(g => g.FixtureID === f.FixtureID);
    const homeGamesWon = games.filter(g => g.Winner === 'Home').length;
    const awayGamesWon = games.filter(g => g.Winner === 'Away').length;

    if (stats[f.HomeTeam]) {
      stats[f.HomeTeam].played++; stats[f.HomeTeam].points += homeGamesWon;
      stats[f.HomeTeam].gamesWon += homeGamesWon; stats[f.HomeTeam].gamesLost += awayGamesWon;
    }
    if (stats[f.AwayTeam]) {
      stats[f.AwayTeam].played++; stats[f.AwayTeam].points += awayGamesWon;
      stats[f.AwayTeam].gamesWon += awayGamesWon; stats[f.AwayTeam].gamesLost += homeGamesWon;
    }
    if (homeGamesWon > awayGamesWon) {
      if (stats[f.HomeTeam]) stats[f.HomeTeam].won++;
      if (stats[f.AwayTeam]) stats[f.AwayTeam].lost++;
    } else if (awayGamesWon > homeGamesWon) {
      if (stats[f.AwayTeam]) stats[f.AwayTeam].won++;
      if (stats[f.HomeTeam]) stats[f.HomeTeam].lost++;
    }

    // Leg difference — the final tie-break (see compareStandings_ below) — comes from
    // each individual game's leg score (Score is stored "winnerLegs-loserLegs", e.g.
    // "2-1", from whichever side actually won that game per Winner).
    games.forEach(g => {
      if (!g.Winner || !g.Score) return;
      const parts = String(g.Score).split('-');
      const winLegs = Number(parts[0]), loseLegs = Number(parts[1]);
      if (!Number.isFinite(winLegs) || !Number.isFinite(loseLegs)) return;
      const homeLegs = g.Winner === 'Home' ? winLegs : loseLegs;
      const awayLegs = g.Winner === 'Home' ? loseLegs : winLegs;
      if (stats[f.HomeTeam]) { stats[f.HomeTeam].legsFor += homeLegs; stats[f.HomeTeam].legsAgainst += awayLegs; }
      if (stats[f.AwayTeam]) { stats[f.AwayTeam].legsFor += awayLegs; stats[f.AwayTeam].legsAgainst += homeLegs; }
    });
  });

  const rows = teams.map(t => {
    const s = stats[t];
    return {
      team: t, played: s.played, won: s.won, lost: s.lost, points: s.points,
      gamesWon: s.gamesWon, gamesLost: s.gamesLost, gameDiff: s.gamesWon - s.gamesLost,
      legDiff: s.legsFor - s.legsAgainst,
    };
  });

  // Position is decided by points (games won) first. Ties are broken, in order, by:
  // head-to-head result (only when the two tied teams have actually played each
  // other within this fixture set — a division's own fixtures, or the cup group
  // stage, whichever this table is being built for), then total match wins, then
  // leg difference. See cups.html for the plain-language version of this.
  rows.sort((a, b) => compareStandings_(a, b, fixtures));
  return rows;
}

function compareStandings_(a, b, fixtures) {
  if (b.points !== a.points) return b.points - a.points;

  const h2h = fixtures.filter(f =>
    (f.HomeTeam === a.team && f.AwayTeam === b.team) || (f.HomeTeam === b.team && f.AwayTeam === a.team)
  );
  if (h2h.length) {
    let aPts = 0, bPts = 0;
    h2h.forEach(f => {
      const homePts = Number(f.HomePoints) || 0, awayPts = Number(f.AwayPoints) || 0;
      if (f.HomeTeam === a.team) { aPts += homePts; bPts += awayPts; }
      else { bPts += homePts; aPts += awayPts; }
    });
    if (aPts !== bPts) return bPts - aPts;
  }

  if (b.won !== a.won) return b.won - a.won;
  return b.legDiff - a.legDiff;
}

// Splits the single flat table above into however many divisions are actually in
// use (from whatever's typed into Teams' Division column — not hard-coded to
// exactly two, in case that ever changes) plus one table for the cup's group stage.
// A normal weekly league fixture has a blank Competition and is placed by looking up
// both teams' Division; a cup group-stage fixture is any fixture tagged Competition
// === "Cup" — its own combined table decides the Knock Out Cup / Subsidiary Cup
// knockout pairings (see cupKnockoutPairings_ below).
// teamDivisions is optional — pass it in when the caller has already fetched the
// Teams sheet itself (as getPublicData does) to avoid reading it again; every
// existing caller that doesn't pass it keeps working exactly as before.
function computeStandingsGroups_(teams, allFixtures, allGames, teamDivisionsIn) {
  const teamDivisions = teamDivisionsIn || getTeamDivisions_();
  const leagueFixtures = allFixtures.filter(f => !f.Competition);
  const cupFixtures = allFixtures.filter(f => f.Competition === 'Cup');

  const divisionNames = [...new Set(teams.map(t => teamDivisions[t]).filter(Boolean))].sort();
  const divisions = divisionNames.map(name => {
    const divTeams = teams.filter(t => teamDivisions[t] === name);
    const divFixtures = leagueFixtures.filter(f => teamDivisions[f.HomeTeam] === name && teamDivisions[f.AwayTeam] === name);
    return { name, table: computeLeagueTable_(divTeams, divFixtures, allGames) };
  });

  const cupTeams = [...new Set(cupFixtures.flatMap(f => [f.HomeTeam, f.AwayTeam]))];
  const cup = { table: computeLeagueTable_(cupTeams, cupFixtures, allGames) };

  return { divisions, cup };
}

// Once the cup group stage is finished, works out who plays who in the knockout
// rounds purely from league position — 1st plays 4th, 2nd plays 3rd for the Knock
// Out Cup; 5th plays 8th, 6th plays 7th for the Subsidiary Cup (higher position
// named first/home throughout). Returns null if there aren't at least 8 teams with
// a settled position yet, rather than guessing.
function cupKnockoutPairings_(cupTable) {
  if (cupTable.length < 8) return null;
  const t = i => cupTable[i].team;
  return {
    knockOutCup: [{ home: t(0), away: t(3) }, { home: t(1), away: t(2) }],
    subsidiaryCup: [{ home: t(4), away: t(7) }, { home: t(5), away: t(6) }],
  };
}

function recalcLeagueTable() {
  const teams = getTeams();
  const { divisions, cup } = computeStandingsGroups_(teams, sheetRows_(SHEET.FIXTURES), sheetRows_(SHEET.GAMES));
  const rows = [];
  divisions.forEach(d => d.table.forEach(r => rows.push([d.name, r.team, r.played, r.won, r.lost, r.points, r.gamesWon, r.gamesLost, r.gameDiff])));
  cup.table.forEach(r => rows.push(['Cup', r.team, r.played, r.won, r.lost, r.points, r.gamesWon, r.gamesLost, r.gameDiff]));
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.TABLE);
  const clearRows = Math.max(sheet.getLastRow() - 1, 1);
  sheet.getRange(2, 1, clearRows, 9).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, 9).setValues(rows);
}

// Shows the admin what the cup group-stage table currently produces for the Knock
// Out Cup / Subsidiary Cup semi-final draw. Deliberately does NOT create the
// Fixtures rows itself — the admin reviews the pairings here, then types the two
// ties into the Fixtures sheet by hand (Competition = "Knock Out Cup" /
// "Subsidiary Cup") and runs "Sync fixtures" as normal, so there's always a human
// check before anything gets written, and no risk of clashing with existing
// FixtureIDs.
function showCupKnockoutPairings() {
  const ui = SpreadsheetApp.getUi();
  const teams = getTeams();
  const { cup } = computeStandingsGroups_(teams, sheetRows_(SHEET.FIXTURES), sheetRows_(SHEET.GAMES));
  if (cup.table.length < 8) {
    ui.alert(
      'Cup knockout pairings',
      'The cup group stage needs 8 teams with cup results recorded before knockout pairings can be worked out. ' +
      'Right now there ' + (cup.table.length === 1 ? 'is' : 'are') + ' only ' + cup.table.length +
      ' team' + (cup.table.length === 1 ? '' : 's') + ' showing in the cup table — make sure every team\'s 4 cup ' +
      'fixtures have been synced and results submitted.',
      ui.ButtonSet.OK
    );
    return;
  }
  const pairings = cupKnockoutPairings_(cup.table);
  const lines = [
    'Based on the current cup table (higher position listed first / at home):',
    '',
    'Knock Out Cup semi-finals:',
    '  ' + pairings.knockOutCup[0].home + ' v ' + pairings.knockOutCup[0].away,
    '  ' + pairings.knockOutCup[1].home + ' v ' + pairings.knockOutCup[1].away,
    '',
    'Subsidiary Cup semi-finals:',
    '  ' + pairings.subsidiaryCup[0].home + ' v ' + pairings.subsidiaryCup[0].away,
    '  ' + pairings.subsidiaryCup[1].home + ' v ' + pairings.subsidiaryCup[1].away,
    '',
    'These aren\'t created automatically — add them as new rows on the Fixtures sheet ' +
    '(Competition = "Knock Out Cup" or "Subsidiary Cup"), then run "Sync fixtures" as normal.',
  ];
  ui.alert('Cup knockout pairings', lines.join('\n'), ui.ButtonSet.OK);
}

// ---------- PUBLIC WEBSITE API ----------
// One consolidated read-only JSON payload for the GitHub Pages website — simplest
// approach for a league this size: the whole site fetches this once per page load
// and renders everything client-side, rather than exposing lots of small endpoints.

// Keyed by "team||name", not just name — two genuinely different people who happen
// to share an exact name on DIFFERENT teams (this does happen in a league this size)
// must not have their games/180s/finishes silently blended into one combined line.
function computePlayerStats_(allFixtures, allGamesIn, allStatsIn) {
  const fixtures = allFixtures.filter(f => f.Status === 'Submitted');
  const fixtureById = {};
  fixtures.forEach(f => { fixtureById[f.FixtureID] = f; });
  const allGames = allGamesIn.filter(g => fixtureById[g.FixtureID] && g.Winner);
  const allStats = allStatsIn.filter(s => fixtureById[s.FixtureID]);

  const byKey = {};
  function keyOf(team, name) { return team + '||' + name; }
  function row(name, team) {
    const k = keyOf(team || '', name);
    if (!byKey[k]) {
      byKey[k] = { name, team: team || '', singlesPlayed: 0, singlesWon: 0, pairsPlayed: 0, pairsWon: 0, oneEighties: 0, finishes: [] };
    }
    return byKey[k];
  }

  allGames.forEach(g => {
    const f = fixtureById[g.FixtureID];
    const isPairs = g.Type === 'Pairs';
    const homeWon = g.Winner === 'Home';
    [
      { name: g.HomePlayer1, team: f.HomeTeam, won: homeWon },
      { name: g.HomePlayer2, team: f.HomeTeam, won: homeWon },
      { name: g.AwayPlayer1, team: f.AwayTeam, won: !homeWon },
      { name: g.AwayPlayer2, team: f.AwayTeam, won: !homeWon },
    ].forEach(p => {
      if (!p.name) return;
      const r = row(p.name, p.team);
      if (isPairs) { r.pairsPlayed++; if (p.won) r.pairsWon++; }
      else { r.singlesPlayed++; if (p.won) r.singlesWon++; }
    });
  });

  // The Stats sheet only ever records a bare player name against a fixture, not a
  // team — so work out which team actually fielded that name in that specific
  // fixture (from the Games rows just processed above) before folding a 180 or
  // finish into the right person's line. If a name is genuinely ambiguous (fielded
  // by both sides in the same match — vanishingly rare, but handled rather than
  // guessed at) it falls back to an unattributed "no team" line instead of a guess.
  const teamsByFixtureAndName = {};
  allGames.forEach(g => {
    const f = fixtureById[g.FixtureID];
    if (!teamsByFixtureAndName[g.FixtureID]) teamsByFixtureAndName[g.FixtureID] = {};
    const map = teamsByFixtureAndName[g.FixtureID];
    [[g.HomePlayer1, f.HomeTeam], [g.HomePlayer2, f.HomeTeam], [g.AwayPlayer1, f.AwayTeam], [g.AwayPlayer2, f.AwayTeam]]
      .forEach(pair => {
        const name = pair[0], team = pair[1];
        if (!name) return;
        if (!map[name]) map[name] = {};
        map[name][team] = true;
      });
  });

  allStats.forEach(s => {
    if (!s.PlayerName) return;
    // 180s and highest checkouts are only ever league/cup-group-stage records (see rule
    // 10.2 on the Rules page) — a 180 hit in a Knock Out Cup or Subsidiary Cup tie is real
    // and still shows on that fixture's own page, but must not feed the season leaderboard.
    const f = fixtureById[s.FixtureID];
    if (f && (f.Competition === 'Knock Out Cup' || f.Competition === 'Subsidiary Cup')) return;
    const candidates = (teamsByFixtureAndName[s.FixtureID] && teamsByFixtureAndName[s.FixtureID][s.PlayerName]) || {};
    const candidateTeams = Object.keys(candidates);
    const team = candidateTeams.length === 1 ? candidateTeams[0] : '';
    const r = row(s.PlayerName, team);
    // String(...) rather than a strict === — Sheets can hand this back as the number 180
    // instead of the text "180" (see addStat), so compare loosely and it self-heals either way.
    if (String(s.Type) === '180') r.oneEighties++;
    else if (String(s.Type) === 'finish' && s.Value) r.finishes.push(Number(s.Value));
  });

  return Object.values(byKey).map(r => ({
    ...r,
    played: r.singlesPlayed + r.pairsPlayed,
    won: r.singlesWon + r.pairsWon,
    bestFinish: r.finishes.length ? Math.max.apply(null, r.finishes) : null,
  })).sort((a, b) => a.name.localeCompare(b.name) || a.team.localeCompare(b.team));
}

// ---------- PUBLIC DATA CACHE ----------
// Serves the exact same JSON getPublicData() always produced, from a server-side
// cache whenever possible, so most website visitors get an instant answer instead
// of every one of them paying for a full ~6 second rebuild from the sheet.
//
// Why the old 20-second cache never actually worked: CacheService refuses anything
// over 100KB per entry, and this season's data had grown just past that — so the
// put() quietly failed every time and every visitor got a full rebuild. Now the JSON
// is gzip-compressed (typically ~10x smaller) and, if it's somehow still too big,
// split across several cache entries — so it always fits.
//
// Two copies are kept:
//   - FRESH: up to 60 seconds old. Normal visitors get this.
//   - STALE: the last good copy, kept for up to 6 hours. Only used for the few
//     seconds while someone else is already rebuilding a fresh one, so a burst of
//     visitors on match night doesn't all trigger their own rebuild at once.
// A submitted result clears the fresh copy straight away (see runWriteLocked_), so
// it shows up for the very next visitor.
//
// This only ever READS the sheet. CacheService and LockService are standard, already
// available services — no new permissions, no re-authorisation prompt on redeploy.
// To undo it completely, change the one line in doGet() back to
// `JSON.stringify(getPublicData())`.
const PUBLIC_CACHE_FRESH_SECONDS = 60;
const PUBLIC_CACHE_STALE_SECONDS = 6 * 60 * 60; // CacheService's maximum
const CACHE_CHUNK_CHARS = 90000;                 // stays safely under the 100KB-per-entry limit

function getPublicDataJsonCached_() {
  const cache = CacheService.getScriptCache();
  const fresh = cacheGetBig_(cache, 'publicFresh');
  if (fresh) return fresh;

  // No fresh copy. If someone else is already rebuilding it, hand back the last good
  // copy immediately instead of piling on another rebuild.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    const stale = cacheGetBig_(cache, 'publicStale');
    if (stale) return stale;
    // Nothing cached at all yet — wait (up to 20s) for the rebuild already in progress.
    if (lock.tryLock(20000)) {
      try {
        const justBuilt = cacheGetBig_(cache, 'publicFresh');
        if (justBuilt) return justBuilt;
      } finally { lock.releaseLock(); }
    }
    return JSON.stringify(getPublicData());
  }
  try {
    // Re-check: another request may have finished rebuilding while we got the lock.
    const justBuilt = cacheGetBig_(cache, 'publicFresh');
    if (justBuilt) return justBuilt;
    const json = JSON.stringify(getPublicData());
    cachePutBig_(cache, 'publicFresh', json, PUBLIC_CACHE_FRESH_SECONDS);
    cachePutBig_(cache, 'publicStale', json, PUBLIC_CACHE_STALE_SECONDS);
    return json;
  } finally {
    lock.releaseLock();
  }
}

function clearPublicDataCache_() {
  try { CacheService.getScriptCache().remove('publicFresh_n'); } catch (e) { /* nothing cached — fine */ }
}

// Stores a (possibly large) string compressed and split into <=90KB pieces. Any failure
// just means "not cached this time" — the caller already has the right answer.
function cachePutBig_(cache, key, text, seconds) {
  try {
    const packed = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(text, 'application/json')).getBytes());
    const entries = {};
    let n = 0;
    for (let i = 0; i < packed.length; i += CACHE_CHUNK_CHARS) entries[key + '_' + (n++)] = packed.slice(i, i + CACHE_CHUNK_CHARS);
    entries[key + '_n'] = String(n); // written in the same call, so pieces and count always match
    cache.putAll(entries, seconds);
  } catch (e) { /* too big or cache unavailable — safe to ignore */ }
}

function cacheGetBig_(cache, key) {
  try {
    const n = Number(cache.get(key + '_n'));
    if (!n) return null;
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(key + '_' + i);
    const parts = cache.getAll(keys);
    let packed = '';
    for (let i = 0; i < n; i++) {
      if (parts[keys[i]] == null) return null; // a piece expired early — treat as not cached
      packed += parts[keys[i]];
    }
    const blob = Utilities.newBlob(Utilities.base64Decode(packed), 'application/x-gzip');
    return Utilities.ungzip(blob).getDataAsString('UTF-8');
  } catch (e) { return null; }
}

function getPublicData() {
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  // Read every sheet exactly once — this used to fetch Fixtures/Games/Stats/Teams
  // several times over (once per helper), which is what made the page slow to load.
  const rawTeams = sheetRows_(SHEET.TEAMS);
  const teams = getTeams(rawTeams);
  const teamDivisions = getTeamDivisions_(rawTeams);
  const teamContacts = getTeamContacts_(rawTeams);
  const rawFixtures = sheetRows_(SHEET.FIXTURES);
  const allGames = sheetRows_(SHEET.GAMES);
  const allStatRows = sheetRows_(SHEET.STATS);
  const rawPlayers = sheetRows_(SHEET.PLAYERS);
  const rawNews = sheetRows_(SHEET.NEWS);
  const rawCommittee = sheetRowsOptional_(SHEET.COMMITTEE);
  const rawHonours = sheetRowsOptional_(SHEET.HONOURS);

  const news = rawNews
    .filter(n => n.Headline)
    .map(n => ({ parsedDate: parseDate_(n.Date), headline: n.Headline, body: n.Body || '' }))
    .filter(n => n.parsedDate)
    .sort((a, b) => b.parsedDate - a.parsedDate)
    .map(n => ({ date: Utilities.formatDate(n.parsedDate, tz, 'd MMM yyyy'), headline: n.headline, body: n.body }));

  const committee = rawCommittee
    .filter(c => c.Name)
    .map(c => ({ role: c.Role || '', name: c.Name, email: c.Email || '', phone: c.Phone || '' }));

  // Sorted newest-season-first isn't reliable to do server-side (seasons are free text like
  // "2024/25"), so hand over every row as-is and let the site sort/group it — it's already
  // built to derive its filter list and grouping from whatever's actually in the data.
  const honours = rawHonours
    .filter(h => h.Season && h.Competition)
    .map(h => ({ season: String(h.Season), competition: h.Competition, winner: h.Winner || '', runnerUp: h.RunnerUp || '' }));

  const fixtures = rawFixtures
    .map(f => ({ f, parsedDate: parseDate_(f.Date) }))
    .filter(x => x.parsedDate)
    .sort((a, b) => a.parsedDate - b.parsedDate)
    .map(({ f, parsedDate }) => {
      const submitted = f.Status === 'Submitted';
      // Live scores: a fixture's games and stats are now also published while it's
      // "In progress", so the website can show the running score on match night. The
      // site clearly labels these as Live / not final, and nothing that feeds the
      // tables or season leaderboards changes — computeLeagueTable_ and
      // computePlayerStats_ still only ever count Submitted fixtures. The official
      // homePoints/awayPoints below also stay null until the result is submitted.
      const showGames = submitted || f.Status === 'In progress';
      const games = allGames.filter(g => g.FixtureID === f.FixtureID);
      return {
        fixtureId: f.FixtureID,
        dateISO: Utilities.formatDate(parsedDate, tz, 'yyyy-MM-dd'),
        date: Utilities.formatDate(parsedDate, tz, 'EEE d MMM yyyy'),
        homeTeam: f.HomeTeam,
        awayTeam: f.AwayTeam,
        // '' for a normal weekly league fixture; "Cup" / "Knock Out Cup" / "Subsidiary
        // Cup" for a cup fixture — see computeStandingsGroups_ for how this is used.
        competition: f.Competition || '',
        status: f.Status,
        homePoints: submitted ? f.HomePoints : null,
        awayPoints: submitted ? f.AwayPoints : null,
        // Per-game breakdown and stats logged: shown once a fixture is under way (live)
        // or submitted (final) — see showGames above.
        games: showGames ? games.map(g => ({
          n: g.GameNumber, type: g.Type,
          homePlayer1: g.HomePlayer1 || null, homePlayer2: g.HomePlayer2 || null,
          awayPlayer1: g.AwayPlayer1 || null, awayPlayer2: g.AwayPlayer2 || null,
          score: g.Score || null,
          winnerTeam: g.Winner === 'Home' ? f.HomeTeam : (g.Winner === 'Away' ? f.AwayTeam : null),
        })) : [],
        stats: showGames ? allStatRows.filter(s => s.FixtureID === f.FixtureID).map(s => ({
          name: s.PlayerName, type: s.Type, value: s.Value || null,
        })) : [],
      };
    });

  const playerStats = computePlayerStats_(rawFixtures, allGames, allStatRows);
  const top180s = playerStats.filter(p => p.oneEighties > 0)
    .sort((a, b) => b.oneEighties - a.oneEighties || a.name.localeCompare(b.name))
    .slice(0, 3).map(p => ({ name: p.name, team: p.team, count: p.oneEighties }));
  const topFinishes = playerStats.filter(p => p.bestFinish)
    .sort((a, b) => b.bestFinish - a.bestFinish || a.name.localeCompare(b.name))
    .slice(0, 3).map(p => ({ name: p.name, team: p.team, value: p.bestFinish }));

  // Current (active, non-archived) squads, for the team pages.
  const rosters = {};
  rawPlayers.forEach(p => {
    if (isArchived_(p.Archived) || !p.TeamName) return;
    if (!rosters[p.TeamName]) rosters[p.TeamName] = [];
    rosters[p.TeamName].push(p.PlayerName);
  });
  Object.keys(rosters).forEach(t => rosters[t].sort((a, b) => a.localeCompare(b)));

  const { divisions, cup } = computeStandingsGroups_(teams, rawFixtures, allGames, teamDivisions);

  return {
    generatedAt: new Date().toISOString(),
    teams,
    teamDivisions,
    news,
    // Division 1 / Division 2 (etc) tables, each { name, table }, plus the single combined
    // Cup group-stage table (see computeStandingsGroups_) — replaces the old flat
    // leagueTable now that teams can be split across divisions and a cup competition.
    divisions,
    cup,
    fixtures,
    playerStats,
    top180s,
    topFinishes,
    rosters,
    committee,
    teamContacts,
    honours,
    today, // yyyy-MM-dd, so the site can split fixtures into past/upcoming consistently
  };
}

// ---------- HELPERS ----------

// Like sheetRows_, but for optional/supplementary tabs (Committee, Honours) added after the
// original setup — returns [] instead of throwing if someone hasn't re-run setup yet, so a
// site that predates one of these tabs keeps working rather than the whole API erroring out.
function sheetRowsOptional_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  return sheet ? sheetRows_(name) : [];
}

function sheetRows_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Missing "' + name + '" tab — run setup from the menu first.');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1)
    .filter(row => row.some(c => c !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}
