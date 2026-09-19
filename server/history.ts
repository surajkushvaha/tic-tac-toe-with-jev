import { type Seat, type GameRecord, type HistoryInsight, CELL_NAMES, otherSeat } from './types';
import { getRoot } from './env';

declare const Bun: {
  file(path: string): {
    text(): Promise<string>;
    exists(): Promise<boolean>;
  };
  write(path: string, data: string): Promise<number>;
};

const historyPath = () => `${getRoot()}/data/history.json`;

// ── Storage ──────────────────────────────────────────────────────────────────

let cache: GameRecord[] | null = null;

export async function loadHistory(): Promise<GameRecord[]> {
  if (cache) return cache;
  try {
    const text = await Bun.file(historyPath()).text();
    cache = JSON.parse(text) as GameRecord[];
    return cache;
  } catch {
    cache = [];
    return cache;
  }
}

export async function saveGame(record: GameRecord): Promise<void> {
  const games = await loadHistory();
  games.push(record);
  cache = games;

  // Ensure data/ directory exists (Bun.write creates parent dirs)
  const path = historyPath();
  const dir = path.replace(/[\\/][^\\/]+$/, '');
  try {
    const { mkdirSync } = require('fs');
    mkdirSync(dir, { recursive: true });
  } catch { /* already exists */ }

  await Bun.write(path, JSON.stringify(games, null, 2));
}

export async function getStats() {
  const games = await loadHistory();
  const byMode: Record<string, { total: number; xWins: number; oWins: number; draws: number }> = {};

  for (const g of games) {
    if (!byMode[g.mode]) byMode[g.mode] = { total: 0, xWins: 0, oWins: 0, draws: 0 };
    const m = byMode[g.mode];
    m.total++;
    if (g.winner === 'X') m.xWins++;
    else if (g.winner === 'O') m.oWins++;
    else m.draws++;
  }

  return { totalGames: games.length, byMode };
}

// ── Board fingerprinting ─────────────────────────────────────────────────────

/**
 * Create a canonical fingerprint for a board state.
 * Maps each cell to: 'M' (my mark), 'O' (opponent mark), '.' (empty)
 * This lets us match positions regardless of whether the AI played X or O.
 */
function fingerprint(board: Array<Seat | null>, mySeat: Seat): string {
  return board.map(c => c === mySeat ? 'M' : c === null ? '.' : 'O').join('');
}

/**
 * Find all board states in a game record from the perspective of a given seat.
 * Returns each position + the move that was made from it + eventual outcome.
 */
function extractPositions(game: GameRecord, seat: Seat): Array<{
  fp: string;
  moveIndex: number;
  movePlayed: number;
  won: boolean;
  lost: boolean;
}> {
  const results: Array<{ fp: string; moveIndex: number; movePlayed: number; won: boolean; lost: boolean }> = [];
  const won = game.winner === seat;
  const lost = game.winner !== null && game.winner !== seat;

  for (let i = 0; i < game.boardStates.length && i < game.moves.length; i++) {
    const boardAtMove = game.boardStates[i];
    // Determine whose turn it was
    const turnSeat: Seat = i % 2 === 0 ? 'X' : 'O';
    if (turnSeat !== seat) continue; // Only positions where it was this seat's turn

    results.push({
      fp: fingerprint(boardAtMove, seat),
      moveIndex: i,
      movePlayed: game.moves[i],
      won,
      lost,
    });
  }

  return results;
}

// ── Pattern analysis ─────────────────────────────────────────────────────────

export async function analyzePosition(
  board: Array<Seat | null>,
  seat: Seat
): Promise<HistoryInsight> {
  const games = await loadHistory();
  const currentFp = fingerprint(board, seat);
  const moveCount = board.filter(c => c !== null).length;

  // Find matching positions from past games
  const matches: Array<{ movePlayed: number; won: boolean; lost: boolean }> = [];

  for (const game of games) {
    const positions = extractPositions(game, seat);
    for (const pos of positions) {
      if (pos.fp === currentFp) {
        matches.push({ movePlayed: pos.movePlayed, won: pos.won, lost: pos.lost });
      }
    }
  }

  const totalGames = matches.length;
  const winsFromHere = matches.filter(m => m.won).length;
  const lossesFromHere = matches.filter(m => m.lost).length;
  const drawsFromHere = totalGames - winsFromHere - lossesFromHere;

  // Aggregate by move: which moves led to wins vs losses
  const moveStats = new Map<number, { wins: number; losses: number; total: number }>();
  for (const m of matches) {
    const s = moveStats.get(m.movePlayed) || { wins: 0, losses: 0, total: 0 };
    s.total++;
    if (m.won) s.wins++;
    if (m.lost) s.losses++;
    moveStats.set(m.movePlayed, s);
  }

  const winningMoves = [...moveStats.entries()]
    .filter(([_, s]) => s.wins > 0)
    .map(([move, s]) => ({ move, wins: s.wins, total: s.total }))
    .sort((a, b) => (b.wins / b.total) - (a.wins / a.total));

  const losingMoves = [...moveStats.entries()]
    .filter(([_, s]) => s.losses > 0)
    .map(([move, s]) => ({ move, losses: s.losses, total: s.total }))
    .sort((a, b) => (b.losses / b.total) - (a.losses / a.total));

  // Build advice string
  const advice = buildAdvice(totalGames, winsFromHere, lossesFromHere, winningMoves, losingMoves, seat);

  return { totalGames, winsFromHere, lossesFromHere, drawsFromHere, winningMoves, losingMoves, advice };
}

function buildAdvice(
  total: number,
  wins: number,
  losses: number,
  winningMoves: Array<{ move: number; wins: number; total: number }>,
  losingMoves: Array<{ move: number; losses: number; total: number }>,
  seat: Seat
): string {
  if (total === 0) return '';

  const parts: string[] = [];

  parts.push(`From this exact position in ${total} past game${total > 1 ? 's' : ''}: ${wins} win${wins !== 1 ? 's' : ''}, ${losses} loss${losses !== 1 ? 'es' : ''}, ${total - wins - losses} draw${total - wins - losses !== 1 ? 's' : ''}.`);

  if (winningMoves.length > 0) {
    const best = winningMoves.slice(0, 3);
    const desc = best.map(m => `${CELL_NAMES[m.move]} (won ${m.wins}/${m.total})`).join(', ');
    parts.push(`Moves that led to wins: ${desc}.`);
  }

  if (losingMoves.length > 0) {
    const worst = losingMoves.slice(0, 3);
    const desc = worst.map(m => `${CELL_NAMES[m.move]} (lost ${m.losses}/${m.total})`).join(', ');
    parts.push(`AVOID these moves that led to losses: ${desc}.`);
  }

  if (losses > wins && losses >= 2) {
    parts.push(`You have been losing from this position. Focus on defense and blocking the opponent's threats.`);
  }

  return parts.join(' ');
}

/**
 * Build a history context string suitable for injecting into an AI prompt.
 * Works for both Jev (TypeSafe) and LLM (OpenAI-compatible).
 */
export async function buildHistoryContext(
  board: Array<Seat | null>,
  seat: Seat
): Promise<string> {
  const insight = await analyzePosition(board, seat);
  return insight.advice;
}
