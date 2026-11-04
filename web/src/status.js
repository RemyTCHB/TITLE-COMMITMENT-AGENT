// The Live clock's state, as in the Universal Team Hub (docs/HEADER.md there, section 1):
// - the time comes from the website server's clock (its Date header), never the device's: offset = server time minus
//   this device's time, read on load, every 15 minutes and when the tab comes back, kept for the next visit;
// - the live Firestore reads: connected, connecting, or failing (and the browser's own online / offline);
// - engine calls (api.js): running, the last change saved, and the last failure with a retry when repeating is safe.
// The page writes nothing for any of this.
import { useEffect, useState } from 'preact/hooks';

const KEY = 'tca-clock';
let offset = 0;
try { offset = +localStorage.getItem(KEY) || 0; } catch { /* private window */ }
export const now = () => Math.round(Date.now() + offset);

export function syncClock() {
  const t0 = Date.now();
  return fetch(`${location.pathname}?clock=${t0}`, { method: 'HEAD', cache: 'no-store' }).then(r => {
    const d = Date.parse(r.headers.get('date')), t1 = Date.now();
    if (!isNaN(d)) {  // the header is whole seconds: +500 ms is the middle of that second
      offset = d + 500 - (t0 + t1) / 2;
      try { localStorage.setItem(KEY, String(Math.round(offset))); } catch { /* private window */ }
    }
  }).catch(() => {});
}

// Eastern time, 12-hour: "Wed 11/04/2026" and "7:42:07 AM" and "EST"
const PARTS = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', year: 'numeric',
  month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZoneName: 'short' });
export function eastern(ts) {
  const p = Object.fromEntries(PARTS.formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return { date: `${p.weekday} ${p.month}/${p.day}/${p.year}`, time: `${p.hour}:${p.minute}:${p.second} ${p.dayPeriod}`,
    short: `${p.hour}:${p.minute} ${p.dayPeriod}`, zone: p.timeZoneName };
}

// ---------------------------------------------------------------- the state everyone shows
const state = { reads: 'connecting', online: navigator.onLine, running: 0, lastSaved: null, failure: null };
const subs = new Set();
const emit = () => subs.forEach(f => f({ ...state }));
const set = x => { Object.assign(state, x); emit(); };

export function useStatus() {
  const [s, setS] = useState({ ...state });
  useEffect(() => { subs.add(setS); setS({ ...state }); return () => subs.delete(setS); }, []);
  return s;
}

window.addEventListener('online', () => set({ online: true }));
window.addEventListener('offline', () => set({ online: false }));
export const readsAre = reads => state.reads !== reads && set({ reads });  // live | connecting | error
// From the listener's metadata: from the server = live; from the cache = still connecting, or lost after being live.
export const readsFromCache = fromCache => readsAre(!fromCache ? 'live' : state.reads === 'live' ? 'error' : state.reads);

// Engine calls (api.js call()). A call that failed for the connection or the server (no answer, 5xx) can be tried
// again when repeating it is safe; one the engine refused (4xx) shows its reason and OK.
export function callStarted() { set({ running: state.running + 1 }); }
export function callDone(ok, { write, failure } = {}) {
  set({ running: Math.max(0, state.running - 1), ...(ok ? { failure: null, ...(write ? { lastSaved: now() } : {}) } : { failure }) });
}
export const clearFailure = () => set({ failure: null });

// The one state the clock shows (the hub's order: connection first, then a failed change, then saving).
export function liveState(s) {
  if (!s.online || s.reads === 'error') return 'offline';
  if (s.reads === 'connecting') return 'connecting';
  if (s.failure) return 'unsaved';
  if (s.running) return 'saving';
  return 'live';
}
