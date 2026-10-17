// The playback bar at the bottom of the page in the Cantus view.

import { onPlayerChange, pause, playFrom, resume, stop, type PlayerState } from '../audio/player';

function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

/** Renders the transport into `el`; `scores` returns the current hour's chant elements. */
export function initTransport(el: HTMLElement, scores: () => HTMLElement[]): void {
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
      buttons.push(button('▶ Cane horam', 'Totam horam cane', () => void playFrom(scores(), 0)));
    } else {
      buttons.push(
        state === 'playing'
          ? button('❚❚ Intermitte', 'Intermitte', pause)
          : button('▶ Perge', 'Perge', resume),
        button('■ Siste', 'Siste', stop),
      );
    }
    el.replaceChildren(...buttons);
  };
  onPlayerChange((state) => draw(state));
  draw('stopped');
}
