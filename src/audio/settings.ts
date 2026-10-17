// Tempo and pitch of playback: a per-viewer preference, remembered when storage allows.

export interface PlaybackSettings {
  /** Speed relative to the normal pulse: 1 = normal, 0.5 = half as fast. */
  tempo: number;
  /** Semitones above (or below) the normal pitch, where Do is A3. */
  transpose: number;
}

export const TEMPO = { min: 0.6, max: 1.5, step: 0.05 };
export const TRANSPOSE = { min: -7, max: 7 };
const DEFAULTS: PlaybackSettings = { tempo: 1, transpose: 0 };

const KEY = 'septies-playback';
const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

function load(): PlaybackSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PlaybackSettings>;
    return {
      tempo: clamp(Number(saved.tempo) || DEFAULTS.tempo, TEMPO.min, TEMPO.max),
      transpose: Math.round(clamp(Number(saved.transpose) || 0, TRANSPOSE.min, TRANSPOSE.max)),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

let settings = load();
const listeners = new Set<(settings: PlaybackSettings) => void>();

export function playbackSettings(): PlaybackSettings {
  return settings;
}

export function onSettingsChange(listener: (settings: PlaybackSettings) => void): void {
  listeners.add(listener);
}

export function setPlaybackSettings(change: Partial<PlaybackSettings>): void {
  const next = { ...settings, ...change };
  next.tempo = clamp(next.tempo, TEMPO.min, TEMPO.max);
  next.transpose = Math.round(clamp(next.transpose, TRANSPOSE.min, TRANSPOSE.max));
  if (next.tempo === settings.tempo && next.transpose === settings.transpose) return;
  settings = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: the choice lasts for this visit only.
  }
  for (const l of listeners) l(settings);
}

export function resetPlaybackSettings(): void {
  setPlaybackSettings(DEFAULTS);
}
