// copyEdit.js — inline copy editing for the prototype, driven from the
// toolbar's Edit/Save button.
//
// How it works: Edit mode makes the whole prototype contentEditable and
// freezes its interactions (clicks are stopped in the capture phase, so you
// can place a caret in a button without triggering it — open the state you
// want to edit BEFORE entering edit mode, e.g. via the Use cases menu). Every
// keystroke is recorded as an override — a structural path to the text node
// plus its new and original text — and pushed, debounced, to the dev server,
// which writes public/proto-edits.json in the repo IN REAL TIME.
//
// The same file is fetched at boot and re-applied after every React render
// (a MutationObserver watches for re-renders), so edited wording survives
// menus, dialogs and navigation. Committed, the file ships with the build:
// the deployed prototype shows the edits read-only. The overrides carry the
// original text, so an agent (or a person) can later fold them into the
// source and empty the file — that is the "make it the new base" step.
//
// Scope: text only. Element edits are a design tool's job, not a toolbar's.

const SHELL = ".proto-shell";
const BAR = ".pbar, .pbar-menu, .pbar-scrim, .pbar-peek";
const ENDPOINT = "/__proto/edits";
const STATIC_FILE = "proto-edits.json";

// Editing writes into the repo through the dev server, so it exists only while
// one is running. The endpoint 404s anywhere else, but the check is explicit
// rather than inferred from a failed request: a deployed prototype must never
// offer an Edit button, whatever the host answers.
export function isDevHost() {
  try {
    const h = window.location.hostname;
    return ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(h)
      || h.endsWith(".local") || /^(10|192\.168)\./.test(h);
  } catch (_) { return false; }
}

const state = {
  edits: new Map(),   // key -> { path, ti, tid?, text, orig }
  canEdit: false,     // dev server endpoint reachable?
  editing: false,
  applying: false,    // guard: our own DOM writes must not re-trigger apply
  pushTimer: null,
  onStatus: () => {},
  onChange: () => {}, // UI refresh hook (undo/redo button state)
  teardown: null,
  observer: null,
  // Edit-session history: snapshots of the edits map. Native browser undo is
  // disabled (it cannot know about our manual edits), so the toolbar owns
  // undo/redo. `origCache` remembers originals of entries that were undone
  // away, so a restore can put the source text back on screen.
  undoStack: [],
  redoStack: [],
  lastSnapAt: 0,
  lastSnapKey: null,
  origCache: new Map(), // key -> { path, ti, orig }
};

const cloneEdits = (m) => new Map([...m].map(([k, v]) => [k, { ...v }]));

const key = (e) => e.path + " " + e.ti;
const shell = () => document.querySelector(SHELL);

// Structural path from the shell down to an element: stable across renders as
// long as the layout around it doesn't change shape. Good enough for a
// prototype; a wrong match fails soft (the override just doesn't apply).
function pathOf(el) {
  const root = shell();
  const parts = [];
  let n = el;
  while (n && n !== root) {
    const parent = n.parentElement;
    if (!parent) return null;
    const idx = Array.prototype.indexOf.call(parent.children, n) + 1;
    parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${idx})`);
    n = parent;
  }
  return n === root ? SHELL + " > " + parts.join(" > ") : null;
}

// The text-asset id of an element: an OPAQUE id (data-t) the host app puts on
// every render of the same string entity. Two elements share an id only when
// they are the SAME text (the participant title on the card and in its
// dialog); the same characters under different ids stay independent (the
// survey name and a participant title that defaults to it). Ids are numbers or
// model-derived tokens — never the text's own value.
const tidOf = (el) => {
  const host = el && el.closest && el.closest("[data-t]");
  return host ? host.getAttribute("data-t") : undefined;
};

// The text node being typed into right now, per the live selection.
function editedTextNode() {
  const sel = window.getSelection();
  const node = sel && sel.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const el = node.parentElement;
  if (!el || !el.closest(SHELL) || el.closest(BAR)) return null;
  return { node, el, ti: Array.prototype.indexOf.call(el.childNodes, node) };
}

// ---- persistence -----------------------------------------------------------

// A save only counts when the plugin ANSWERS {ok:true} — Vite's SPA fallback
// returns 200 for any url, so a dev server without the plugin must read as an
// error, never as saved. One automatic retry before reporting the failure.
async function postEdits() {
  const body = JSON.stringify({ edits: [...state.edits.values()] });
  const attempt = async () => {
    const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    const data = await r.json();
    if (data.ok !== true) throw new Error("save rejected");
  };
  try { await attempt(); }
  catch (_) {
    await new Promise(res => setTimeout(res, 1500));
    await attempt(); // a second failure propagates to the caller
  }
}

function push() {
  clearTimeout(state.pushTimer);
  state.onStatus("saving");
  state.pushTimer = setTimeout(async () => {
    try { await postEdits(); state.onStatus(state.edits.size ? "saved" : "clean"); }
    catch (_) { state.onStatus("error"); }
  }, 500);
}

// Leaving the page mid-edit must not lose the last keystrokes: sendBeacon
// survives unload where fetch may not.
function flushOnLeave() {
  if (!state.editing || !state.pushTimer) return;
  clearTimeout(state.pushTimer); state.pushTimer = null;
  try {
    navigator.sendBeacon(ENDPOINT, new Blob(
      [JSON.stringify({ edits: [...state.edits.values()] })], { type: "application/json" }));
  } catch (_) {}
}

// ---- applying overrides to the rendered DOM --------------------------------

// Linking is EXPLICIT, by text-asset id — never by matching strings. Every
// element carrying the edited entry's data-t follows the edit; a form field
// with that id is synced once per mount through React's own value setter
// (dispatching input, so the host state updates and the dialog's save flow
// still owns the commit). Fields whose value already diverged from the
// original are the user's — left alone.
function propagate() {
  const root = shell();
  state.edits.forEach((e) => {
    if (!e.tid) return;
    root.querySelectorAll(`[data-t="${e.tid}"]`).forEach((el) => {
      if (el.closest(BAR)) return;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        if (el._protoSynced === e.tid || (el.value !== e.orig && el.value !== "")) return;
        el._protoSynced = e.tid;
        const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement : window.HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value").set;
        setter.call(el, e.text);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      for (const n of el.childNodes) {
        if (n.nodeType === Node.TEXT_NODE && n.nodeValue !== e.text) { n.nodeValue = e.text; break; }
        if (n.nodeType === Node.TEXT_NODE) break;
      }
    });
  });
}

function applyAll() {
  if (!state.edits.size) return;
  state.applying = true;
  // propagation first, exact path overrides last — a specific edit wins
  propagate();
  state.edits.forEach((e) => {
    const el = document.querySelector(e.path);
    const node = el && el.childNodes[e.ti];
    if (node && node.nodeType === Node.TEXT_NODE && node.nodeValue !== e.text) {
      node.nodeValue = e.text;
    }
  });
  state.applying = false;
}

// React re-renders restore the source wording; re-apply the overrides right
// after. Outside edit mode only — while editing, the typist owns the DOM.
function startObserver() {
  if (state.observer || !shell()) return;
  let queued = false;
  state.observer = new MutationObserver(() => {
    if (state.applying || state.editing || queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; applyAll(); });
  });
  state.observer.observe(shell(), { subtree: true, childList: true, characterData: true });
}

// ---- edit mode -------------------------------------------------------------

// Coalesce keystrokes into one undo step per element per short burst, so
// undo works word-by-word-ish, not letter-by-letter.
const SNAP_MS = 900;
function snapshot(k) {
  const now = Date.now();
  if (k === state.lastSnapKey && now - state.lastSnapAt < SNAP_MS) { state.lastSnapAt = now; return; }
  state.undoStack.push(cloneEdits(state.edits));
  state.redoStack.length = 0;
  state.lastSnapAt = now; state.lastSnapKey = k;
}

function record() {
  const t = editedTextNode();
  if (!t) return;
  const path = pathOf(t.el);
  if (!path) return;
  const k = path + " " + t.ti;
  snapshot(k);
  const existing = state.edits.get(k);
  const orig = existing ? existing.orig : t.node._protoOrig;
  const entry = { path, ti: t.ti, tid: tidOf(t.el), text: t.node.nodeValue, orig: orig ?? t.node.nodeValue };
  state.origCache.set(k, { path: entry.path, ti: entry.ti, orig: entry.orig });
  if (entry.text === entry.orig) state.edits.delete(k); else state.edits.set(k, entry);
  state.applying = true; propagate(); state.applying = false;
  push();
  state.onChange();
}

// Put the screen in sync with the current edits map: apply every entry, and
// restore the source text of anything that is no longer overridden.
function restoreScreen() {
  state.applying = true;
  state.origCache.forEach((o, k) => {
    if (state.edits.has(k)) return;
    const el = document.querySelector(o.path);
    const node = el && el.childNodes[o.ti];
    if (node && node.nodeType === Node.TEXT_NODE && node.nodeValue !== o.orig) node.nodeValue = o.orig;
  });
  propagate();
  state.edits.forEach((e) => {
    const el = document.querySelector(e.path);
    const node = el && el.childNodes[e.ti];
    if (node && node.nodeType === Node.TEXT_NODE && node.nodeValue !== e.text) node.nodeValue = e.text;
  });
  state.applying = false;
}

export function undoEdit() {
  if (!state.undoStack.length) return;
  state.redoStack.push(cloneEdits(state.edits));
  state.edits = state.undoStack.pop();
  state.lastSnapKey = null;
  restoreScreen(); push(); state.onChange();
}

export function redoEdit() {
  if (!state.redoStack.length) return;
  state.undoStack.push(cloneEdits(state.edits));
  state.edits = state.redoStack.pop();
  state.lastSnapKey = null;
  restoreScreen(); push(); state.onChange();
}

export const canUndo = () => state.undoStack.length > 0;
export const canRedo = () => state.redoStack.length > 0;

// First text node inside a container (for element-level selections, e.g.
// after a triple-click).
function firstTextNode(n) {
  if (!n) return null;
  if (n.nodeType === Node.TEXT_NODE) return n;
  const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
  return w.nextNode();
}

// V1 hard rule: ONLY TEXT IS EDITABLE, ELEMENTS ALWAYS STAY. Two mechanisms
// enforce it. (1) The selection is clamped to a single text node — you cannot
// select across elements or grab an element (an icon, a whole button) as an
// object; a click in a button selects nothing but its label text. (2) Every
// edit is applied manually: beforeinput is always cancelled and the whitelisted
// operations (typing, paste as plain text, the delete flavours) are computed by
// this code and written into the text node's VALUE. The browser never mutates
// the DOM in edit mode, so there is no code path on which a node can be
// removed, split or merged — Enter, drops, formatting and rich paste are inert.

// Clamp the live selection to one text node. Returns that node, or null when
// nothing text-like is selected.
function clampSelection() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let anchor = sel.anchorNode;
  if (!anchor) return null;
  // element-level anchor (triple-click, drag from padding): dive to its text
  if (anchor.nodeType !== Node.TEXT_NODE) {
    const t = firstTextNode(anchor.childNodes[Math.min(sel.anchorOffset, anchor.childNodes.length - 1)] || anchor);
    if (!t || !t.parentElement || !t.parentElement.closest(SHELL) || t.parentElement.closest(BAR)) return null;
    const r = document.createRange();
    r.setStart(t, 0); r.setEnd(t, t.nodeValue.length);
    sel.removeAllRanges(); sel.addRange(r);
    return t;
  }
  const el = anchor.parentElement;
  if (!el || !el.closest(SHELL) || el.closest(BAR)) return null;
  if (sel.focusNode !== anchor) {
    // selection escaped the node: trim the far end back to the node's boundary
    const forward = !!(anchor.compareDocumentPosition(sel.focusNode) & Node.DOCUMENT_POSITION_FOLLOWING);
    const r = document.createRange();
    if (forward) { r.setStart(anchor, sel.anchorOffset); r.setEnd(anchor, anchor.nodeValue.length); }
    else { r.setStart(anchor, 0); r.setEnd(anchor, sel.anchorOffset); }
    sel.removeAllRanges(); sel.addRange(r);
  }
  return anchor;
}

const putCaret = (node, at) => {
  const sel = window.getSelection();
  const r = document.createRange();
  r.setStart(node, at); r.collapse(true);
  sel.removeAllRanges(); sel.addRange(r);
};

function handleBeforeInput(e) {
  if (e.target && e.target.closest && e.target.closest(BAR)) return;
  // composition (IME) cannot be cancelled; the `input` listener records it
  if (e.inputType === "insertCompositionText") return;
  e.preventDefault();
  const node = clampSelection();
  if (!node) return;
  if (node._protoOrig === undefined) {
    const path = pathOf(node.parentElement);
    const existing = path && state.edits.get(path + " " + Array.prototype.indexOf.call(node.parentElement.childNodes, node));
    node._protoOrig = existing ? existing.orig : node.nodeValue;
  }
  const sel = window.getSelection();
  const v = node.nodeValue;
  let start = Math.min(sel.anchorOffset, sel.focusOffset);
  let end = Math.max(sel.anchorOffset, sel.focusOffset);
  start = Math.max(0, Math.min(start, v.length));
  end = Math.max(start, Math.min(end, v.length));
  let ins = "";
  switch (e.inputType) {
    case "insertText":
    case "insertReplacementText":
      ins = e.data || ""; break;
    case "insertFromPaste": {
      const raw = e.data ?? (e.dataTransfer ? e.dataTransfer.getData("text/plain") : "");
      ins = (raw || "").replace(/\s*\n+\s*/g, " "); break; // plain, single-line
    }
    case "deleteContentBackward":
      if (start === end) start = Math.max(0, start - 1); break;
    case "deleteContentForward":
      if (start === end) end = Math.min(v.length, end + 1); break;
    case "deleteWordBackward":
      if (start === end) { const m = v.slice(0, start).match(/\s*\S+\s*$/); if (m) start -= m[0].length; } break;
    case "deleteWordForward":
      if (start === end) { const m = v.slice(end).match(/^\s*\S+/); if (m) end += m[0].length; } break;
    case "deleteByCut":
      try { navigator.clipboard.writeText(v.slice(start, end)); } catch (_) {} break;
    case "deleteContent":
    case "deleteSoftLineBackward":
    case "deleteHardLineBackward":
      break; // ranged delete of the current selection
    default:
      return; // Enter, line breaks, drops, formatting, history: inert
  }
  if (start === end && !ins) return;
  node.nodeValue = v.slice(0, start) + ins + v.slice(end);
  putCaret(node, start + ins.length);
  record();
}

export function enableEdit() {
  const root = shell();
  if (!root || state.editing) return;
  state.editing = true;
  state.undoStack.length = 0; state.redoStack.length = 0; state.lastSnapKey = null;
  root.contentEditable = "plaintext-only";
  if (root.contentEditable !== "plaintext-only") root.contentEditable = "true";
  root.classList.add("proto-editing");
  document.querySelectorAll(".pbar").forEach(b => { b.contentEditable = "false"; });

  // Freeze the app: stop pointer events from reaching React so a caret can be
  // placed anywhere without activating anything. The caret itself is a native
  // default action, so plain stopPropagation leaves typing intact.
  const stop = (e) => { if (!e.target.closest(BAR)) e.stopPropagation(); };
  const events = ["pointerdown", "mousedown", "mouseup", "click", "dblclick", "dragstart"];
  events.forEach(ev => root.addEventListener(ev, stop, true));
  root.addEventListener("beforeinput", handleBeforeInput, true);
  root.addEventListener("input", record, true); // IME/unpreventable edits only
  // Ring whatever text-holding element is under the cursor — "you could edit
  // this". Tag-agnostic on purpose: the ring goes on ANY element with a direct
  // text child, so plain <div> labels count too.
  let hovered = null;
  const hasOwnText = (el) => Array.prototype.some.call(el.childNodes,
    (n) => n.nodeType === Node.TEXT_NODE && n.nodeValue.trim());
  const trackHover = (e) => {
    let el = e.target;
    if (!(el instanceof Element) || el.closest(BAR) || !hasOwnText(el)) el = null;
    if (el === hovered) return;
    if (hovered) hovered.classList.remove("proto-edit-hover");
    hovered = el;
    if (hovered) hovered.classList.add("proto-edit-hover");
  };
  root.addEventListener("mouseover", trackHover, true);
  // Ring the element that holds the caret, so it's always clear WHAT is being
  // edited — the hover ring only says what could be.
  let focused = null;
  const trackFocus = () => {
    clampSelection(); // only text can be selected, one node at a time
    const t = editedTextNode();
    // Stamp the original text the moment the caret lands, BEFORE any typing:
    // beforeinput alone misses the first keystroke when the browser has to
    // create or normalize the text node, which polluted `orig` with it.
    if (t && t.node._protoOrig === undefined) {
      const path = pathOf(t.el);
      const existing = path && state.edits.get(path + " " + t.ti);
      t.node._protoOrig = existing ? existing.orig : t.node.nodeValue;
    }
    const el = t && t.el;
    if (el === focused) return;
    if (focused) focused.classList.remove("proto-edit-target");
    focused = el || null;
    if (focused) focused.classList.add("proto-edit-target");
  };
  // Native browser undo is disabled (it can't know about manual edits); the
  // toolbar's own stacks answer the shortcuts instead.
  const keys = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const kk = e.key.toLowerCase();
    if (kk === "z") { e.preventDefault(); e.stopPropagation(); (e.shiftKey ? redoEdit : undoEdit)(); }
    else if (kk === "y") { e.preventDefault(); e.stopPropagation(); redoEdit(); }
  };
  window.addEventListener("keydown", keys, true);
  document.addEventListener("selectionchange", trackFocus);
  window.addEventListener("pagehide", flushOnLeave);
  state.teardown = () => {
    events.forEach(ev => root.removeEventListener(ev, stop, true));
    root.removeEventListener("beforeinput", handleBeforeInput, true);
    root.removeEventListener("input", record, true);
    root.removeEventListener("mouseover", trackHover, true);
    window.removeEventListener("keydown", keys, true);
    document.removeEventListener("selectionchange", trackFocus);
    window.removeEventListener("pagehide", flushOnLeave);
    if (hovered) hovered.classList.remove("proto-edit-hover");
    if (focused) focused.classList.remove("proto-edit-target");
  };
}

export function disableEdit() {
  const root = shell();
  if (!root || !state.editing) return;
  clearTimeout(state.pushTimer); state.pushTimer = null;
  // final flush without the debounce
  postEdits()
    .then(() => state.onStatus(state.edits.size ? "saved" : "clean"))
    .catch(() => state.onStatus("error"));
  if (state.teardown) { state.teardown(); state.teardown = null; }
  root.removeAttribute("contenteditable");
  root.classList.remove("proto-editing");
  state.editing = false;
}

export function editCount() { return state.edits.size; }

// Throw away every override: empty the file and reload so React's own wording
// comes back everywhere.
export async function discardEdits() {
  state.edits.clear();
  try {
    await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edits: [] }) });
  } catch (_) {}
  window.location.reload();
}

// ---- boot ------------------------------------------------------------------

// Load stored edits (dev endpoint first, the committed static file as the
// deployed fallback), apply them, and keep them applied across re-renders.
// Returns whether editing is available (i.e. the dev server is present).
export async function initCopyEdits(onStatus, onChange) {
  state.onStatus = onStatus || (() => {});
  state.onChange = onChange || (() => {});
  let data = null;
  try {
    if (!isDevHost()) throw new Error("not a dev host");
    const r = await fetch(ENDPOINT);
    // `proto: true` separates the plugin from Vite's catch-all SPA fallback,
    // which happily returns index.html with a 200 for this url.
    if (r.ok) {
      const parsed = await r.json();
      if (parsed && parsed.proto === true) { data = parsed; state.canEdit = true; }
    }
  } catch (_) {}
  if (!data) {
    try {
      const r = await fetch(STATIC_FILE);
      if (r.ok) data = await r.json();
    } catch (_) {}
  }
  (data && data.edits || []).forEach(e => {
    state.edits.set(key(e), e);
    state.origCache.set(key(e), { path: e.path, ti: e.ti, orig: e.orig });
  });
  applyAll();
  startObserver();
  state.onStatus(state.edits.size ? "saved" : "clean");
  return state.canEdit;
}
