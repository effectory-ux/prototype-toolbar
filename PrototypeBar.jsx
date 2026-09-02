// PrototypeBar.jsx — a prototype's own toolbar, in the spirit of the Figma /
// Claude Design prototype chrome.
//
// This folder (src/proto/) is deliberately self-contained so it can be lifted
// into another project or a skill as-is: the component, its stylesheet and its
// inlined icons live here, and everything project-specific (which use cases,
// edge cases and start points exist) comes in as props. See README.md.
//
// This is TOOLING, not product UI: it avoids the host app's design system
// (dark, compact) and it is a real full-width row ABOVE the prototype rather
// than an overlay, so it never covers a screen. Collapse it with the button on
// its right or Ctrl+` (a combination no browser claims); reveal it again from
// the vertical tab on the middle of the right screen edge, or the same
// shortcut. On narrow viewports the buttons drop their labels and rely on
// their tooltips.
import { useState, useEffect, useRef } from "react";
import { Ic } from "./icons.jsx";
import { initCopyEdits, enableEdit, disableEdit, discardEdits, editCount, undoEdit, redoEdit, canUndo, canRedo, isDevHost } from "./copyEdit.js";
import { currentVersion, versionUrl, versionAvailable, ensureVersionServer } from "./versions.js";
import { EventLayer } from "./EventLayer.jsx";
import "./prototype-bar.css";

// Who gets the toolbar:
//   • while PROTOTYPING (localhost / a LAN dev server) — always, no flag needed;
//   • anywhere else — only for a URL carrying `?<toolbarKey>-toolbar-active`,
//     where the key is minted per prototype and passed in by the host.
// There is deliberately no "off" switch: a URL without the flag IS the version
// without the toolbar, so a second way to say the same thing would only be
// another thing to remember.
const flagOf = (key) => `${key}-toolbar-active`;
const barActive = (key) => {
  try {
    return isDevHost() || (!!key && new URLSearchParams(window.location.search).has(flagOf(key)));
  } catch (_) { return false; }
};
// The current step WITHOUT the toolbar flag: what you hand to a tester.
const plainLink = (key) => {
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete(flagOf(key));
    return u.toString().replace(/\?(?=#|$)/, "");
  } catch (_) { return window.location.href; }
};

const startKey = (prefix) => prefix + ".startAt";
const hideKey = (prefix) => prefix + ".barHidden";
const eventsKey = (prefix) => prefix + ".eventsOn";
export const getStartAt = (prefix, fallback) => {
  try { return localStorage.getItem(startKey(prefix)) || fallback; } catch (_) { return fallback; }
};
const setStartAt = (prefix, v) => { try { localStorage.setItem(startKey(prefix), v); } catch (_) {} };
const getHidden = (prefix) => { try { return localStorage.getItem(hideKey(prefix)) === "1"; } catch (_) { return false; } };
const saveHidden = (prefix, v) => { try { localStorage.setItem(hideKey(prefix), v ? "1" : "0"); } catch (_) {} };

// Props:
//   useCases    [{key, label, desc}]   — states to jump to (onUseCase(key))
//   edgeCases   [{key, label, desc, on}] — toggles (edges map + onToggleEdge(key))
//   startPoints [{key, label}]         — where the prototype opens next time
//   variants    [{key, label, desc}]   — design variants under exploration
//                                        (varState map + onToggleVariant(key))
//   storagePrefix                      — localStorage namespace, e.g. "cyos"
//   versions    [{key, label, desc, port, path, toolbarKey}]
//               — this prototype's versions (the host's registry file; see
//               versions.js). The bar works out which one it is FROM THE URL,
//               shows that name on its badge (the collapsed tab stays
//               "Toolbar"), and with siblings the badge becomes a switcher to
//               the same step in another version. On a dev host it first asks
//               its own dev server to start the sibling's (protoVersions vite
//               plugin); deployed it marks unpublished siblings instead of
//               linking into a 404.
export function PrototypeBar({ useCases = [], edgeCases = [], startPoints = [], variants = [],
  edges = {}, varState = {}, onUseCase = () => {}, onToggleEdge = () => {}, onToggleVariant = () => {},
  storagePrefix = "proto", toolbarKey = "", events = {}, funnels = {}, versions = [] }) {
  const version = currentVersion(versions);
  const [switching, setSwitching] = useState(null);   // version key being started
  const [switchFail, setSwitchFail] = useState(null); // version key that would not start
  const [published, setPublished] = useState({});     // key -> bool (deployed check)
  const gotoVersion = async (e, v) => {
    if (!isDevHost()) return; // deployed: plain navigation
    e.preventDefault();
    const href = e.currentTarget.href;
    if (switching) return;
    setSwitchFail(null);
    setSwitching(v.key);
    if (await ensureVersionServer(v)) { window.location.href = href; }
    else { setSwitching(null); setSwitchFail(v.key); }
  };
  const [hidden, setHide] = useState(() => getHidden(storagePrefix));
  const [menu, setMenu] = useState(null); // "cases" | "start" | "edges" | null
  const [start, setStart] = useState(() => getStartAt(storagePrefix, startPoints[0] && startPoints[0].key));
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  // The Piwik spec layer: pins on tracked elements plus a fired-events log.
  // A mode you leave on while walking a developer through the tracking, so
  // it persists like the start point does.
  const [eventsOn, setEventsOn] = useState(() => {
    try { return localStorage.getItem(eventsKey(storagePrefix)) === "1"; } catch (_) { return false; }
  });
  const toggleEvents = () => setEventsOn(v => {
    try { localStorage.setItem(eventsKey(storagePrefix), v ? "0" : "1"); } catch (_) {}
    return !v;
  });
  const hasEvents = Object.keys(events).length > 0;
  const layer = hasEvents && eventsOn ? <EventLayer events={events} funnels={funnels} /> : null;
  // Inline copy editing (copyEdit.js): available only while the dev server
  // runs — the deployed prototype still APPLIES saved edits, read-only.
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState("clean"); // clean | saving | saved | error
  const [, setTick] = useState(0); // re-render on undo/redo stack changes
  useEffect(() => { initCopyEdits(setSaveState, () => setTick(t => t + 1)).then(setCanEdit); }, []);
  const toggleEdit = () => {
    if (editing) { disableEdit(); setEditing(false); }
    else { enableEdit(); setEditing(true); }
  };
  const discard = () => {
    if (window.confirm("Discard all copy edits and restore the original wording?")) discardEdits();
  };

  // The bar is a real row above the prototype, but a dialog overlay is fixed to
  // the viewport and would slide underneath it. Publishing the bar's height as
  // a CSS variable lets the host offset its overlays by exactly that much.
  const barRef = useRef(null);
  useEffect(() => {
    const set = () => {
      const h = hidden || !barRef.current ? 0 : Math.round(barRef.current.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--proto-bar-h", h + "px");
    };
    set();
    window.addEventListener("resize", set);
    const ro = barRef.current ? new ResizeObserver(set) : null;
    if (ro && barRef.current) ro.observe(barRef.current);
    return () => { window.removeEventListener("resize", set); if (ro) ro.disconnect(); };
  }, [hidden]);
  useEffect(() => () => document.documentElement.style.removeProperty("--proto-bar-h"), []);

  // Ctrl+` toggles the bar — no browser binds it, and it can't collide with
  // typing because we ignore the shortcut while a field has focus.
  useEffect(() => {
    const h = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (typing) return;
      if (e.ctrlKey && (e.key === "`" || e.code === "Backquote")) {
        e.preventDefault();
        setHide(v => { saveHidden(storagePrefix, !v); return !v; });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [storagePrefix]);

  // Two links, and the difference is who you are copying for. The link icon
  // takes this step exactly as you are looking at it (flag and all, which is
  // how a colleague gets the toolbar). Share is for everyone else: the same
  // step with the toolbar stripped out.
  const copy = () => {
    try { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch (_) {}
  };
  const share = () => {
    try { navigator.clipboard.writeText(plainLink(toolbarKey)); setShared(true); setTimeout(() => setShared(false), 1600); } catch (_) {}
  };
  // Deployed, with the switcher open: check which siblings are actually
  // published — the registry can run ahead of the deploys.
  useEffect(() => {
    if (menu !== "version" || isDevHost()) return;
    let live = true;
    versions.forEach(async (v) => {
      if (version && v.key === version.key) return;
      const ok = await versionAvailable(versions, v);
      if (live) setPublished(p => ({ ...p, [v.key]: ok }));
    });
    return () => { live = false; };
  }, [menu]); // eslint-disable-line

  const pick = (key) => { setMenu(null); onUseCase(key); };
  const pickStart = (key) => { setStart(key); setStartAt(storagePrefix, key); setMenu(null); };
  const offCount = edgeCases.filter(e => edges[e.key] !== e.on).length;

  if (!barActive(toolbarKey)) return null;

  if (hidden) {
    return (
      <>
        {layer}
        <button className="pbar-peek" onClick={() => { setHide(false); saveHidden(storagePrefix, false); }}
          title="Show toolbar (Ctrl+`)">
          <Ic name="sliders" size={12} />
          <span className="pbar-peek-lbl">Toolbar</span>
        </button>
      </>
    );
  }

  return (
    <>
    {layer}
    <div className="pbar" ref={barRef}>
      {version && versions.length > 1 ? (
        <div className="pbar-menu-wrap">
          <button className={"pbar-badge pbar-badge-btn" + (menu === "version" ? " is-open" : "")}
            data-tip="Switch version" onClick={() => setMenu(m => (m === "version" ? null : "version"))}>
            {version.label}
            <span className="pbar-chev"><Ic name="chevron-down" size={12} /></span>
          </button>
          {menu === "version" && (
            <>
              <div className="pbar-scrim" onMouseDown={() => setMenu(null)} />
              <div className="pbar-menu">
                <div className="pbar-menu-head">Prototype versions</div>
                <div className="pbar-menu-note">Compare versions of this prototype. You land on the same step when the other version has it too.</div>
                {versions.map(v => {
                  if (v.key === version.key) return (
                    <span key={v.key} className="pbar-item is-on is-current">
                      <span className="pbar-item-label">{v.label}</span>
                      <Ic name="check" size={14} />
                      <span className="pbar-item-desc">{v.desc}</span>
                    </span>
                  );
                  if (published[v.key] === false) return (
                    <span key={v.key} className="pbar-item is-disabled">
                      <span className="pbar-item-label">{v.label}</span>
                      <span className="pbar-item-desc">Not published yet</span>
                    </span>
                  );
                  const busy = switching === v.key;
                  const failed = switchFail === v.key;
                  return (
                    <a key={v.key} className={"pbar-item" + (busy ? " is-busy" : "")}
                      href={versionUrl(versions, v)} onClick={(e) => gotoVersion(e, v)}>
                      <span className="pbar-item-label">{v.label}</span>
                      <span className="pbar-item-desc">
                        {busy ? "Starting its dev server…"
                          : failed ? "Couldn't start its dev server. Start it manually, then try again."
                          : v.desc}
                      </span>
                    </a>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        <span className="pbar-badge">{version ? version.label : "Toolbar"}</span>
      )}

      {useCases.length > 0 && (
        <div className="pbar-menu-wrap">
          <button className={"pbar-btn" + (menu === "cases" ? " is-open" : "")} data-tip="Use cases"
            onClick={() => setMenu(m => (m === "cases" ? null : "cases"))}>
            <Ic name="shapes" size={14} /><span className="pbar-lbl">Use cases</span><span className="pbar-chev"><Ic name="chevron-down" size={14} /></span>
          </button>
          {menu === "cases" && (
            <>
              <div className="pbar-scrim" onMouseDown={() => setMenu(null)} />
              <div className="pbar-menu">
                <div className="pbar-menu-head">Jump to a state</div>
                {useCases.map(c => (
                  <button key={c.key} className="pbar-item" onClick={() => pick(c.key)}>
                    <span className="pbar-item-label">{c.label}</span>
                    <span className="pbar-item-desc">{c.desc}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {edgeCases.length > 0 && (
        <div className="pbar-menu-wrap">
          <button className={"pbar-btn" + (menu === "edges" ? " is-open" : "")} data-tip="Edge cases"
            onClick={() => setMenu(m => (m === "edges" ? null : "edges"))}>
            <Ic name="randomize" size={14} /><span className="pbar-lbl">Edge cases</span>
            {offCount > 0 && <span className="pbar-count">{offCount}</span>}
            <span className="pbar-chev"><Ic name="chevron-down" size={14} /></span>
          </button>
          {menu === "edges" && (
            <>
              <div className="pbar-scrim" onMouseDown={() => setMenu(null)} />
              <div className="pbar-menu">
                <div className="pbar-menu-head">Not every account is the same</div>
                <div className="pbar-menu-note">Flip these to show a use case both ways. They apply to the survey you have open.</div>
                {edgeCases.map(c => (
                  <button key={c.key} className={"pbar-item" + (edges[c.key] ? " is-on" : "")}
                    role="switch" aria-checked={!!edges[c.key]} onClick={() => onToggleEdge(c.key)}>
                    <span className="pbar-item-label">{c.label}</span>
                    <span className="pbar-switch" aria-hidden="true" />
                    <span className="pbar-item-desc">{c.desc}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {variants.length > 0 && (
        <div className="pbar-menu-wrap">
          <button className={"pbar-btn" + (menu === "variants" ? " is-open" : "")} data-tip="Variants"
            onClick={() => setMenu(m => (m === "variants" ? null : "variants"))}>
            <Ic name="sliders" size={14} /><span className="pbar-lbl">Variants</span>
            <span className="pbar-chev"><Ic name="chevron-down" size={14} /></span>
          </button>
          {menu === "variants" && (
            <>
              <div className="pbar-scrim" onMouseDown={() => setMenu(null)} />
              <div className="pbar-menu">
                <div className="pbar-menu-head">Design variants under exploration</div>
                <div className="pbar-menu-note">Flip between candidate designs to compare them live. One becomes the default later.</div>
                {variants.map(c => (
                  <button key={c.key} className={"pbar-item" + (varState[c.key] ? " is-on" : "")}
                    role="switch" aria-checked={!!varState[c.key]} onClick={() => onToggleVariant(c.key)}>
                    <span className="pbar-item-label">{c.label}</span>
                    <span className="pbar-switch" aria-hidden="true" />
                    <span className="pbar-item-desc">{c.desc}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {startPoints.length > 0 && (
        <div className="pbar-menu-wrap">
          <button className={"pbar-btn" + (menu === "start" ? " is-open" : "")} data-tip="Start at"
            onClick={() => setMenu(m => (m === "start" ? null : "start"))}>
            <Ic name="home" size={14} /><span className="pbar-lbl">Start at</span><span className="pbar-chev"><Ic name="chevron-down" size={14} /></span>
          </button>
          {menu === "start" && (
            <>
              <div className="pbar-scrim" onMouseDown={() => setMenu(null)} />
              <div className="pbar-menu">
                <div className="pbar-menu-head">Where the prototype opens</div>
                {startPoints.map(s => (
                  <button key={s.key} className={"pbar-item" + (start === s.key ? " is-on" : "")} onClick={() => pickStart(s.key)}>
                    <span className="pbar-item-label">{s.label}</span>
                    {start === s.key && <Ic name="check" size={14} />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <span className="pbar-spacer" aria-hidden="true" />

      {canEdit && (
        <>
          {editing && (
            <>
              <button className={"pbar-icon pbar-tt is-right" + (canUndo() ? "" : " is-disabled")}
                onClick={undoEdit} disabled={!canUndo()} data-tip="Undo (Ctrl+Z)" aria-label="Undo text edit">
                <Ic name="undo" size={14} />
              </button>
              <button className={"pbar-icon pbar-tt is-right" + (canRedo() ? "" : " is-disabled")}
                onClick={redoEdit} disabled={!canRedo()} data-tip="Redo (Ctrl+Shift+Z)" aria-label="Redo text edit">
                <Ic name="undo" size={14} flip />
              </button>
              <button className={"pbar-icon pbar-tt is-right" + (editCount() > 0 ? "" : " is-disabled")}
                onClick={discard} disabled={editCount() === 0} data-tip="Delete all text changes" aria-label="Delete all text changes">
                <Ic name="trash" size={14} />
              </button>
            </>
          )}
          <button className={"pbar-btn pbar-tt is-right" + (editing ? " is-editing" : "") + (saveState === "error" ? " is-error" : "")}
            data-tip={saveState === "error" ? "Not saved — is the dev server running with the proto-edits plugin?" : editing ? "Save and stop editing" : "Edit texts inline"}
            onClick={toggleEdit}>
            <Ic name={editing ? "check" : "edit"} size={14} />
            <span className="pbar-lbl">{editing ? "Save" : "Edit"}</span>
          </button>
          <span className="pbar-sep" aria-hidden="true" />
        </>
      )}

      {hasEvents && (
        <>
          <button className={"pbar-btn pbar-tt is-right" + (eventsOn ? " is-editing" : "")}
            data-tip={eventsOn ? "Hide Piwik events" : "Show Piwik events"} onClick={toggleEvents}>
            <Ic name="pulse" size={14} />
            <span className="pbar-lbl">Events</span>
          </button>
          <span className="pbar-sep" aria-hidden="true" />
        </>
      )}

      <button className="pbar-icon pbar-tt is-right" onClick={copy}
        data-tip={copied ? "Copied" : "Copy link to this step"} aria-label="Copy link to this step">
        <Ic name={copied ? "check" : "copy"} size={14} />
      </button>
      <button className="pbar-icon pbar-tt is-right" onClick={share}
        data-tip={shared ? "Copied" : "Share without the toolbar"} aria-label="Share without the toolbar">
        <Ic name={shared ? "check" : "share"} size={14} />
      </button>
      <button className="pbar-icon pbar-tt is-right"
        onClick={() => { if (editing) { disableEdit(); setEditing(false); } setHide(true); saveHidden(storagePrefix, true); }}
        data-tip="Collapse toolbar (Ctrl+`)" aria-label="Collapse toolbar">
        <Ic name="collapse-right" size={14} />
      </button>
    </div>
    </>
  );
}
