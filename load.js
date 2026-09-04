/* load.js — the prototype toolbar's loader: the ONE file a static prototype
   includes. It decides where the bar comes from and loads it synchronously
   (document.write), so the bar exists before the page content parses.

   Where from — the CDN-with-local-fallback pattern:
     deployed   the PUBLISHED toolbar first, from its release line
                https://effectory-ux.github.io/prototype-toolbar/v<MAJOR>/ — so a
                toolbar release reaches every prototype without touching it;
                this folder's vendored copy if that fails to load.
     dev host   this folder's vendored copy first (instant, works offline);
                the published one if the copy is missing.
     override   a source set once with ?proto-toolbar-src=http://localhost:8790/
                (kept in localStorage; ?proto-toolbar-src=off forgets it) — for
                working on the toolbar itself and seeing it in a real prototype.

   The bar compares its own version with the published one and shows an
   Update hint when this folder's copy is behind (refresh it with update.sh).
   The link decides who gets the bar: a host with a key loads it only for a
   URL carrying ?<key>-toolbar-active — localhost included — so a tester's
   page never even requests the toolbar. A host without a key gets it on dev
   hosts. */
(function () {
  var MAJOR = "1"; /* the release line this copy follows; update.sh keeps it in step */
  var HOSTED = "https://effectory-ux.github.io/prototype-toolbar/v" + MAJOR + "/";
  var C = window.PROTO_TOOLBAR || {};
  function isDevHost() {
    var h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "[::1]" || /\.local$/.test(h) ||
      /^192\.168\./.test(h) || /^10\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  }
  var params;
  try { params = new URLSearchParams(location.search); }
  catch (e) { params = { has: function () { return false; }, get: function () { return null; } }; }
  if (C.key ? !params.has(C.key + "-toolbar-active") : !isDevHost()) {
    /* A tester's page: the bar is not loaded, but the API a page may call
       exists, answering with the config's defaults — page code needs no `if`. */
    if (!window.ProtoToolbar) window.ProtoToolbar = {
      active: false, isDevHost: isDevHost, version: null,
      edge: function (k) { var d = (C.edgeCases || []).filter(function (e) { return e.key === k; })[0]; return !!(d && d.on); },
      variant: function (k) { var d = (C.variants || []).filter(function (v) { return v.key === k; })[0]; return !!(d && (typeof d.on === "function" ? d.on(new URL(location.href)) : d.on)); },
      startAt: function (f) { return f; }, startPath: function () { return null; }, seen: function () { return {}; },
      plainLink: function (h) { return h || location.href; }, carry: function (h) { return h; }
    };
    return;
  }

  var me = document.currentScript && document.currentScript.src;
  var LOCAL = me ? me.slice(0, me.lastIndexOf("/") + 1) : "toolbar/";
  /* The override is a script source written into the page, so only an http(s)
     URL is accepted — and on a deployed site only one on your own machine. */
  function okSource(u) {
    try {
      var p = new URL(u);
      if (p.protocol !== "http:" && p.protocol !== "https:") return null;
      if (!isDevHost() && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(p.hostname)) return null;
      return p.href.replace(/\/?$/, "/");
    } catch (e) { return null; }
  }
  var override = null;
  try {
    var q = params.get("proto-toolbar-src");
    if (q === "off") localStorage.removeItem("proto-toolbar.src");
    else if (q && okSource(q)) localStorage.setItem("proto-toolbar.src", okSource(q));
    override = okSource(localStorage.getItem("proto-toolbar.src") || "");
  } catch (e) {}
  var sources = override ? [override, LOCAL] : isDevHost() ? [LOCAL, HOSTED] : [HOSTED, LOCAL];
  window.PROTO_TOOLBAR_LOADER = { major: MAJOR, hosted: HOSTED, local: LOCAL, override: override, sources: sources, used: null };

  function tags(base) {
    base = String(base).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "%3C");
    return '<link rel="stylesheet" href="' + base + 'prototype-bar.css"><script src="' + base + 'prototype-bar.js"><\/script>';
  }
  document.write(tags(sources[0]));
  /* Runs after the first source had its turn: did it define the bar? If not,
     the fallback gets written in — the classic CDN-with-local-fallback check. */
  document.write('<script>(function(L){if(window.ProtoToolbar){L.used=L.sources[0];}else{L.used=L.sources[1];document.write(' +
    JSON.stringify(tags(sources[1])).replace(/<\//g, "<\\/") + ');}})(window.PROTO_TOOLBAR_LOADER)<\/script>');
})();
