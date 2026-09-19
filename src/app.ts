import { type Seat, type GameState, type GameRecord, type MoveResult, LINES, CELL_NAMES, other, pct } from './types';
import { Settings } from './settings';
import { HumanPlayer, ServerAIPlayer } from './players';
import { buildSvg, fetchJson } from './ui';

const MODES = {
  'human-jev': { title: 'You vs Jev', a: 'human', b: 'jev', auto: false },
  'human-llm': { title: 'You vs LLM', a: 'human', b: 'llm', auto: false },
  'jev-llm':   { title: 'Jev vs LLM', a: 'jev',   b: 'llm', auto: true },
} as const;

export class App {
  private readonly root: HTMLElement;
  private readonly settings = new Settings();
  private readonly human = new HumanPlayer();
  private readonly jev: ServerAIPlayer;
  private readonly llm: ServerAIPlayer;

  private board: GameState = { board: Array(9).fill(null), turn: 'X', result: null };
  private mode: keyof typeof MODES = 'human-jev';
  private swap = false;
  private stats = { a: 0, b: 0, draw: 0 };
  private log: Array<{ seat: Seat; who: string; cell: string; detail?: string; warn?: boolean }> = [];
  private heat: Record<string, number> | null = null;
  private fresh = -1;
  private error: string | null = null;
  private running = false;
  private abort: AbortController | null = null;

  // History tracking for current game
  private gameMoves: number[] = [];
  private gameBoardStates: Array<Array<Seat | null>> = [];

  private ui: {
    status: HTMLElement;
    board: HTMLElement;
    score: HTMLElement;
    logList: HTMLElement;
    runBtn: HTMLButtonElement;
    modes: HTMLElement;
    settingsPanel: HTMLElement;
  } | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.jev = new ServerAIPlayer('jev', this.settings);
    this.llm = new ServerAIPlayer('llm', this.settings);
    this.build();
    this.newGame();
  }

  // ── Roles / actors ─────────────────────────────────────────────────────

  private roles() {
    return this.swap ? { X: 'b' as const, O: 'a' as const } : { X: 'a' as const, O: 'b' as const };
  }

  private actorFor(role: 'a' | 'b') {
    const key = MODES[this.mode][role];
    return key === 'human' ? this.human : key === 'jev' ? this.jev : this.llm;
  }

  private seatActor(seat: Seat) {
    return this.actorFor(this.roles()[seat]);
  }

  private seatLabel(seat: Seat) {
    return this.seatActor(seat).label;
  }

  // ── Game flow ──────────────────────────────────────────────────────────

  private stop() { this.abort?.abort(); }

  private resetBoard() {
    this.board = { board: Array(9).fill(null), turn: 'X', result: null };
    this.log = [];
    this.heat = null;
    this.fresh = -1;
    this.error = null;
    this.gameMoves = [];
    this.gameBoardStates = [[...Array(9).fill(null)]];
  }

  private newGame() {
    this.stop();
    this.resetBoard();
    this.render();
    if (!MODES[this.mode].auto) this.play();
  }

  private setMode(mode: keyof typeof MODES) {
    if (mode === this.mode) return;
    this.stop();
    this.mode = mode;
    this.swap = false;
    this.stats = { a: 0, b: 0, draw: 0 };
    this.newGame();
  }

  private toggleRun() {
    if (this.running) { this.stop(); return; }
    if (this.board.result) this.resetBoard();
    this.play();
  }

  private applyMove(seat: Seat, result: MoveResult) {
    if (result.move < 0 || result.move > 8 || this.board.board[result.move] !== null) return;

    // Record for history
    this.gameMoves.push(result.move);

    this.board.board[result.move] = seat;
    this.heat = result.probabilities ?? null;
    this.fresh = result.move;

    // Save board state after move
    this.gameBoardStates.push([...this.board.board]);

    this.log.push({
      seat,
      who: this.seatLabel(seat),
      cell: CELL_NAMES[result.move],
      detail: result.note || (result.probabilities ? `${pct(result.probabilities[String(result.move)])} on this cell` : ''),
      warn: !!result.fallback,
    });

    // Check for winner
    for (const line of LINES) {
      const [a, b, c] = line;
      if (this.board.board[a] && this.board.board[a] === this.board.board[b] && this.board.board[a] === this.board.board[c]) {
        this.board.result = { winner: this.board.board[a], line: [...line], draw: false };
        return this.render();
      }
    }

    if (this.board.board.every(Boolean)) {
      this.board.result = { winner: null, line: [], draw: true };
      return this.render();
    }

    this.board.turn = other(seat);
    this.render();
  }

  /** Post the completed game to the server for history learning. */
  private async recordGame() {
    if (!this.board.result) return;

    const roles = this.roles();
    const record: GameRecord = {
      id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      mode: this.mode,
      moves: this.gameMoves,
      xPlayer: this.actorFor(roles.X === 'a' ? 'a' : 'b').label,
      oPlayer: this.actorFor(roles.O === 'a' ? 'a' : 'b').label,
      winner: this.board.result.winner,
      boardStates: this.gameBoardStates,
    };

    try {
      await fetchJson('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch (err) {
      console.warn('Failed to save game history:', err);
    }

    // Update stats
    if (!this.board.result.winner) this.stats.draw++;
    else this.stats[this.roles()[this.board.result.winner]]++;
  }

  private async play() {
    this.abort?.abort();
    const ctrl = new AbortController();
    this.abort = ctrl;
    const { signal } = ctrl;
    this.running = true;
    this.error = null;
    this.render();

    try {
      while (!this.board.result) {
        const seat = this.board.turn;
        const actor = this.seatActor(seat);
        this.render();
        const result = await actor.choose(this.board, seat, { signal });
        if (signal.aborted) return;
        this.applyMove(seat, result);
        if (this.board.result) break;
        if (actor.kind === 'ai') {
          await new Promise(r => setTimeout(r, Number(this.settings.get('delay') || 0)));
        }
      }

      // Game over — save to history
      await this.recordGame();
      this.render();

    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        this.error = err?.message || 'Move failed';
      }
      this.render();
    } finally {
      this.running = false;
      this.render();
    }
  }

  private onCell(index: number) {
    if (this.board.board[index] !== null || this.board.result) return;
    this.human.submit(index);
    this.applyMove(this.board.turn, { move: index });
  }

  // ── Build UI ───────────────────────────────────────────────────────────

  private build() {
    const app = document.createElement('div');
    app.className = 'wrap';

    const header = document.createElement('header');
    header.innerHTML = '<h1>Tic-tac-toe with Jev</h1><p>Jev and the LLM learn from every game. The more you play, the smarter they get.</p>';

    const modes = document.createElement('div');
    modes.className = 'modes';
    for (const [key, meta] of Object.entries(MODES)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = meta.title;
      btn.dataset.mode = key;
      btn.addEventListener('click', () => this.setMode(key as keyof typeof MODES));
      modes.appendChild(btn);
    }

    const status = document.createElement('div');
    status.className = 'status';

    const board = document.createElement('div');
    board.className = 'board';

    const controls = document.createElement('div');
    controls.className = 'controls';

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'btn';
    newBtn.textContent = 'New game';
    newBtn.addEventListener('click', () => this.newGame());

    const swapBtn = document.createElement('button');
    swapBtn.type = 'button';
    swapBtn.className = 'btn';
    swapBtn.textContent = 'Swap sides';
    swapBtn.addEventListener('click', () => { this.swap = !this.swap; this.newGame(); });

    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'btn primary';
    runBtn.addEventListener('click', () => this.toggleRun());

    controls.append(runBtn, newBtn, swapBtn);

    const score = document.createElement('div');
    score.className = 'score';

    const logList = document.createElement('ol');
    logList.className = 'log';

    const settingsPanel = this.buildSettings();

    const left = document.createElement('section');
    left.className = 'panel';
    left.append(modes, status, board, controls);

    const right = document.createElement('div');
    right.style.display = 'grid';
    right.style.gap = '22px';

    const scorePanel = document.createElement('section');
    scorePanel.className = 'panel';
    scorePanel.innerHTML = '<h2>Scoreboard</h2>';
    scorePanel.append(score);

    const logPanel = document.createElement('section');
    logPanel.className = 'panel';
    logPanel.innerHTML = '<h2>Moves</h2>';
    logPanel.append(logList);

    right.append(scorePanel, logPanel);

    const layout = document.createElement('div');
    layout.className = 'layout';
    layout.append(left, right);

    app.append(header, layout, settingsPanel);
    this.root.append(app);

    this.ui = { status, board, score, logList, runBtn: runBtn as HTMLButtonElement, modes, settingsPanel };
    this.render();
  }

  private buildSettings() {
    const details = document.createElement('details');
    details.className = 'panel';
    details.innerHTML = '<summary>Settings</summary>';

    const fields = document.createElement('div');
    fields.className = 'fields';

    const jevBox = document.createElement('fieldset');
    jevBox.innerHTML = '<legend>Jev (TypeSafe)</legend>';
    const jevModel = this.field('Model', 'jevModel', { placeholder: 'jev-latest' });
    const hints = document.createElement('label');
    hints.className = 'check';
    const hintsBox = document.createElement('input');
    hintsBox.type = 'checkbox';
    hintsBox.checked = !!this.settings.get('hints');
    hintsBox.addEventListener('change', () => this.settings.set('hints', hintsBox.checked));
    hints.append(hintsBox, document.createTextNode('Tactical hints in prompts'));
    jevBox.append(jevModel, hints);

    const llmBox = document.createElement('fieldset');
    llmBox.innerHTML = '<legend>OpenAI-compatible LLM</legend>';
    llmBox.append(this.field('Model', 'llmModel', { placeholder: 'e.g. gpt-4o-mini' }));

    const general = document.createElement('fieldset');
    general.innerHTML = '<legend>General</legend>';
    const delay = this.field('AI move delay (ms)', 'delay', { type: 'number' });
    const remember = document.createElement('label');
    remember.className = 'check';
    const rememberBox = document.createElement('input');
    rememberBox.type = 'checkbox';
    rememberBox.checked = !!this.settings.get('remember');
    rememberBox.addEventListener('change', () => this.settings.set('remember', rememberBox.checked));
    remember.append(rememberBox, document.createTextNode('Remember settings'));
    general.append(delay, remember);

    fields.append(jevBox, llmBox, general);

    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'API keys are in the server .env file. Both AIs learn from game history — the more you play, the better they defend.';

    details.append(fields, note);
    return details;
  }

  private field(labelText: string, key: string, extra: Record<string, any> = {}) {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const label = document.createElement('span');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = extra.type || 'text';
    input.placeholder = extra.placeholder || '';
    input.value = String(this.settings.get(key) ?? '');
    input.addEventListener('input', () => {
      this.settings.set(key, extra.type === 'number' ? Number(input.value) || 0 : input.value.trim());
    });
    wrap.append(label, input);
    return wrap;
  }

  // ── Render ─────────────────────────────────────────────────────────────

  private render() {
    const ui = this.ui;
    if (!ui) return;

    // Mode tabs
    ui.modes.querySelectorAll('button').forEach((btn: Element) => {
      (btn as HTMLButtonElement).setAttribute('aria-pressed', String((btn as HTMLButtonElement).dataset.mode === this.mode));
    });

    const currentMode = MODES[this.mode];
    ui.runBtn.textContent = this.running ? 'Pause' : this.board.result ? 'Play again' : 'Start';

    // Status
    ui.status.className = 'status';
    ui.status.innerHTML = '';

    if (this.error) {
      ui.status.classList.add('bad');
      const p = document.createElement('p');
      p.textContent = this.error;
      const row = document.createElement('div');
      row.className = 'row';
      const retryBtn = document.createElement('button');
      retryBtn.className = 'btn';
      retryBtn.type = 'button';
      retryBtn.textContent = 'Retry';
      retryBtn.addEventListener('click', () => this.play());
      row.append(retryBtn);
      ui.status.append(p, row);
      return;
    }

    if (this.board.result) {
      ui.status.classList.add('done');
      const p = document.createElement('p');
      p.className = 'headline';
      p.textContent = this.board.result.winner
        ? `${this.seatLabel(this.board.result.winner)} wins as ${this.board.result.winner}`
        : 'Draw';
      ui.status.appendChild(p);
    } else {
      const p = document.createElement('p');
      p.className = 'headline';
      const actor = this.seatActor(this.board.turn);
      if (this.running && actor.kind === 'ai') {
        p.textContent = `${actor.label} is thinking as ${this.board.turn}`;
      } else if (this.running) {
        p.textContent = `Your move, ${this.board.turn}`;
      } else if (currentMode.auto) {
        p.textContent = 'Press Start to begin';
        p.className = '';
      } else {
        p.textContent = `Your move, ${this.board.turn}`;
      }
      ui.status.appendChild(p);
    }

    // Board
    ui.board.innerHTML = '';
    const winSet = new Set(this.board.result?.line ?? []);

    for (let i = 0; i < 9; i++) {
      const mark = this.board.board[i];
      const cell = document.createElement('button');
      cell.type = 'button';
      const cls = ['cell'];
      if (mark) cls.push('filled');
      if (winSet.has(i)) cls.push('win');
      if (i === this.fresh) cls.push('fresh');
      cell.className = cls.join(' ');
      cell.setAttribute('aria-label', `${CELL_NAMES[i]}, ${mark ?? 'empty'}`);

      if (mark) cell.appendChild(buildSvg(mark));

      if (this.heat && typeof this.heat[String(i)] === 'number') {
        const span = document.createElement('span');
        span.className = 'pct';
        span.textContent = pct(this.heat[String(i)]);
        cell.appendChild(span);
        cell.style.setProperty('--heat', String(this.heat[String(i)]));
      }

      if (!mark && !this.board.result && this.mode !== 'jev-llm') {
        cell.classList.add('playable');
        cell.addEventListener('click', () => this.onCell(i));
      }

      ui.board.appendChild(cell);
    }

    // Scoreboard
    const roles = this.roles();
    const items = [
      { label: this.actorFor('a').label, seat: roles.X === 'a' ? 'X' : 'O', value: this.stats.a },
      { label: 'Draws', seat: '', value: this.stats.draw },
      { label: this.actorFor('b').label, seat: roles.X === 'b' ? 'X' : 'O', value: this.stats.b },
    ];
    ui.score.innerHTML = '';
    for (const item of items) {
      const tile = document.createElement('div');
      tile.className = item.label === 'Draws' ? 'tile d' : 'tile';
      const name = document.createElement('span');
      name.className = 'tname';
      name.textContent = item.label;
      tile.appendChild(name);
      if (item.seat) {
        const s = document.createElement('span');
        s.className = `tseat ${item.seat.toLowerCase()}`;
        s.textContent = `plays ${item.seat}`;
        tile.appendChild(s);
      }
      const val = document.createElement('strong');
      val.textContent = String(item.value);
      tile.appendChild(val);
      ui.score.appendChild(tile);
    }

    // Log
    ui.logList.innerHTML = '';
    if (!this.log.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No moves yet.';
      ui.logList.appendChild(li);
    } else {
      this.log.forEach((entry, idx) => {
        const li = document.createElement('li');
        li.className = `${entry.seat.toLowerCase()}${entry.warn ? ' warn' : ''}`;
        const span = document.createElement('span');
        span.textContent = `${idx + 1}. ${entry.who} (${entry.seat}) took ${entry.cell}`;
        li.appendChild(span);
        if (entry.detail) {
          const small = document.createElement('small');
          small.textContent = entry.detail;
          li.appendChild(small);
        }
        ui.logList.appendChild(li);
      });
    }
  }
}
