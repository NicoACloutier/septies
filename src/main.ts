import { renderNav } from './app/nav';
import { renderHour } from './office/render';

// Phase 1: load public/data/YYYY/MM-DD.json for the selected date and render it.
const nav = document.getElementById('nav')!;
const office = document.getElementById('office')!;

renderNav(nav);
renderHour(office);
