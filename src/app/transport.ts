// The playback bar at the bottom of the page in the Cantus view, with a panel for
// tempo and pitch.

import { onPlayerChange, pause, playFrom, resume, stop, type PlayerState } from '../audio/player';
import {
  onSettingsChange,
  playbackSettings,
  resetPlaybackSettings,
  setPlaybackSettings,
  TEMPO,
  TRANSPOSE,
  type PlaybackSettings,
} from '../audio/settings';
import { icon, type IconName } from './icons';

function button(label: string, title: string, onClick: () => void, sign?: IconName): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  if (sign) b.append(icon(sign), ' ');
  b.append(label);
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

// Do sits on A3 by default; name the pitch it moves to.
const NOTE_NAMES = ['A', 'B♭', 'B', 'C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭'];
const doName = (transpose: number) => NOTE_NAMES[(transpose % 12 + 12) % 12];

/** One labelled slider. The value shows while dragging; the change applies on release. */
function slider(
  label: string,
  attrs: { min: number; max: number; step: number },
  get: () => number,
  show: (value: number) => string,
  set: (value: number) => void,
): { row: HTMLElement; sync: () => void } {
  const row = document.createElement('label');
  row.className = 'setting';
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(attrs.min);
  input.max = String(attrs.max);
  input.step = String(attrs.step);
  const value = document.createElement('output');
  input.addEventListener('input', () => (value.textContent = show(Number(input.value))));
  input.addEventListener('change', () => set(Number(input.value)));
  row.append(name, input, value);
  const sync = () => {
    input.value = String(get());
    value.textContent = show(get());
  };
  sync();
  return { row, sync };
}

function settingsPanel(): { panel: HTMLElement; toggle: HTMLButtonElement } {
  const panel = document.createElement('div');
  panel.className = 'transport-settings';
  panel.hidden = true;

  const tempo = slider(
    'Tempus',
    TEMPO,
    () => playbackSettings().tempo,
    (v) => `${Math.round(v * 100)}%`,
    (v) => setPlaybackSettings({ tempo: v }),
  );
  const pitch = slider(
    'Tonus',
    { ...TRANSPOSE, step: 1 },
    () => playbackSettings().transpose,
    (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)} · Do = ${doName(v)}`,
    (v) => setPlaybackSettings({ transpose: v }),
  );
  const reset = button('Restitue', 'Tempus et tonum restitue', resetPlaybackSettings);
  reset.className = 'link';
  panel.append(tempo.row, pitch.row, reset);

  const toggle = button('♩', 'Tempus et tonus', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  });
  toggle.setAttribute('aria-expanded', 'false');
  const showChanged = (s: PlaybackSettings) => toggle.classList.toggle('changed', s.tempo !== 1 || s.transpose !== 0);
  showChanged(playbackSettings());
  onSettingsChange((s) => {
    tempo.sync();
    pitch.sync();
    showChanged(s);
  });
  // Close when clicking elsewhere.
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target as Node) && e.target !== toggle) {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
  return { panel, toggle };
}

/** Renders the transport into `el`; `scores` returns the current hour's chant elements. */
export function initTransport(el: HTMLElement, scores: () => HTMLElement[]): void {
  const controls = document.createElement('div');
  controls.className = 'transport-controls';
  const { panel, toggle } = settingsPanel();
  el.replaceChildren(panel, controls, toggle);

  const draw = (state: PlayerState) => {
    const buttons: HTMLElement[] = [];
    if (state === 'waiting') {
      // Stopped at text without chant: read it, then continue.
      const hint = document.createElement('span');
      hint.className = 'transport-hint';
      hint.textContent = 'Lege, deinde perge';
      buttons.push(hint);
    }
    if (state === 'stopped') {
      buttons.push(button('Cane horam', 'Totam horam cane', () => void playFrom(scores(), 0), 'play'));
    } else {
      buttons.push(
        state === 'playing'
          ? button('Intermitte', 'Intermitte', pause, 'pause')
          : button('Perge', 'Perge', resume, 'play'),
        button('Siste', 'Siste', stop, 'stop'),
      );
    }
    controls.replaceChildren(...buttons);
  };
  onPlayerChange((state) => draw(state));
  draw('stopped');
}
