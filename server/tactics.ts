import { type Seat, LINES, otherSeat } from './types';

/** Does placing `mark` at cell `i` complete a line? */
export function completes(cells: Array<Seat | null>, i: number, mark: Seat): boolean {
  return LINES.some(l => l.includes(i) && l.every(j => j === i || cells[j] === mark));
}

/** Does placing `mark` at cell `i` create a fork (two winning threats)? */
export function forks(cells: Array<Seat | null>, i: number, mark: Seat): boolean {
  const next = [...cells];
  next[i] = mark;
  const threats = new Set<number>();
  for (const l of LINES) {
    const mine = l.filter(j => next[j] === mark).length;
    const empty = l.filter(j => next[j] === null);
    if (mine === 2 && empty.length === 1) threats.add(empty[0]);
  }
  return threats.size >= 2;
}

/** Describe tactical properties of placing `me` at cell `i`. */
export function describeTactics(cells: Array<Seat | null>, i: number, me: Seat): string[] {
  const opp = otherSeat(me);
  const tags: string[] = [];
  if (completes(cells, i, me))  tags.push('wins the game immediately');
  if (completes(cells, i, opp)) tags.push("blocks the opponent's winning move");
  if (forks(cells, i, me))      tags.push('creates a fork with two winning threats');
  if (forks(cells, i, opp))     tags.push("stops the opponent's fork");
  return tags;
}
