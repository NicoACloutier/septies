// Self-hosted fonts and styles, bundled and hashed by Vite.
import '@fontsource/fondamento/400.css';
import '@fontsource/fondamento/400-italic.css';
import '@fontsource/unifrakturmaguntia/400.css';
import './styles.css';
import { loadHour, loadIndex } from './app/data';
import { addDays, isIsoDate, todayIso } from './app/date';
import { renderNav, type NavState } from './app/nav';
import { initTransport } from './app/transport';
import { stop } from './audio/player';
import { renderHeadline, renderHour, renderMessage, type View } from './office/render';
import { HOURS, type HourId } from './types';

/** The text/chant choice is a per-viewer preference, remembered when storage allows. */
const VIEW_KEY = 'septies-view';
let view: View = (() => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'textus' ? 'textus' : 'cantus';
  } catch {
    return 'cantus';
  }
})();

function setView(next: View): void {
  view = next;
  try {
    localStorage.setItem(VIEW_KEY, next);
  } catch {
    // Storage unavailable: the choice lasts for this visit only.
  }
  void render();
}

const nav = document.getElementById('nav')!;
const celebration = document.getElementById('celebration')!;
const office = document.getElementById('office')!;
const transport = document.getElementById('transport')!;
initTransport(transport, () => [...office.querySelectorAll<HTMLElement>('.chant-score')]);

/** Hours present in the generated data. */
const AVAILABLE: HourId[] = HOURS;

/**
 * The hour for the time of day, by the traditional horarium: Matins in the night,
 * Lauds at dawn, then Prime, Terce, Sext and None, Vespers in the evening, Compline at bedtime.
 */
function defaultHour(): HourId {
  const h = new Date().getHours();
  if (h < 5) return 'matutinum';
  if (h < 7) return 'laudes';
  if (h < 9) return 'prima';
  if (h < 12) return 'tertia';
  if (h < 15) return 'sexta';
  if (h < 17) return 'nona';
  if (h < 20) return 'vesperae';
  return 'completorium';
}

/** State lives in the URL hash, e.g. #2026-10-17/vesperae. */
function readState(): NavState {
  const [date, hour] = location.hash.replace(/^#\/?/, '').split('/');
  return {
    date: isIsoDate(date ?? '') ? date : todayIso(),
    hour: HOURS.includes(hour as HourId) && AVAILABLE.includes(hour as HourId) ? (hour as HourId) : defaultHour(),
  };
}

function writeState(state: NavState): void {
  location.hash = `${state.date}/${state.hour}`;
}

const indexPromise = loadIndex();
let renderId = 0;

async function render(): Promise<void> {
  const id = ++renderId;
  stop(); // a different day, hour or view: the chant being played is gone
  const state = readState();
  const index = await indexPromise;
  renderNav(nav, { state, index, hours: AVAILABLE, onChange: writeState, view, onViewChange: setView });

  const file = await loadHour(state.date, state.hour);
  if (id !== renderId) return; // a newer navigation started meanwhile
  if (!file) {
    celebration.replaceChildren();
    const range = index ? ` Available: ${index.from} to ${index.to}.` : '';
    renderMessage(office, `No office has been generated for ${state.date}.${range}`);
    transport.hidden = true;
    return;
  }
  celebration.replaceChildren(renderHeadline(file.celebration));
  renderHour(office, file.hour, file.celebration, view);
  transport.hidden = !office.querySelector('.chant-score');

  // Warm the cache for the same hour on the neighbouring days.
  void loadHour(addDays(state.date, -1), state.hour);
  void loadHour(addDays(state.date, 1), state.hour);
}

window.addEventListener('hashchange', () => void render());
document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement).closest('input, textarea')) return;
  const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
  if (!step) return;
  const state = readState();
  writeState({ ...state, date: addDays(state.date, step) });
});

void render();
