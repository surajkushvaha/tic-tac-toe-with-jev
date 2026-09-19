import type { Seat } from './types';

export function buildSvg(seat: Seat): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', `glyph ${seat.toLowerCase()}`);
  svg.setAttribute('aria-hidden', 'true');

  if (seat === 'X') {
    const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p1.setAttribute('d', 'M26 26L74 74');
    p1.setAttribute('pathLength', '1');
    const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p2.setAttribute('d', 'M74 26L26 74');
    p2.setAttribute('pathLength', '1');
    svg.append(p1, p2);
  } else {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', '50');
    c.setAttribute('cy', '50');
    c.setAttribute('r', '25');
    c.setAttribute('pathLength', '1');
    svg.append(c);
  }

  return svg;
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Request failed');
  return data as T;
}
