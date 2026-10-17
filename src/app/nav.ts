// Date navigation (previous / today / next) and hour tabs.

import { HOUR_NAMES, type DataIndex, type HourId } from '../types';
import { addDays, latinDate, todayIso } from './date';

export interface NavState {
  date: string;
  hour: HourId;
}

export interface NavOptions {
  state: NavState;
  index: DataIndex | null;
  hours: HourId[];
  onChange: (next: NavState) => void;
}

function button(label: string, title: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

export function renderNav(el: HTMLElement, { state, index, hours, onChange }: NavOptions): void {
  const prev = addDays(state.date, -1);
  const next = addDays(state.date, 1);
  const outside = (d: string) => !!index && (d < index.from || d > index.to);

  const dateRow = document.createElement('div');
  dateRow.className = 'date-row';

  const title = document.createElement('h1');
  title.className = 'date-title';
  title.textContent = latinDate(state.date);

  dateRow.append(
    button('‹', 'Dies præcedens', () => onChange({ ...state, date: prev }), outside(prev)),
    title,
    button('›', 'Dies sequens', () => onChange({ ...state, date: next }), outside(next)),
  );

  const today = todayIso();
  const todayRow = document.createElement('div');
  todayRow.className = 'today-row';
  if (state.date !== today) {
    const t = button('Hodie', 'Ad diem hodiernum', () => onChange({ ...state, date: today }));
    t.className = 'link';
    todayRow.append(t);
  }

  const tabs = document.createElement('div');
  tabs.className = 'hour-tabs';
  tabs.setAttribute('role', 'tablist');
  for (const h of hours) {
    const tab = button(HOUR_NAMES[h], HOUR_NAMES[h], () => onChange({ ...state, hour: h }));
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(h === state.hour));
    tabs.append(tab);
  }

  el.replaceChildren(dateRow, todayRow, tabs);
}
