import type { Seat, MoveResult, GameState } from './types';
import { fetchJson } from './ui';
import { Settings } from './settings';

export class HumanPlayer {
  kind = 'human';
  private resolve: ((value: MoveResult) => void) | null = null;

  get label() { return 'You'; }
  get waiting() { return this.resolve !== null; }

  choose(_board: GameState, _seat: Seat, { signal }: { signal: AbortSignal }) {
    return new Promise<MoveResult>((resolve, reject) => {
      this.resolve = resolve;
      signal.addEventListener('abort', () => {
        this.resolve = null;
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }

  submit(move: number) {
    if (!this.resolve) return false;
    const done = this.resolve;
    this.resolve = null;
    done({ move });
    return true;
  }
}

export class ServerAIPlayer {
  kind = 'ai';
  private readonly endpoint: string;
  private readonly aiType: 'jev' | 'llm';
  private readonly settings: Settings;

  constructor(aiType: 'jev' | 'llm', settings: Settings) {
    this.aiType = aiType;
    this.endpoint = `/api/move/${aiType}`;
    this.settings = settings;
  }

  get label(): string {
    if (this.aiType === 'jev') return 'Jev';
    return this.settings.get('llmModel') || 'LLM';
  }

  async choose(board: GameState, seat: Seat, { signal }: { signal: AbortSignal }): Promise<MoveResult> {
    const cfg = this.settings.snapshot();
    const body: Record<string, unknown> = { board: board.board, seat };

    if (this.aiType === 'jev') {
      body.model = cfg.jevModel || 'jev-latest';
      body.hints = cfg.hints;
    } else {
      body.model = cfg.llmModel || undefined;
    }

    return fetchJson<MoveResult>(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  }
}
