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

  function currentFile() {
    var path = location.pathname.split('/').pop();
    return path || 'index.html'; // "/" or "" (root URL with no filename) is the home page
  }

  function currentNavTarget() {
    var file = currentFile();
    return CURRENT_OVERRIDES[file] || file;
  }

  function headerInnerHtml() {
    var here = currentNavTarget();
    var navHtml = NAV_LINKS.map(function (link) {
      var href = link[0], label = link[1];
      var cls = href === here ? ' class="current"' : '';
      return '<a href="' + href + '"' + cls + '>' + label + '</a>';
    }).join('\n      ');
    return '' +
      '<div class="inner">' +
      '<div class="brand-row">' +
      '<img src="assets/logo.png" alt="" class="site-logo" width="35" height="48">' +
      '<div>' +
      '<h1><a href="index.html">Market Cross Darts League</a></h1>' +
      '<div class="tagline">News, fixtures, results &amp; the league table</div>' +
      '</div>' +
      '</div>' +
      '<nav class="site">\n      ' + navHtml + '\n    </nav>' +
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
