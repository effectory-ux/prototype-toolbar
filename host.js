// host.js — is this page being served by a development server?
//
// Several parts of the bar need to know: version switching auto-starts a
// sibling's dev server, discovery writes the screens it learns into the repo,
// and the Share menu only measures freshness locally. The check is explicit
// rather than inferred from a failed request, so a deployed prototype never
// offers something that can only work locally, whatever the host answers.
export function isDevHost() {
  try {
    const h = window.location.hostname;
    // The same list as prototype-bar.js / load.js: keep the three in step.
    return ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(h)
      || h.endsWith(".local") || /^(10|192\.168)\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  } catch (_) { return false; }
}
