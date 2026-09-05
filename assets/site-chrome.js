// Shared site header & footer for Market Cross Darts League.
//
// Every page includes an empty <header class="site" id="site-header"></header>
// and <footer class="site" id="site-footer"></footer>, plus this script. Add a
// new page to the site by adding it to NAV_LINKS below (or leave it out of NAV_LINKS
// entirely for a page that shouldn't appear in the menu, like fixture.html) — no
// other page needs to change.
(function () {
  var NAV_LINKS = [
    ['index.html', 'Home'],
    ['fixtures.html', 'Fixtures &amp; Results'],
    ['players.html', 'Player Stats'],
    ['teams.html', 'Teams'],
    ['cups.html', 'Cups'],
    ['rules.html', 'Rules'],
    ['honours.html', 'Previous Winners'],
    ['contacts.html', 'Contacts'],
  ];

  // Pages that aren't in the menu themselves but belong under one of the links
  // above (an individual fixture or team page belongs under its listing page),
  // so that link still highlights as "current" while looking at the detail page.
  var CURRENT_OVERRIDES = {
    'fixture.html': 'fixtures.html',
    'team.html': 'teams.html',
  };

  var FACEBOOK_URL = 'https://www.facebook.com/marketcrossinvitationdartleague';
  var FACEBOOK_ICON_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M13.5 21v-7.5h2.5l.4-3H13.5V8.5c0-.87.24-1.46 1.49-1.46H16.5V4.35' +
    'C16.18 4.31 15.09 4.2 13.82 4.2c-2.65 0-4.46 1.62-4.46 4.6V10.5H7v3h2.36V21h4.14z"/></svg>';

  function currentFile() {
    var path = location.pathname.split('/').pop();
    return path || 'index.html'; // "/" or "" (root URL with no filename) is the home page
  }

  function currentNavTarget() {
    var file = currentFile();
    return CURRENT_OVERRIDES[file] || file;
  }

  // Season sponsor badge, top-right of the header. To swap or remove the
  // sponsor in future, this is the only place that needs to change.
  var SPONSOR = { name: 'Trebles', logo: 'assets/sponsor-trebles.png' };

  function sponsorBadgeHtml() {
    if (!SPONSOR) return '';
    return '<div class="sponsor-badge">' +
      '<span class="sponsor-label">Sponsored by</span>' +
      '<img src="' + SPONSOR.logo + '" alt="' + SPONSOR.name + '" class="sponsor-logo">' +
      '</div>';
  }

  function headerInnerHtml() {
    var here = currentNavTarget();
    var navHtml = NAV_LINKS.map(function (link) {
      var href = link[0], label = link[1];
      var cls = href === here ? ' class="current"' : '';
      return '<a href="' + href + '"' + cls + '>' + label + '</a>';
    }).join('\n      ');
    var facebookLink = '<a href="' + FACEBOOK_URL + '" target="_blank" rel="noopener" ' +
      'class="icon-link" aria-label="Market Cross Darts League on Facebook">' + FACEBOOK_ICON_SVG + '</a>';
    return '' +
      '<div class="inner">' +
      '<div class="header-top">' +
      '<div class="brand-row">' +
      '<img src="assets/logo.png" alt="" class="site-logo" width="35" height="48">' +
      '<div>' +
      '<h1><a href="index.html">Market Cross Darts League</a></h1>' +
      '<div class="tagline">News, fixtures, results, league tables and stats</div>' +
      '</div>' +
      '</div>' +
      sponsorBadgeHtml() +
      '</div>' +
      '<nav class="site">\n      ' + navHtml + '\n      ' + facebookLink + '\n    </nav>' +
      '</div>';
  }

  function footerInnerHtml() {
    return "Market Cross Darts League &mdash; data updates automatically from the league's results sheet.";
  }

  // The header placeholder is already in the DOM by the time this script runs
  // (the <script> tag sits right after it in every page), so it can be filled
  // in immediately — no flash of a missing header while the rest of the page loads.
  var headerEl = document.getElementById('site-header');
  if (headerEl) headerEl.innerHTML = headerInnerHtml();

  // The footer placeholder is further down the page, past this <script> tag, so
  // it isn't in the DOM yet — fill it in once the whole document has parsed.
  document.addEventListener('DOMContentLoaded', function () {
    var footerEl = document.getElementById('site-footer');
    if (footerEl) footerEl.innerHTML = footerInnerHtml();
  });
})();
