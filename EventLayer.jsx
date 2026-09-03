// EventLayer.jsx — the Piwik analytics spec, drawn over the live prototype.
//
// In Figma this lived in comments: every tracked interaction got a note
// ("PIWIK event / Category: … / Action: …") for a developer to pick up. Here
// the definitions come in as a registry (see the host's piwik-events.js) and
// elements opt in with data-piwik="<key>", so the spec sits ON the working
// UI: a pin on every tracked element, the full definition one click away,
// and a live log that shows events firing as you use the prototype —
// including funnels starting, completing or being abandoned.
//
// Like the rest of this folder this is TOOLING, not product UI: dark, compact,
// self-contained, and it never intercepts the prototype's own interactions —
// the fired log listens on the capture phase and touches nothing.
import { useState, useEffect, useRef } from "react";
import { Ic } from "./icons.jsx";

// The exact comment text a developer used to get in Figma.
export const eventSpec = (def) => {
  const lines = ["PIWIK event", `Category: ${def.category}`, `Action: ${def.action}`];
  if (def.funnel) lines.push("", `PIWIK funnel ${def.funnel.role}`, `Funnel: ${def.funnel.id}`);
  return lines.join("\n");
};

const fmtTime = (d) => d.toLocaleTimeString([], { hour12: false });

// The pin glyph says what kind of trigger it marks without opening it:
// a plain event is a dot, a funnel start is a play triangle, an end a stop
// square. Titles carry the words for anyone who hovers.
function PinMark({ def }) {
  if (def.funnel && def.funnel.role === "start") return <span className="pvt-mark is-start" aria-hidden="true" />;
  if (def.funnel && def.funnel.role === "end") return <span className="pvt-mark is-end" aria-hidden="true" />;
  return <span className="pvt-mark" aria-hidden="true" />;
}

export function EventLayer({ events = {}, funnels = {} }) {
  const [pins, setPins] = useState([]);        // [{key, x, y}] — one per visible element
  const [open, setOpen] = useState(null);      // {key, x, y} — the pin whose spec is open
  const [log, setLog] = useState([]);          // [{key, time} | {completed, time}]
  const [copied, setCopied] = useState(false);
  const viewSeen = useRef(new Map());          // view-event key -> was visible last scan
  const logEnd = useRef(null);

  const fire = (key) => {
    const def = events[key];
    if (!def) return;
    setLog(prev => {
      const next = [...prev, { key, time: new Date() }];
      // A funnel completes when its end fires with a start on the books that
      // has not been consumed by an earlier completion.
      if (def.funnel && def.funnel.role === "end") {
        let started = false;
        for (const e of next) {
          if (e.completed === def.funnel.id) started = false;
          else if (e.key && events[e.key] && events[e.key].funnel &&
                   events[e.key].funnel.id === def.funnel.id) {
            if (events[e.key].funnel.role === "start") started = true;
          }
        }
        if (started) next.push({ completed: def.funnel.id, time: new Date() });
      }
      return next;
    });
  };

  // Pins follow the real elements: a scan on an interval plus scroll/resize
  // keeps them attached through dialogs opening, lists scrolling and rows
  // animating, without touching the host's code.
  useEffect(() => {
    const scan = () => {
      const found = [];
      document.querySelectorAll("[data-piwik]").forEach(el => {
        const key = el.getAttribute("data-piwik");
        const def = events[key];
        if (!def) return;
        const r = el.getBoundingClientRect();
        const visible = r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < window.innerHeight;
        if (def.on === "view") {
          const was = viewSeen.current.get(key) || false;
          if (visible && !was) fire(key);
          viewSeen.current.set(key, visible);
        }
        if (visible) found.push({ key, x: Math.min(r.right, window.innerWidth - 4), y: Math.max(r.top, 4) });
      });
      setPins(prev => (JSON.stringify(prev) === JSON.stringify(found) ? prev : found));
    };
    scan();
    const iv = setInterval(scan, 250);
    window.addEventListener("scroll", scan, true);
    window.addEventListener("resize", scan);
    return () => { clearInterval(iv); window.removeEventListener("scroll", scan, true); window.removeEventListener("resize", scan); };
  }, [events]); // eslint-disable-line

  // Click events fire from a capture-phase listener so the log sees the
  // click even when the element unmounts in the same tick (dialog closes).
  useEffect(() => {
    const h = (e) => {
      const el = e.target && e.target.closest ? e.target.closest("[data-piwik]") : null;
      if (!el) return;
      const key = el.getAttribute("data-piwik");
      const def = events[key];
      if (def && def.on !== "view") fire(key);
    };
    document.addEventListener("click", h, true);
    return () => document.removeEventListener("click", h, true);
  }, [events]); // eslint-disable-line

  useEffect(() => { if (logEnd.current) logEnd.current.scrollIntoView({ block: "end" }); }, [log]);

  const copySpec = (def) => {
    try { navigator.clipboard.writeText(eventSpec(def)); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch (_) {}
  };

  const openDef = open ? events[open.key] : null;

  return (
    <>
      {pins.map((p, i) => {
        const def = events[p.key];
        return (
          <button key={p.key + ":" + i} className="pvt-pin" title={def.label}
            style={{ left: p.x, top: p.y }}
            onClick={() => setOpen(open && open.key === p.key ? null : { ...p })}>
            <PinMark def={def} />
          </button>
        );
      })}

      {open && openDef && (
        <>
          <div className="pvt-scrim" onMouseDown={() => setOpen(null)} />
          <div className="pvt-pop" style={{
            left: Math.min(open.x, window.innerWidth - 344),
            top: Math.min(open.y + 24, window.innerHeight - 260),
          }}>
            <div className="pvt-pop-head">
              <span className="pvt-pop-title">{openDef.label}</span>
              {openDef.funnel && (
                <span className={"pvt-chip " + (openDef.funnel.role === "start" ? "is-start" : "is-end")}>
                  Funnel {openDef.funnel.role}
                </span>
              )}
            </div>
            {openDef.funnel && funnels[openDef.funnel.id] && (
              <div className="pvt-pop-note">{funnels[openDef.funnel.id].label}: {funnels[openDef.funnel.id].desc}</div>
            )}
            <pre className="pvt-spec">{eventSpec(openDef)}</pre>
            <div className="pvt-pop-foot">
              <span className="pvt-trigger">Fires on {openDef.on === "view" ? "appearance" : "click"}</span>
              <button className="pvt-btn" onClick={() => copySpec(openDef)}>
                <Ic name={copied ? "check" : "copy"} size={12} />{copied ? "Copied" : "Copy for developers"}
              </button>
            </div>
          </div>
        </>
      )}

      <div className="pvt-tray">
        <div className="pvt-tray-head">
          <span>Fired events</span>
          {log.length > 0 && <span className="pvt-count">{log.filter(e => e.key).length}</span>}
          <span className="pvt-tray-spacer" />
          {log.length > 0 && (
            <button className="pvt-iconbtn" title="Clear the log" onClick={() => setLog([])}>
              <Ic name="trash" size={12} />
            </button>
          )}
        </div>
        {log.length === 0 ? (
          <div className="pvt-tray-empty">Use the prototype and every tracked interaction lands here as it would in Piwik</div>
        ) : (
          <div className="pvt-tray-body">
            {log.map((e, i) => e.completed ? (
              <div key={i} className="pvt-row is-complete">
                <span className="pvt-time">{fmtTime(e.time)}</span>
                <span className="pvt-row-main">Funnel completed · {(funnels[e.completed] || { label: e.completed }).label}</span>
              </div>
            ) : (
              <div key={i} className="pvt-row">
                <span className="pvt-time">{fmtTime(e.time)}</span>
                <span className="pvt-row-main">
                  <span className="pvt-row-label">{events[e.key].label}
                    {events[e.key].funnel && (
                      <span className={"pvt-chip " + (events[e.key].funnel.role === "start" ? "is-start" : "is-end")}>
                        Funnel {events[e.key].funnel.role}
                      </span>
                    )}
                  </span>
                  <span className="pvt-row-action">{events[e.key].action}</span>
                </span>
              </div>
            ))}
            <div ref={logEnd} />
          </div>
        )}
      </div>
    </>
  );
}
