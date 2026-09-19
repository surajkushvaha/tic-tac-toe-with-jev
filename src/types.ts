export type Seat = 'X' | 'O';

export type MoveResult = {
  move: number;
  probabilities?: Record<string, number>;
  confidence?: number;
  note?: string;
  fallback?: boolean;
};

export type GameStatus = {
  winner: Seat | null;
  line: number[];
  draw: boolean;
};

export type GameState = {
  board: Array<Seat | null>;
  turn: Seat;
  result: GameStatus | null;
};

export type GameRecord = {
  id: string;
  timestamp: string;
  mode: string;
  moves: number[];
  xPlayer: string;
  oPlayer: string;
  winner: Seat | null;
  boardStates: Array<Array<Seat | null>>;
};

export const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]] as const;
export const CELL_NAMES = ['top left','top centre','top right','middle left','centre','middle right','bottom left','bottom centre','bottom right'];

export const other = (mark: Seat): Seat => mark === 'X' ? 'O' : 'X';
export const pct = (p?: number) => typeof p !== 'number' ? '' : p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`;
