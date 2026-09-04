/* prototype-bar.js — the prototype toolbar for STATIC prototypes: plain HTML
   pages with no build step (the Engage design-system prototypes). It is the
   same bar as PrototypeBar.jsx — same look, same menus, same link contract —
   written in dependency-free vanilla JS so a page can include it with two
   tags. Nothing in here knows any one prototype: everything specific comes
   from `window.PROTO_TOOLBAR`, a small config object the host defines in its
   own file BEFORE this script (see README.md, "Static prototypes").

   Include, right after <body> opens, so the bar renders before the page
   content parses (no pop-in):

     <link rel="stylesheet" href="toolbar/prototype-bar.css" />   (in <head>)
     <script src="proto-config.js"></script>                       (the host's)
     <script src="toolbar/prototype-bar.js"></script>

   Who sees it — the link contract: on a dev host (localhost, 127.0.0.1,
   *.local, a LAN address) always; anywhere else only for a URL carrying
   `?<key>-toolbar-active`. Without the flag this script installs NOTHING —
   no DOM, no listeners, no shortcut — so a tester can never stumble into it.
   Every navigation the bar performs carries the flag along; Share strips it.

   Not here (they need a dev server): inline copy editing, the Piwik event
   layer, dev-server auto-start. Those stay React/Vite features. */
(function () {
  "use strict";
  var VERSION = "1.1.0"; /* stamped by release.sh; compared with the published version.json */
  var C = window.PROTO_TOOLBAR || {};
  var KEY = C.key || "";
  var PREFIX = C.prefix || C.key || "proto"; /* storage namespace: prototypes on one origin must not share it */
  var MY_SRC = (document.currentScript && document.currentScript.src) || ""; /* which source loaded this copy */
  var FLAG = KEY + "-toolbar-active";

  function isDevHost() {
    var h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "[::1]" || /\.local$/.test(h) ||
      /^192\.168\./.test(h) || /^10\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  }
  /* The link decides, everywhere: a host that minted a key shows the bar only
     for a URL carrying the flag — localhost included, so what you see is what
     the URL says. A host without a key (no config) still gets it on dev hosts. */
  function barActive() {
    try { return KEY ? new URLSearchParams(location.search).has(FLAG) : isDevHost(); }
    catch (e) { return false; }
  }

  /* ---- storage: one namespace per prototype ------------------------------ */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(PREFIX + "." + k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(PREFIX + "." + k, v); } catch (e) {} }
  };
  function byKey(list, key) {
    list = list || [];
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
  }

  /* ---- links --------------------------------------------------------------- */
  /* The current address without the toolbar flag: what you hand to a tester. */
  function plainLink(href) {
    try {
      var u = new URL(href || location.href, location.href);
      u.searchParams.delete(FLAG);
      return u.toString().replace(/\?(?=#|$)/, "");
    } catch (e) { return href || location.href; }
  }
  /* A target URL with the flag carried along when this page has it, so the
     bar never vanishes mid-walkthrough. */
  function carry(href) {
    try {
      var u = new URL(href, location.href);
      if (KEY && new URLSearchParams(location.search).has(FLAG) && u.origin === location.origin) {
        u.searchParams.set(FLAG, "");
        return u.toString().replace(FLAG + "=", FLAG);
      }
      return u.toString();
    } catch (e) { return href; }
  }
  function resolve(href) {
    if (typeof href === "function") href = href(new URL(location.href));
    return href instanceof URL ? href.toString() : String(href);
  }
  /* Same page in another version: keep the hash route when the target has none. */
  function withHash(href) {
    try { var u = new URL(href, location.href); if (!u.hash) u.hash = location.hash; return u.toString(); } catch (e) { return href; }
  }
  function samePage(href) {
    try { return new URL(href, location.href).pathname === location.pathname; } catch (e) { return false; }
  }
  /* This page's path relative to the site root — the piece appended to the
     live address for "Share this page". Locally the site root is "/"; on the
     deployed site it is the live URL's own path. */
  function relPath() {
    var p = location.pathname;
    try {
      if (!isDevHost() && C.live) {
        var lp = new URL(C.live).pathname;
        if (p.indexOf(lp) === 0) p = p.slice(lp.length);
      }
    } catch (e) {}
    p = p.replace(/^\/+/, "");
    return /^(index\.html?)?$/.test(p) ? "" : p;
  }
  /* The LIVE address of this prototype (from the host's `live`), opening at
     its start unless `page`, toolbar-free unless `toolbar`. */
  function liveShareUrl(opts) {
    if (!C.live) return null;
    try {
      var u = new URL(C.live);
      if (opts.page) { u.pathname = u.pathname.replace(/\/?$/, "/") + relPath(); u.search = new URL(plainLink()).search; u.hash = location.hash; }
      if (opts.toolbar && KEY) u.search = (u.search ? u.search + "&" : "?") + FLAG;
      return u.toString();
    } catch (e) { return null; }
  }

  /* ---- public API — the host page reads its settings through this -------- */
  var api = {
    active: barActive(),
    isDevHost: isDevHost,
    /* a host's own programmatic navigation keeps the bar: location.href = ProtoToolbar.carry(url).
       Resolved the way the host's browser would — against the document's <base>. */
    carry: function (href) { try { return carry(new URL(resolve(href), document.baseURI).toString()); } catch (e) { return href; } },
    /* edge case on/off (persisted; `on` in the config is the default) */
    edge: function (key) { var d = byKey(C.edgeCases, key); var v = store.get("edge." + key, null); return v === null ? !!(d && d.on) : v === "1"; },
    /* design variant on/off (persisted unless the variant is URL-based) */
    variant: function (key) {
      var d = byKey(C.variants, key);
      if (d && typeof d.on === "function") return !!d.on(new URL(location.href));
      var v = store.get("variant." + key, null);
      return v === null ? !!(d && d.on) : v === "1";
    },
    /* where the prototype should open, as chosen in the Start menu */
    startAt: function (fallback) { return store.get("startAt", fallback); },
    /* a page chosen with "Start on the page I'm on" (a path), or null; an
       index page can send visitors there: location.replace(ProtoToolbar.startPath()) */
    startPath: function () { return store.get("startPath", "") || null; },
    /* every page this prototype has shown in this browser: { path, title, count, lastSeen } */
    seen: function () { try { return JSON.parse(store.get("seen", "{}")); } catch (e) { return {}; } },
    plainLink: plainLink,
    version: VERSION
  };
  /* The host's own same-origin links carry the flag too (capture phase, before
     any router reads the href), so a walkthrough never loses the bar. */
  if (api.active && KEY) {
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a || a.closest(".pbar") || (a.target && a.target !== "_self")) return;
      var raw = a.getAttribute("href") || "";
      if (!raw || raw.charAt(0) === "#" || /^(javascript|mailto|tel):/i.test(raw)) return;
      /* a.href is already resolved against the document's <base>; the raw
         attribute would resolve against the page's own URL and miss */
      var to = carry(a.href);
      if (to !== a.href) a.href = to;
    }, true);
  }
  window.ProtoToolbar = api;

  if (!barActive()) return; /* render nothing at all */

  /* What the bar learns: the pages it has been on. A page no Screens entry
     points to is listed in the Screens menu as "seen here, not in this list". */
  (function recordPage() {
    var seen = api.seen(), k = location.pathname, e = seen[k] || { path: k, count: 0 };
    e.count += 1; e.lastSeen = new Date().toISOString(); e.title = document.title || k.split("/").pop();
    seen[k] = e; store.set("seen", JSON.stringify(seen));
  })();
  /* title may be set later in <head>; refresh it once the page has parsed */
  document.addEventListener("DOMContentLoaded", function () {
    var seen = api.seen(); if (seen[location.pathname]) { seen[location.pathname].title = document.title || seen[location.pathname].title; store.set("seen", JSON.stringify(seen)); }
  });
  /* Pages seen in this browser that no Screens entry points to (the page you
     are on is left out: it will show once you have moved on). */
  function unregisteredPages() {
    var seen = api.seen();
    var listed = {};
    screens.forEach(function (s) { try { listed[new URL(resolve(s.href), location.href).pathname] = true; } catch (e) {} });
    return Object.keys(seen)
      .filter(function (p) { return p.charAt(0) === "/" && !listed[p] && p !== location.pathname; })
      .map(function (p) { return seen[p]; })
      .sort(function (a, b) { return (b.lastSeen || "").localeCompare(a.lastSeen || ""); });
  }

  /* ---- icons: the same glyphs as icons.jsx, inlined ------------------------ */
  var SVG = {
    sliders: '<path d="M18.5 3.33339C18.5 3.88567 18.0523 4.33339 17.5 4.33339L11.6667 4.33339C11.1144 4.33339 10.6667 3.88567 10.6667 3.33339C10.6667 2.7811 11.1144 2.33339 11.6667 2.33339L17.5 2.33339C18.0523 2.33339 18.5 2.7811 18.5 3.33339Z" fill="currentColor"/><path d="M1.49998 3.33339C1.49998 3.88567 1.94769 4.33339 2.49998 4.33339L7.33331 4.33339L7.33331 5.83339C7.33331 6.38567 7.78103 6.83339 8.33331 6.83339C8.8856 6.83339 9.33331 6.38567 9.33331 5.83339L9.33331 0.833389C9.33331 0.281104 8.8856 -0.166611 8.33331 -0.166611C7.78103 -0.166611 7.33331 0.281104 7.33331 0.833389L7.33331 2.33339L2.49998 2.33339C1.94769 2.33339 1.49998 2.7811 1.49998 3.33339Z" fill="currentColor"/><path d="M10 11C10.5523 11 11 10.5523 11 10C11 9.44773 10.5523 9.00001 10 9.00001L2.5 9.00001C1.94772 9.00001 1.5 9.44773 1.5 10C1.5 10.5523 1.94772 11 2.5 11L10 11Z" fill="currentColor"/><path d="M18.5 10C18.5 10.5523 18.0523 11 17.5 11L14.3333 11L14.3333 12.5C14.3333 13.0523 13.8856 13.5 13.3333 13.5C12.781 13.5 12.3333 13.0523 12.3333 12.5L12.3333 7.50001C12.3333 6.94773 12.781 6.50002 13.3333 6.50002C13.8856 6.50002 14.3333 6.94773 14.3333 7.50002L14.3333 9.00002L17.5 9.00002C18.0523 9.00002 18.5 9.44773 18.5 10Z" fill="currentColor"/><path d="M6.66669 13.1666C7.21897 13.1666 7.66669 13.6144 7.66669 14.1666L7.66669 19.1666C7.66669 19.7189 7.21897 20.1666 6.66669 20.1666C6.1144 20.1666 5.66669 19.7189 5.66669 19.1666L5.66669 17.6666L2.50002 17.6666C1.94774 17.6666 1.50002 17.2189 1.50002 16.6666C1.50002 16.1144 1.94774 15.6666 2.50002 15.6666L5.66669 15.6666L5.66669 14.1666C5.66669 13.6144 6.1144 13.1666 6.66669 13.1666Z" fill="currentColor"/><path d="M18.5 16.6666C18.5 17.2189 18.0523 17.6666 17.5 17.6666L10 17.6666C9.44771 17.6666 9 17.2189 9 16.6666C9 16.1144 9.44772 15.6666 10 15.6666L17.5 15.6666C18.0523 15.6666 18.5 16.1144 18.5 16.6666Z" fill="currentColor"/>',
    shapes: '<path fill-rule="evenodd" clip-rule="evenodd" d="M13.8069 9C14.7425 9 15.3129 7.90689 14.817 7.06417L11.0102 0.594671C10.5436 -0.198223 9.45641 -0.198224 8.98984 0.594669L5.18297 7.06417C4.68709 7.90688 5.2575 9 6.19313 9H13.8069ZM12.4587 7L10 2.82161L7.54129 7H12.4587Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M4.5 20C6.98528 20 9 17.9853 9 15.5C9 13.0147 6.98528 11 4.5 11C2.01472 11 0 13.0147 0 15.5C0 17.9853 2.01472 20 4.5 20ZM4.5 18C5.88071 18 7 16.8807 7 15.5C7 14.1193 5.88071 13 4.5 13C3.11929 13 2 14.1193 2 15.5C2 16.8807 3.11929 18 4.5 18Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M12.125 11C11.5037 11 11 11.5037 11 12.125V18.875C11 19.4963 11.5037 20 12.125 20H18.875C19.4963 20 20 19.4963 20 18.875V12.125C20 11.5037 19.4963 11 18.875 11H12.125ZM18 18H13V13H18V18Z" fill="currentColor"/>',
    "clipboard-note": '<path d="M7 9C6.44772 9 6 9.44771 6 10C6 10.5523 6.44772 11 7 11H13C13.5523 11 14 10.5523 14 10C14 9.44771 13.5523 9 13 9H7Z" fill="currentColor"/><path d="M6 14C6 13.4477 6.44772 13 7 13H10C10.5523 13 11 13.4477 11 14C11 14.5523 10.5523 15 10 15H7C6.44772 15 6 14.5523 6 14Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M5 2C5 0.89543 5.89543 0 7 0H13C14.1046 0 15 0.895431 15 2H15.25C16.7688 2 18 3.23122 18 4.75V17.25C18 18.7688 16.7688 20 15.25 20H4.75C3.23122 20 2 18.7688 2 17.25V4.75C2 3.23122 3.23122 2 4.75 2L5 2ZM7 2V4H13V2H7ZM15 4C15 5.10457 14.1046 6 13 6H7C5.89543 6 5 5.10457 5 4H4.75C4.33579 4 4 4.33579 4 4.75V17.25C4 17.6642 4.33579 18 4.75 18H15.25C15.6642 18 16 17.6642 16 17.25V4.75C16 4.33579 15.6642 4 15.25 4H15Z" fill="currentColor"/>',
    "chevron-down": '<path fill-rule="evenodd" clip-rule="evenodd" d="M3.29289 6.29287C3.68342 5.90235 4.31658 5.90235 4.70711 6.29287L10 11.5858L15.2929 6.29287C15.6834 5.90235 16.3166 5.90235 16.7071 6.29287C17.0976 6.6834 17.0976 7.31656 16.7071 7.70709L10.7778 13.6364C10.3482 14.066 9.65176 14.0659 9.22218 13.6364L3.29289 7.70709C2.90237 7.31656 2.90237 6.6834 3.29289 6.29287Z" fill="currentColor"/>',
    randomize: '<path d="M14.8737 1.12621C14.4832 0.735682 13.85 0.735682 13.4595 1.12621C13.069 1.51673 13.069 2.1499 13.4595 2.54042L15.0858 4.16666H5.83333C4.68406 4.16666 3.58186 4.6232 2.7692 5.43586C1.95655 6.24852 1.5 7.35072 1.5 8.49999V10.1667C1.5 10.7189 1.94772 11.1667 2.5 11.1667C3.05228 11.1667 3.5 10.7189 3.5 10.1667V8.49999C3.5 7.88115 3.74583 7.28766 4.18342 6.85007C4.621 6.41249 5.21449 6.16666 5.83333 6.16666H15.0857L13.4595 7.79287C13.069 8.1834 13.069 8.81656 13.4595 9.20709C13.85 9.59761 14.4832 9.59761 14.8737 9.20709L18.201 5.87977C18.2244 5.85678 18.2467 5.83266 18.2677 5.80748C18.3219 5.74277 18.3665 5.67284 18.4017 5.59949C18.4647 5.46852 18.5 5.32171 18.5 5.16666C18.5 5.01593 18.4667 4.873 18.4069 4.74483C18.3681 4.66121 18.317 4.58185 18.2537 4.50944C18.2373 4.49063 18.2202 4.47243 18.2024 4.45489L14.8737 1.12621Z" fill="currentColor"/><path d="M6.54044 10.7929C6.93096 11.1834 6.93096 11.8166 6.54044 12.2071L4.91422 13.8333H14.1667C14.7855 13.8333 15.379 13.5875 15.8166 13.1499C16.2542 12.7123 16.5 12.1188 16.5 11.5V9.83331C16.5 9.28103 16.9477 8.83331 17.5 8.83331C18.0523 8.83331 18.5 9.28103 18.5 9.83331V11.5C18.5 12.6493 18.0435 13.7515 17.2308 14.5641C16.4181 15.3768 15.3159 15.8333 14.1667 15.8333H4.91421L6.54044 17.4595C6.93096 17.8501 6.93096 18.4832 6.54044 18.8738C6.14992 19.2643 5.51675 19.2643 5.12623 18.8738L1.79289 15.5404C1.59763 15.3452 1.5 15.0892 1.5 14.8333C1.5 14.6966 1.52742 14.5664 1.57705 14.4477C1.6232 14.3371 1.6901 14.2331 1.77773 14.1417L1.79474 14.1244L5.12623 10.7929C5.51675 10.4024 6.14992 10.4024 6.54044 10.7929Z" fill="currentColor"/>',
    home: '<path fill-rule="evenodd" clip-rule="evenodd" d="M10.6139 0.877396C10.2528 0.596532 9.74717 0.596532 9.38606 0.877396L1.88606 6.71073C1.64247 6.90019 1.5 7.19149 1.5 7.50008V16.6667C1.5 17.374 1.78095 18.0523 2.28105 18.5524C2.78115 19.0525 3.45942 19.3334 4.16667 19.3334H15.8333C16.5406 19.3334 17.2189 19.0525 17.719 18.5524C18.219 18.0523 18.5 17.374 18.5 16.6667V7.50008C18.5 7.19149 18.3575 6.90019 18.1139 6.71073L10.6139 0.877396ZM3.69526 17.1382C3.57024 17.0131 3.5 16.8436 3.5 16.6667V7.98916L10 2.93361L16.5 7.98917V16.6667C16.5 16.8436 16.4298 17.0131 16.3047 17.1382C16.1797 17.2632 16.0101 17.3334 15.8333 17.3334H13.5V10.0001C13.5 9.44779 13.0523 9.00008 12.5 9.00008H7.5C6.94772 9.00008 6.5 9.44779 6.5 10.0001V17.3334H4.16667C3.98986 17.3334 3.82029 17.2632 3.69526 17.1382ZM11.5 17.3334V11.0001H8.5V17.3334H11.5Z" fill="currentColor"/>',
    check: '<path fill-rule="evenodd" clip-rule="evenodd" d="M17.3737 4.79289C17.7642 5.18342 17.7642 5.81658 17.3737 6.20711L8.20703 15.3738C7.8165 15.7643 7.18334 15.7643 6.79281 15.3738L2.62615 11.2071C2.23562 10.8166 2.23562 10.1834 2.62615 9.79289C3.01667 9.40237 3.64983 9.40237 4.04036 9.79289L7.49992 13.2525L15.9595 4.79289C16.35 4.40237 16.9832 4.40237 17.3737 4.79289Z" fill="currentColor"/>',
    "collapse-right": '<path d="M17.5 18.3334C17.9602 18.3334 18.3333 17.9603 18.3333 17.5L18.3333 2.50002C18.3333 2.03978 17.9602 1.66669 17.5 1.66669C17.0397 1.66669 16.6666 2.03978 16.6666 2.50002L16.6666 17.5C16.6666 17.9603 17.0397 18.3334 17.5 18.3334Z" fill="currentColor"/><path d="M7.74406 14.7559C8.06949 15.0814 8.59713 15.0814 8.92257 14.7559L13.0892 10.5893C13.4147 10.2638 13.4147 9.7362 13.0892 9.41076L8.92257 5.2441C8.59713 4.91866 8.06949 4.91866 7.74406 5.2441C7.41862 5.56953 7.41862 6.09717 7.74406 6.42261L10.4881 9.16669L2.44045 9.16669C2.01309 9.16669 1.66665 9.53978 1.66665 10C1.66665 10.4603 2.01309 10.8334 2.44045 10.8334L10.4881 10.8334L7.74406 13.5774C7.41862 13.9029 7.41862 14.4305 7.74406 14.7559Z" fill="currentColor"/>',
    share: '<path fill-rule="evenodd" clip-rule="evenodd" d="M15.889 4.3564C15.889 5.18614 15.2164 5.85878 14.3867 5.85878C13.5569 5.85878 12.8843 5.18614 12.8843 4.3564C12.8843 3.52665 13.5569 2.85401 14.3867 2.85401C15.2164 2.85401 15.889 3.52665 15.889 4.3564ZM17.889 4.3564C17.889 6.29071 16.321 7.85878 14.3867 7.85878C13.5606 7.85878 12.8013 7.57277 12.2024 7.09438L8.89571 9.41819C9.03789 9.79926 9.11561 10.2117 9.11561 10.6424C9.11561 10.9059 9.0865 11.1627 9.03131 11.4096L11.9936 13.0862C12.6198 12.5001 13.4613 12.1412 14.3867 12.1412C16.321 12.1412 17.889 13.7093 17.889 15.6436C17.889 17.5779 16.321 19.146 14.3867 19.146C12.4523 19.146 10.8843 17.5779 10.8843 15.6436C10.8843 15.3573 10.9186 15.079 10.9835 14.8126L8.05373 13.1545C7.42298 13.7674 6.56217 14.1448 5.61322 14.1448C3.67891 14.1448 2.11084 12.5767 2.11084 10.6424C2.11084 8.70806 3.67891 7.13999 5.61322 7.13999C6.3904 7.13999 7.10845 7.39313 7.68943 7.82144L11.0594 5.45313C10.9458 5.10814 10.8843 4.73945 10.8843 4.3564C10.8843 2.42208 12.4523 0.854012 14.3867 0.854012C16.321 0.854012 17.889 2.42208 17.889 4.3564ZM5.61322 12.1448C6.44297 12.1448 7.11561 11.4721 7.11561 10.6424C7.11561 9.81263 6.44297 9.13999 5.61322 9.13999C4.78348 9.13999 4.11084 9.81263 4.11084 10.6424C4.11084 11.4721 4.78348 12.1448 5.61322 12.1448ZM14.3867 17.146C15.2164 17.146 15.889 16.4733 15.889 15.6436C15.889 14.8139 15.2164 14.1412 14.3867 14.1412C13.5569 14.1412 12.8843 14.8139 12.8843 15.6436C12.8843 16.4733 13.5569 17.146 14.3867 17.146Z" fill="currentColor"/>'
  };
  function ic(name, size) {
    size = size || 14;
    return '<i class="pbar-i"><svg width="' + size + '" height="' + size + '" viewBox="0 0 20 20" fill="none" aria-hidden="true" style="display:block;flex:none">' + (SVG[name] || "") + "</svg></i>";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }

  /* ---- what this page is ---------------------------------------------------- */
  var versions = C.versions || [];
  function matches(m) {
    if (!m) return false;
    if (typeof m === "function") return !!m(new URL(location.href));
    if (m instanceof RegExp) return m.test(location.pathname);
    return location.pathname.indexOf(String(m)) !== -1;
  }
  var version = null;
  for (var vi = 0; vi < versions.length; vi++) if (matches(versions[vi].match)) { version = versions[vi]; break; }
  var badge = version ? version.label : (C.name || "Toolbar");

  var screens = C.screens || [];
  var edges = C.edgeCases || [];
  var variants = C.variants || [];
  var starts = C.startPoints || [];
  var hidden = store.get("barHidden", "0") === "1";
  var openMenu = null;
  var bar = null, peek = null;
  var updateTo = null; /* a newer published version, when this copy is behind */

  /* Version check — the loader (load.js) says where the published release
     line lives and which source actually loaded. When this copy is not the
     published one and is behind it, the bar shows an Update hint. */
  function cmpVer(a, b) {
    a = String(a).split("."); b = String(b).split(".");
    for (var i = 0; i < 3; i++) { var d = (parseInt(a[i], 10) || 0) - (parseInt(b[i], 10) || 0); if (d) return d; }
    return 0;
  }
  var L = window.PROTO_TOOLBAR_LOADER;
  if (L && L.hosted && typeof fetch === "function") {
    setTimeout(function () { /* after the loader's fallback check has run */
      if (MY_SRC.indexOf(L.hosted) === 0 || (L.override && MY_SRC.indexOf(L.override) === 0)) return; /* this IS the published (or your own) copy */
      fetch(L.hosted + "version.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (j && j.version && cmpVer(j.version, VERSION) > 0) { updateTo = j.version; api.published = j.version; if (bar) render(); }
      }).catch(function () {});
    }, 0);
  }

  /* The bar is a real row above the page; fixed layers of the page would
     slide underneath it. Its height is published as --proto-bar-h so the host
     can offset those by exactly that much (0 while collapsed). */
  function publishHeight() {
    var h = hidden || !bar ? 0 : Math.round(bar.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--proto-bar-h", h + "px");
  }
  window.addEventListener("resize", publishHeight);

  function item(cls, attrs, label, right, desc) {
    return '<button class="pbar-item' + (cls ? " " + cls : "") + '" ' + (attrs || "") + ">" +
      '<span class="pbar-item-label">' + esc(label) + "</span>" + (right || "") +
      (desc ? '<span class="pbar-item-desc">' + esc(desc) + "</span>" : "") + "</button>";
  }
  function link(cls, href, label, desc, current) {
    if (current) return '<span class="pbar-item is-on is-current"><span class="pbar-item-label">' + esc(label) + "</span>" + ic("check") +
      (desc ? '<span class="pbar-item-desc">' + esc(desc) + "</span>" : "") + "</span>";
    return '<a class="pbar-item' + (cls ? " " + cls : "") + '" href="' + esc(carry(href)) + '">' +
      '<span class="pbar-item-label">' + esc(label) + "</span>" +
      (desc ? '<span class="pbar-item-desc">' + esc(desc) + "</span>" : "") + "</a>";
  }
  /* a Screens row: the screen to jump to, and in its own column a switch that
     makes it the start (one at a time; switching it off means the default) */
  function screenRow(href, label, desc, cur, startOn, startAttrs) {
    var inner = '<span class="pbar-item-label">' + esc(label) + "</span>" + (cur ? ic("check") : "") +
      (desc ? '<span class="pbar-item-desc">' + esc(desc) + "</span>" : "");
    var main = cur ? '<span class="pbar-row-main is-current">' + inner + "</span>"
      : '<a class="pbar-row-main" href="' + esc(carry(href)) + '">' + inner + "</a>";
    return '<div class="pbar-item pbar-row' + (cur ? " is-current" : "") + '">' + main +
      '<span class="pbar-row-side"><button class="pbar-start' + (startOn ? " is-on" : "") + '" role="switch" aria-checked="' + startOn + '" ' + startAttrs +
      ' aria-label="Start here" title="' + (startOn ? "The prototype opens here — switch off for the default start" : "Open the prototype here") + '"><span class="pbar-switch" aria-hidden="true"></span></button></span></div>';
  }
  function defaultScreen() { return screens.filter(function (s) { return s.default; })[0] || screens[0] || null; }
  /* where the current page lives, without the toolbar flag: what a start remembers */
  function herePath() { try { var u = new URL(api.plainLink()); return u.pathname + u.search; } catch (e) { return location.pathname; } }
  function pathOf(href) { try { var u = new URL(href, location.href); return u.pathname + u.search; } catch (e) { return String(href); } }
  function toggle(on, attrs, label, desc) {
    return '<button class="pbar-item' + (on ? " is-on" : "") + '" role="switch" aria-checked="' + on + '" ' + attrs + ">" +
      '<span class="pbar-item-label">' + esc(label) + '</span><span class="pbar-switch" aria-hidden="true"></span>' +
      (desc ? '<span class="pbar-item-desc">' + esc(desc) + "</span>" : "") + "</button>";
  }

  var MENUS = {
    version: {
      html: function () {
        return '<div class="pbar-menu-head">Prototype versions</div>' +
          '<div class="pbar-menu-note">Compare versions of this prototype. You land on the same screen when the other version has it too.</div>' +
          versions.map(function (v) {
            if (v === version) return link("", "", v.label, v.desc, true);
            return link("", withHash(resolve(v.go)), v.label, v.desc, false).replace('class="pbar-item"', 'class="pbar-item" data-version="' + esc(v.key) + '"');
          }).join("");
      },
      bind: function (slot) {
        if (isDevHost()) return;
        /* Deployed: the registry can run ahead of the deploy — say so instead
           of linking into a 404. */
        slot.querySelectorAll("a[data-version]").forEach(function (a) {
          fetch(a.href, { method: "HEAD" }).then(function (r) { if (!r.ok) throw 0; }).catch(function () {
            var s = el('<span class="pbar-item is-disabled"><span class="pbar-item-label">' + esc(a.querySelector(".pbar-item-label").textContent) + '</span><span class="pbar-item-desc">Not published yet</span></span>');
            a.replaceWith(s);
          });
        });
      }
    },
    screens: {
      /* every screen, with a Start column: the radio marks where the prototype
         opens (one at a time) */
      /* the default start is the first screen (or the one marked default: true):
         its switch is on until another screen is chosen */
      html: function () {
        var sp = api.startPath(), sk = store.get("startAt", "");
        var d = defaultScreen(), defaultPath = d ? pathOf(resolve(d.href)) : "";
        var active = sp || (sk ? "" : defaultPath);
        var out = '<div class="pbar-menu-head pbar-cols"><span>Screens</span><span class="pbar-col-start">Starting point</span></div>';
        screens.forEach(function (s) {
          var href = resolve(s.href), p = pathOf(href);
          var cur = s.match !== undefined ? matches(s.match) : samePage(href);
          out += screenRow(href, s.label, s.desc, cur, p === active, 'data-start-path="' + esc(p) + '"' + (p === defaultPath ? " data-default" : ""));
        });
        if (starts.length) {
          out += '<div class="pbar-menu-head pbar-menu-sub">Start points</div>';
          starts.forEach(function (s) { out += item(!sp && sk === s.key ? "is-on" : "", 'data-start-key="' + esc(s.key) + '"', s.label, !sp && sk === s.key ? ic("check") : "", s.desc); });
        }
        var extra = unregisteredPages();
        if (extra.length) {
          out += '<div class="pbar-menu-head pbar-menu-sub">Seen here, not in this list</div>' +
            '<div class="pbar-menu-note">Pages this prototype has shown that no entry above points to. Register them in the config, or jump there.</div>';
          extra.forEach(function (e) { out += screenRow(e.path, e.title || e.path, e.path, false, sp === e.path, 'data-start-path="' + esc(e.path) + '"'); });
        }
        return out;
      },
      bind: function (slot, close, reopen) {
        function setStart(path, key) { store.set("startPath", path || ""); store.set("startAt", key || ""); reopen(); }
        slot.querySelectorAll("[data-start-path]").forEach(function (b) {
          b.addEventListener("click", function () {
            /* the default's switch stays on; any other switch on → that start, off → back to the default */
            var on = b.classList.contains("is-on"), isDefault = b.hasAttribute("data-default");
            setStart(on || isDefault ? "" : b.getAttribute("data-start-path"), "");
          });
        });
        slot.querySelectorAll("[data-start-key]").forEach(function (b) { b.addEventListener("click", function () { setStart("", b.getAttribute("data-start-key")); }); });
      }
    },
    edges: {
      html: function () {
        return '<div class="pbar-menu-head">Edge cases</div>' +
          '<div class="pbar-menu-note">Flip these to show a screen both ways. They reload the page.</div>' +
          edges.map(function (e) { return toggle(api.edge(e.key), 'data-edge="' + esc(e.key) + '"', e.label, e.desc); }).join("");
      },
      bind: function (slot) {
        slot.querySelectorAll("[data-edge]").forEach(function (b) {
          b.addEventListener("click", function () {
            var k = b.getAttribute("data-edge"), e = byKey(edges, k), on = !api.edge(k);
            store.set("edge." + k, on ? "1" : "0");
            if (typeof e.apply === "function") { e.apply(on); render(); } else location.reload();
          });
        });
      }
    },
    variants: {
      html: function () {
        return '<div class="pbar-menu-head">Design variants under exploration</div>' +
          '<div class="pbar-menu-note">Flip between candidate designs to compare them live. One becomes the default later.</div>' +
          variants.map(function (v) { return toggle(api.variant(v.key), 'data-variant="' + esc(v.key) + '"', v.label, v.desc); }).join("");
      },
      bind: function (slot) {
        slot.querySelectorAll("[data-variant]").forEach(function (b) {
          b.addEventListener("click", function () {
            var k = b.getAttribute("data-variant"), v = byKey(variants, k), on = !api.variant(k);
            if (typeof v.href === "function") { location.href = carry(resolve(function (u) { return v.href(on, u); })); return; }
            store.set("variant." + k, on ? "1" : "0");
            if (typeof v.apply === "function") { v.apply(on); render(); } else location.reload();
          });
        });
      }
    },
    start: {
      html: function () {
        var cur = api.startAt(starts[0] && starts[0].key), sp = api.startPath();
        return '<div class="pbar-menu-head">Where the prototype opens</div>' +
          starts.map(function (s) { return item(s.key === cur && !sp ? "is-on" : "", 'data-start="' + esc(s.key) + '"', s.label, s.key === cur && !sp ? ic("check") : "", s.desc); }).join("") +
          (starts.length ? '<div class="pbar-menu-head pbar-menu-sub">Or any page</div>' : "") +
          toggle(!!sp, "data-start-here", sp ? "Starts on a chosen page" : "Start on the page I'm on",
            sp ? "The prototype's index sends visitors to " + sp + ". Turn off to go back." : "Remembers this page as the start, in this browser, without registering it. The index page has to honour ProtoToolbar.startPath().");
      },
      bind: function (slot, close) {
        slot.querySelectorAll("[data-start]").forEach(function (b) {
          b.addEventListener("click", function () { store.set("startAt", b.getAttribute("data-start")); store.set("startPath", ""); close(); });
        });
        slot.querySelector("[data-start-here]").addEventListener("click", function () {
          store.set("startPath", api.startPath() ? "" : herePath()); close();
        });
      }
    },
    share: {
      html: function () {
        var live = liveShareUrl({ toolbar: shareToolbar, page: sharePage });
        if (!live) {
          return '<div class="pbar-menu-head pbar-share-head">Share</div>' +
            '<div class="pbar-menu-note">No live address is set up for this prototype. This copies the current address without the toolbar.</div>' +
            item("", "data-copy", "Copy link");
        }
        return '<div class="pbar-menu-head pbar-share-head">Share</div>' +
          '<div class="pbar-menu-note">A live link for anyone — no dev server needed.</div>' +
          '<div class="pbar-share-url">' + esc(live) + "</div>" +
          toggle(sharePage, "data-share-page", "Share this page", "The link opens on the screen you are looking at now instead of at the prototype's start.") +
          toggle(shareToolbar, "data-share-toolbar", "Include the toolbar", "The link carries the toolbar key, so whoever opens it gets this bar too.") +
          item("", "data-copy", "Copy live link");
      },
      bind: function (slot, close, reopen) {
        var p = slot.querySelector("[data-share-page]"), t = slot.querySelector("[data-share-toolbar]");
        if (p) p.addEventListener("click", function () { sharePage = !sharePage; reopen(); });
        if (t) t.addEventListener("click", function () { shareToolbar = !shareToolbar; reopen(); });
        var b = slot.querySelector("[data-copy]");
        b.addEventListener("click", function () {
          var live = liveShareUrl({ toolbar: shareToolbar, page: sharePage });
          try { navigator.clipboard.writeText(live || plainLink()); } catch (e) {}
          b.innerHTML = '<span class="pbar-item-label">Copied</span>' + ic("check");
        });
      }
    }
  };
  var sharePage = false, shareToolbar = false;

  function menuButton(key, icon, label, count) {
    return '<div class="pbar-menu-wrap" data-menu="' + key + '">' +
      '<button class="pbar-btn" data-tip="' + esc(label) + '">' + ic(icon) + '<span class="pbar-lbl">' + esc(label) + "</span>" +
      (count ? '<span class="pbar-count' + (key === "screens" ? " is-learn" : "") + '" title="' + (key === "screens" ? "Seen here, not in the Screens list" : "") + '">' + count + "</span>" : "") + "</button>" +
      '<div class="pbar-menu-slot"></div></div>';
  }

  function render() {
    if (bar) { bar.remove(); bar = null; }
    if (peek) { peek.remove(); peek = null; }
    openMenu = null;
    /* The shell (body as a column, page below the bar) can be refused per host
       (`shell: false`) or per page (<body data-proto-shell="off">). */
    var shell = C.shell !== false && document.body.getAttribute("data-proto-shell") !== "off";
    if (shell) document.body.classList.toggle("proto-shell", !hidden);
    if (hidden) {
      peek = el('<button class="pbar-peek" title="Show toolbar (Ctrl+`)">' + ic("sliders", 12) + '<span class="pbar-peek-lbl">Toolbar</span></button>');
      document.body.appendChild(peek);
      peek.addEventListener("click", function () { hidden = false; store.set("barHidden", "0"); render(); });
      publishHeight();
      return;
    }
    var offCount = edges.filter(function (e) { return api.edge(e.key) !== !!e.on; }).length;
    var extraPages = unregisteredPages();
    bar = el(
      '<div class="pbar">' +
      (version && versions.length > 1
        ? '<div class="pbar-menu-wrap" data-menu="version"><button class="pbar-badge pbar-badge-btn" data-tip="Switch version">' + esc(badge) +
          '<span class="pbar-chev">' + ic("chevron-down", 12) + "</span></button><div class=\"pbar-menu-slot\"></div></div>"
        : '<span class="pbar-badge">' + esc(badge) + "</span>") +
      (screens.length || extraPages.length ? menuButton("screens", "clipboard-note", "Screens", isDevHost() ? extraPages.length : 0) : "") +
      (edges.length ? menuButton("edges", "randomize", "Edge cases", offCount) : "") +
      (variants.length ? menuButton("variants", "sliders", "Variants") : "") +
      (screens.length ? "" : menuButton("start", "home", "Start")) + /* with screens, Start is a column in that menu */
      '<span class="pbar-spacer" aria-hidden="true"></span>' +
      (updateTo
        ? '<a class="pbar-update pbar-tt is-right" href="https://github.com/effectory-ux/prototype-toolbar/releases" target="_blank" rel="noopener" ' +
          'data-tip="This prototype\'s copy of the toolbar is ' + VERSION + '; ' + esc(updateTo) + ' is published. Run toolbar/update.sh and commit.">Update</a>'
        : "") +
      '<div class="pbar-menu-wrap is-right" data-menu="share">' +
      '<button class="pbar-icon pbar-tt is-right" data-tip="Share" aria-label="Share">' + ic("share") + "</button>" +
      '<div class="pbar-menu-slot"></div></div>' +
      '<button class="pbar-icon pbar-tt is-right" data-hide data-tip="Collapse toolbar (Ctrl+`)" aria-label="Collapse toolbar">' + ic("collapse-right") + "</button>" +
      "</div>"
    );
    document.body.insertBefore(bar, document.body.firstChild);

    function closeMenus() {
      openMenu = null;
      bar.querySelectorAll(".pbar-menu-slot").forEach(function (s) { s.innerHTML = ""; });
      bar.querySelectorAll(".is-open").forEach(function (b) { b.classList.remove("is-open"); });
    }
    function open(wrap, key) {
      closeMenus();
      openMenu = key;
      var btn = wrap.querySelector(".pbar-badge-btn, .pbar-btn, .pbar-icon");
      btn.classList.add("is-open");
      var right = wrap.classList.contains("is-right");
      var slot = wrap.querySelector(".pbar-menu-slot");
      slot.innerHTML = '<div class="pbar-scrim"></div><div class="pbar-menu pbar-menu-' + key + (right ? " is-right" : "") + '">' + MENUS[key].html() + "</div>";
      slot.querySelector(".pbar-scrim").addEventListener("mousedown", closeMenus);
      MENUS[key].bind(slot, closeMenus, function () { open(wrap, key); });
    }
    bar.querySelectorAll(".pbar-menu-wrap").forEach(function (wrap) {
      var key = wrap.getAttribute("data-menu");
      wrap.querySelector(".pbar-badge-btn, .pbar-btn, .pbar-icon").addEventListener("click", function () {
        if (openMenu === key) return closeMenus();
        open(wrap, key);
      });
    });
    bar.querySelector("[data-hide]").addEventListener("click", function () { hidden = true; store.set("barHidden", "1"); render(); });
    publishHeight();
  }

  /* Ctrl+` toggles the bar — no browser binds it; ignored while typing. */
  window.addEventListener("keydown", function (e) {
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.ctrlKey && (e.key === "`" || e.code === "Backquote")) {
      e.preventDefault();
      hidden = !hidden;
      store.set("barHidden", hidden ? "1" : "0");
      render();
    }
  });

  /* Included right after <body> opens, the bar renders synchronously before
     the page content parses — no pop-in, no reflow on page switches. */
  if (document.body) render();
  else document.addEventListener("DOMContentLoaded", render);
})();
