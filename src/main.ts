// Self-hosted fonts and styles, bundled and hashed by Vite.
import '@fontsource/fondamento/400.css';
import '@fontsource/fondamento/400-italic.css';
import '@fontsource/unifrakturmaguntia/400.css';
import './styles.css';
import { loadDay, loadIndex } from './app/data';
import { addDays, isIsoDate, todayIso } from './app/date';
import { renderNav, type NavState } from './app/nav';
import { renderHeadline, renderHour, renderMessage } from './office/render';
import { HOURS, type HourId } from './types';

const nav = document.getElementById('nav')!;
const celebration = document.getElementById('celebration')!;
const office = document.getElementById('office')!;

/** Hours present in the generated data (phase 1: Vespers and Compline). */
const AVAILABLE: HourId[] = ['vesperae', 'completorium'];

function defaultHour(): HourId {
  return new Date().getHours() >= 20 ? 'completorium' : 'vesperae';
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
  const state = readState();
  const index = await indexPromise;
  renderNav(nav, { state, index, hours: AVAILABLE, onChange: writeState });

  const day = await loadDay(state.date);
  if (id !== renderId) return; // a newer navigation started meanwhile
  if (!day) {
    celebration.replaceChildren();
    const range = index ? ` Available: ${index.from} to ${index.to}.` : '';
    renderMessage(office, `No office has been generated for ${state.date}.${range}`);
    return;
  }
  celebration.replaceChildren(renderHeadline(day.celebration));
  const hour = day.hours[state.hour];
  if (hour) renderHour(office, hour, day.celebration);
  else renderMessage(office, 'This hour is not available for this day.');

  // Warm the cache for the neighbouring days.
  void loadDay(addDays(state.date, -1));
  void loadDay(addDays(state.date, 1));
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
