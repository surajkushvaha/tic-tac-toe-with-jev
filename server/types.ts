export type Seat = 'X' | 'O';

export type MoveResult = {
  move: number;
  probabilities?: Record<string, number>;
  confidence?: number;
  note?: string;
  fallback?: boolean;
  error?: string;
};

export type GameRecord = {
  id: string;
  timestamp: string;
  mode: string;
  moves: number[];
  xPlayer: string;
  oPlayer: string;
  winner: Seat | null;   // null = draw
  boardStates: Array<Array<Seat | null>>;
};

export type HistoryInsight = {
  totalGames: number;
  winsFromHere: number;
  lossesFromHere: number;
  drawsFromHere: number;
  winningMoves: Array<{ move: number; wins: number; total: number }>;
  losingMoves: Array<{ move: number; losses: number; total: number }>;
  advice: string;
};

export type ServerConfig = {
  jevAvailable: boolean;
  llmAvailable: boolean;
  defaultLlmModel: string;
  defaultJevModel: string;
};

export const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export const CELL_NAMES = ['top left','top centre','top right','middle left','centre','middle right','bottom left','bottom centre','bottom right'];
export const CORNERS = new Set([0, 2, 6, 8]);

export const otherSeat = (s: Seat): Seat => s === 'X' ? 'O' : 'X';
export const cellKind = (i: number) => i === 4 ? 'centre' : CORNERS.has(i) ? 'corner' : 'edge';
