// Playback icons drawn as SVG in the current text colour. The Unicode signs
// (▶ ■) turn into colour emoji on phones, which clash with the page.

export type IconName = 'play' | 'pause' | 'stop';

const SHAPES: Record<IconName, string> = {
  play: '<path d="M2.5 1.2 9 5 2.5 8.8Z"/>',
  pause: '<rect x="2" y="1.5" width="2.2" height="7" rx=".3"/><rect x="5.8" y="1.5" width="2.2" height="7" rx=".3"/>',
  stop: '<rect x="2" y="2" width="6" height="6" rx=".4"/>',
};

export function icon(name: IconName): SVGSVGElement {
  const template = document.createElement('template');
  template.innerHTML = `<svg class="icon" viewBox="0 0 10 10" aria-hidden="true" fill="currentColor">${SHAPES[name]}</svg>`;
  return template.content.firstElementChild as SVGSVGElement;
}
