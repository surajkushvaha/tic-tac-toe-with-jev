import type { Seat, MoveResult, GameState } from './types';
import { fetchJson } from './ui';
import type { Settings } from './settings';
import { analyzePosition } from './history';

export interface Player {
  kind: 'human' | 'ai';
  label: string;
  choose(board: GameState, seat: Seat, ctx: { signal: AbortSignal }): Promise<MoveResult>;
}

export class HumanPlayer implements Player {
  kind = 'human' as const;
  private resolve: ((move: number) => void) | null = null;
  
  get label() { return 'You'; }

  choose(board: GameState, seat: Seat, { signal }: { signal: AbortSignal }): Promise<MoveResult> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      signal.addEventListener('abort', () => this.resolve = null);
    }).then(move => ({ move: move as number }));
  }

  submit(move: number) {
    if (this.resolve) {
      this.resolve(move);
      this.resolve = null;
    }
  }
}

export class ServerAIPlayer implements Player {
  kind = 'ai' as const;
  private endpoint: string;
  private aiType: 'jev' | 'llm';
  private settings: Settings;

  constructor(aiType: 'jev' | 'llm', settings: Settings) {
    this.aiType = aiType;
    this.endpoint = `/api/move/${aiType}`;
    this.settings = settings;
  }

  get label() {
    if (this.aiType === 'jev') return 'Jev';
    return this.settings.get('llmModel') || 'LLM';
  }

  async choose(board: GameState, seat: Seat, { signal }: { signal: AbortSignal }): Promise<MoveResult> {
    const cfg = this.settings.snapshot();
    const insight = analyzePosition(board.board, seat);

    const body: Record<string, any> = { 
      board: board.board, 
      seat,
      historyAdvice: insight.advice,
    };

    if (this.aiType === 'jev') {
      body.model = cfg.jevModel || 'jev-latest';
      body.hints = cfg.hints;
    } else {
      body.model = cfg.llmModel || undefined;
    }

    return fetchJson(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  }
}
