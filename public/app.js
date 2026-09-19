// src/types.ts
var LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
var CELL_NAMES = ["top left", "top centre", "top right", "middle left", "centre", "middle right", "bottom left", "bottom centre", "bottom right"];
var other = (mark) => mark === "X" ? "O" : "X";
var pct = (p) => typeof p !== "number" ? "" : p < 0.01 ? "<1%" : `${Math.round(p * 100)}%`;

// src/settings.ts
class Settings {
  static STORE = "ttt-jev-arena-settings";
  values;
  constructor() {
    this.values = {
      jevModel: "jev-latest",
      llmModel: "",
      hints: true,
      delay: 700,
      autoNext: true,
      alternate: true,
      remember: false
    };
    try {
      const raw = localStorage.getItem(Settings.STORE);
      if (raw)
        this.values = { ...this.values, ...JSON.parse(raw) };
    } catch {}
  }
  get(key) {
    return this.values[key];
  }
  set(key, value) {
    this.values[key] = value;
    this.persist();
  }
  snapshot() {
    return { ...this.values };
  }
  persist() {
    try {
      if (this.values.remember)
        localStorage.setItem(Settings.STORE, JSON.stringify(this.values));
      else
        localStorage.removeItem(Settings.STORE);
    } catch {}
  }
}

// src/ui.ts
function buildSvg(seat) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("class", `glyph ${seat.toLowerCase()}`);
  svg.setAttribute("aria-hidden", "true");
  if (seat === "X") {
    const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p1.setAttribute("d", "M26 26L74 74");
    p1.setAttribute("pathLength", "1");
    const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p2.setAttribute("d", "M74 26L26 74");
    p2.setAttribute("pathLength", "1");
    svg.append(p1, p2);
  } else {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", "50");
    c.setAttribute("cy", "50");
    c.setAttribute("r", "25");
    c.setAttribute("pathLength", "1");
    svg.append(c);
  }
  return svg;
}
async function fetchJson(url, init = {}) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(data.error || "Request failed");
  return data;
}

// src/history.ts
var STORE_KEY = "ttt-jev-arena-history";
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw)
      return JSON.parse(raw);
  } catch {}
  return [];
}
function saveGame(record) {
  const games = loadHistory();
  games.push(record);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(games));
  } catch (err) {
    console.warn("Failed to save game to localStorage", err);
  }
}
function fingerprint(board, mySeat) {
  return board.map((c) => c === mySeat ? "M" : c === null ? "." : "O").join("");
}
function extractPositions(game, seat) {
  const results = [];
  const won = game.winner === seat;
  const lost = game.winner !== null && game.winner !== seat;
  for (let i = 0;i < game.boardStates.length && i < game.moves.length; i++) {
    const boardAtMove = game.boardStates[i];
    const turnSeat = i % 2 === 0 ? "X" : "O";
    if (turnSeat !== seat)
      continue;
    results.push({
      fp: fingerprint(boardAtMove, seat),
      moveIndex: i,
      movePlayed: game.moves[i],
      won,
      lost
    });
  }
  return results;
}
function analyzePosition(board, seat) {
  const games = loadHistory();
  const currentFp = fingerprint(board, seat);
  const matches = [];
  for (const game of games) {
    const positions = extractPositions(game, seat);
    for (const pos of positions) {
      if (pos.fp === currentFp) {
        matches.push({ movePlayed: pos.movePlayed, won: pos.won, lost: pos.lost });
      }
    }
  }
  const totalGames = matches.length;
  const winsFromHere = matches.filter((m) => m.won).length;
  const lossesFromHere = matches.filter((m) => m.lost).length;
  const drawsFromHere = totalGames - winsFromHere - lossesFromHere;
  const moveStats = new Map;
  for (const m of matches) {
    const s = moveStats.get(m.movePlayed) || { wins: 0, losses: 0, total: 0 };
    s.total++;
    if (m.won)
      s.wins++;
    if (m.lost)
      s.losses++;
    moveStats.set(m.movePlayed, s);
  }
  const winningMoves = [...moveStats.entries()].filter(([_, s]) => s.wins > 0).map(([move, s]) => ({ move, wins: s.wins, total: s.total })).sort((a, b) => b.wins / b.total - a.wins / a.total);
  const losingMoves = [...moveStats.entries()].filter(([_, s]) => s.losses > 0).map(([move, s]) => ({ move, losses: s.losses, total: s.total })).sort((a, b) => b.losses / b.total - a.losses / a.total);
  const advice = buildAdvice(totalGames, winsFromHere, lossesFromHere, winningMoves, losingMoves);
  return { totalGames, winsFromHere, lossesFromHere, drawsFromHere, winningMoves, losingMoves, advice };
}
function buildAdvice(total, wins, losses, winningMoves, losingMoves) {
  if (total === 0)
    return "";
  const parts = [];
  parts.push(`From this exact position in ${total} past game${total > 1 ? "s" : ""}: ${wins} win${wins !== 1 ? "s" : ""}, ${losses} loss${losses !== 1 ? "es" : ""}, ${total - wins - losses} draw${total - wins - losses !== 1 ? "s" : ""}.`);
  if (winningMoves.length > 0) {
    const best = winningMoves.slice(0, 3);
    const desc = best.map((m) => `${CELL_NAMES[m.move]} (won ${m.wins}/${m.total})`).join(", ");
    parts.push(`Moves that led to wins: ${desc}.`);
  }
  if (losingMoves.length > 0) {
    const worst = losingMoves.slice(0, 3);
    const desc = worst.map((m) => `${CELL_NAMES[m.move]} (lost ${m.losses}/${m.total})`).join(", ");
    parts.push(`AVOID these moves that led to losses: ${desc}.`);
  }
  if (losses > wins && losses >= 2) {
    parts.push(`You have been losing from this position. Focus on defense and blocking the opponent's threats.`);
  }
  return parts.join(" ");
}

// src/players.ts
class HumanPlayer {
  kind = "human";
  resolve = null;
  get label() {
    return "You";
  }
  choose(board, seat, { signal }) {
    return new Promise((resolve) => {
      this.resolve = resolve;
      signal.addEventListener("abort", () => this.resolve = null);
    }).then((move) => ({ move }));
  }
  submit(move) {
    if (this.resolve) {
      this.resolve(move);
      this.resolve = null;
    }
  }
}

class ServerAIPlayer {
  kind = "ai";
  endpoint;
  aiType;
  settings;
  constructor(aiType, settings) {
    this.aiType = aiType;
    this.endpoint = `/api/move/${aiType}`;
    this.settings = settings;
  }
  get label() {
    if (this.aiType === "jev")
      return "Jev";
    return this.settings.get("llmModel") || "LLM";
  }
  async choose(board, seat, { signal }) {
    const cfg = this.settings.snapshot();
    const insight = analyzePosition(board.board, seat);
    const body = {
      board: board.board,
      seat,
      historyAdvice: insight.advice
    };
    if (this.aiType === "jev") {
      body.model = cfg.jevModel || "jev-latest";
      body.hints = cfg.hints;
    } else {
      body.model = cfg.llmModel || undefined;
    }
    return fetchJson(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal
    });
  }
}

// src/app.ts
var MODES = {
  "human-jev": { title: "You vs Jev", a: "human", b: "jev", auto: false },
  "human-llm": { title: "You vs LLM", a: "human", b: "llm", auto: false },
  "jev-llm": { title: "Jev vs LLM", a: "jev", b: "llm", auto: true }
};

class App {
  root;
  settings = new Settings;
  human = new HumanPlayer;
  jev;
  llm;
  board = { board: Array(9).fill(null), turn: "X", result: null };
  mode = "human-jev";
  swap = false;
  stats = { a: 0, b: 0, draw: 0 };
  log = [];
  heat = null;
  fresh = -1;
  error = null;
  running = false;
  abort = null;
  gameMoves = [];
  gameBoardStates = [];
  ui = null;
  constructor(root) {
    this.root = root;
    this.jev = new ServerAIPlayer("jev", this.settings);
    this.llm = new ServerAIPlayer("llm", this.settings);
    this.build();
    this.newGame();
  }
  roles() {
    return this.swap ? { X: "b", O: "a" } : { X: "a", O: "b" };
  }
  actorFor(role) {
    const key = MODES[this.mode][role];
    return key === "human" ? this.human : key === "jev" ? this.jev : this.llm;
  }
  seatActor(seat) {
    return this.actorFor(this.roles()[seat]);
  }
  seatLabel(seat) {
    return this.seatActor(seat).label;
  }
  stop() {
    this.abort?.abort();
  }
  resetBoard() {
    this.board = { board: Array(9).fill(null), turn: "X", result: null };
    this.log = [];
    this.heat = null;
    this.fresh = -1;
    this.error = null;
    this.gameMoves = [];
    this.gameBoardStates = [[...Array(9).fill(null)]];
  }
  newGame() {
    this.stop();
    this.resetBoard();
    this.render();
    if (!MODES[this.mode].auto)
      this.play();
  }
  setMode(mode) {
    if (mode === this.mode)
      return;
    this.stop();
    this.mode = mode;
    this.swap = false;
    this.stats = { a: 0, b: 0, draw: 0 };
    this.newGame();
  }
  toggleRun() {
    if (this.running) {
      this.stop();
      return;
    }
    if (this.board.result)
      this.resetBoard();
    this.play();
  }
  applyMove(seat, result) {
    if (result.move < 0 || result.move > 8 || this.board.board[result.move] !== null)
      return;
    this.gameMoves.push(result.move);
    this.board.board[result.move] = seat;
    this.heat = result.probabilities ?? null;
    this.fresh = result.move;
    this.gameBoardStates.push([...this.board.board]);
    this.log.push({
      seat,
      who: this.seatLabel(seat),
      cell: CELL_NAMES[result.move],
      detail: result.note || (result.probabilities ? `${pct(result.probabilities[String(result.move)])} on this cell` : ""),
      warn: !!result.fallback
    });
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
  async recordGame() {
    if (!this.board.result)
      return;
    const roles = this.roles();
    const record = {
      id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      mode: this.mode,
      moves: this.gameMoves,
      xPlayer: this.actorFor(roles.X === "a" ? "a" : "b").label,
      oPlayer: this.actorFor(roles.O === "a" ? "a" : "b").label,
      winner: this.board.result.winner,
      boardStates: this.gameBoardStates
    };
    try {
      await saveGame(record);
    } catch (err) {
      console.warn("Failed to save game history:", err);
    }
    if (!this.board.result.winner)
      this.stats.draw++;
    else
      this.stats[this.roles()[this.board.result.winner]]++;
  }
  async play() {
    this.abort?.abort();
    const ctrl = new AbortController;
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
        if (signal.aborted)
          return;
        this.applyMove(seat, result);
        if (this.board.result)
          break;
        if (actor.kind === "ai") {
          await new Promise((r) => setTimeout(r, Number(this.settings.get("delay") || 0)));
        }
      }
      await this.recordGame();
      this.render();
    } catch (err) {
      if (err?.name !== "AbortError") {
        this.error = err?.message || "Move failed";
      }
      this.render();
    } finally {
      this.running = false;
      this.render();
    }
  }
  onCell(index) {
    if (this.board.board[index] !== null || this.board.result)
      return;
    this.human.submit(index);
    this.applyMove(this.board.turn, { move: index });
  }
  build() {
    const app = document.createElement("div");
    app.className = "wrap";
    const header = document.createElement("header");
    header.innerHTML = "<h1>Tic-tac-toe with Jev</h1><p>Jev and the LLM learn from every game. The more you play, the smarter they get.</p>";
    const modes = document.createElement("div");
    modes.className = "modes";
    for (const [key, meta] of Object.entries(MODES)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = meta.title;
      btn.dataset.mode = key;
      btn.addEventListener("click", () => this.setMode(key));
      modes.appendChild(btn);
    }
    const status = document.createElement("div");
    status.className = "status";
    const board = document.createElement("div");
    board.className = "board";
    const controls = document.createElement("div");
    controls.className = "controls";
    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "btn";
    newBtn.textContent = "New game";
    newBtn.addEventListener("click", () => this.newGame());
    const swapBtn = document.createElement("button");
    swapBtn.type = "button";
    swapBtn.className = "btn";
    swapBtn.textContent = "Swap sides";
    swapBtn.addEventListener("click", () => {
      this.swap = !this.swap;
      this.newGame();
    });
    const runBtn = document.createElement("button");
    runBtn.type = "button";
    runBtn.className = "btn primary";
    runBtn.addEventListener("click", () => this.toggleRun());
    controls.append(runBtn, newBtn, swapBtn);
    const score = document.createElement("div");
    score.className = "score";
    const logList = document.createElement("ol");
    logList.className = "log";
    const settingsPanel = this.buildSettings();
    const left = document.createElement("section");
    left.className = "panel";
    left.append(modes, status, board, controls);
    const right = document.createElement("div");
    right.style.display = "grid";
    right.style.gap = "22px";
    const scorePanel = document.createElement("section");
    scorePanel.className = "panel";
    scorePanel.innerHTML = "<h2>Scoreboard</h2>";
    scorePanel.append(score);
    const logPanel = document.createElement("section");
    logPanel.className = "panel";
    logPanel.innerHTML = "<h2>Moves</h2>";
    logPanel.append(logList);
    right.append(scorePanel, logPanel);
    const layout = document.createElement("div");
    layout.className = "layout";
    layout.append(left, right);
    app.append(header, layout, settingsPanel);
    this.root.append(app);
    this.ui = { status, board, score, logList, runBtn, modes, settingsPanel };
    this.render();
  }
  buildSettings() {
    const details = document.createElement("details");
    details.className = "panel";
    details.innerHTML = "<summary>Settings</summary>";
    const fields = document.createElement("div");
    fields.className = "fields";
    const jevBox = document.createElement("fieldset");
    jevBox.innerHTML = "<legend>Jev (TypeSafe)</legend>";
    const jevModel = this.field("Model", "jevModel", { placeholder: "jev-latest" });
    const hints = document.createElement("label");
    hints.className = "check";
    const hintsBox = document.createElement("input");
    hintsBox.type = "checkbox";
    hintsBox.checked = !!this.settings.get("hints");
    hintsBox.addEventListener("change", () => this.settings.set("hints", hintsBox.checked));
    hints.append(hintsBox, document.createTextNode("Tactical hints in prompts"));
    jevBox.append(jevModel, hints);
    const llmBox = document.createElement("fieldset");
    llmBox.innerHTML = "<legend>OpenAI-compatible LLM</legend>";
    llmBox.append(this.field("Model", "llmModel", { placeholder: "e.g. gpt-4o-mini" }));
    const general = document.createElement("fieldset");
    general.innerHTML = "<legend>General</legend>";
    const delay = this.field("AI move delay (ms)", "delay", { type: "number" });
    const remember = document.createElement("label");
    remember.className = "check";
    const rememberBox = document.createElement("input");
    rememberBox.type = "checkbox";
    rememberBox.checked = !!this.settings.get("remember");
    rememberBox.addEventListener("change", () => this.settings.set("remember", rememberBox.checked));
    remember.append(rememberBox, document.createTextNode("Remember settings"));
    general.append(delay, remember);
    fields.append(jevBox, llmBox, general);
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "API keys are in the server .env file. Both AIs learn from game history — the more you play, the better they defend.";
    details.append(fields, note);
    return details;
  }
  field(labelText, key, extra = {}) {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const label = document.createElement("span");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = extra.type || "text";
    input.placeholder = extra.placeholder || "";
    input.value = String(this.settings.get(key) ?? "");
    input.addEventListener("input", () => {
      this.settings.set(key, extra.type === "number" ? Number(input.value) || 0 : input.value.trim());
    });
    wrap.append(label, input);
    return wrap;
  }
  render() {
    const ui = this.ui;
    if (!ui)
      return;
    ui.modes.querySelectorAll("button").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.mode === this.mode));
    });
    const currentMode = MODES[this.mode];
    ui.runBtn.textContent = this.running ? "Pause" : this.board.result ? "Play again" : "Start";
    ui.status.className = "status";
    ui.status.innerHTML = "";
    if (this.error) {
      ui.status.classList.add("bad");
      const p = document.createElement("p");
      p.textContent = this.error;
      const row = document.createElement("div");
      row.className = "row";
      const retryBtn = document.createElement("button");
      retryBtn.className = "btn";
      retryBtn.type = "button";
      retryBtn.textContent = "Retry";
      retryBtn.addEventListener("click", () => this.play());
      row.append(retryBtn);
      ui.status.append(p, row);
      return;
    }
    if (this.board.result) {
      ui.status.classList.add("done");
      const p = document.createElement("p");
      p.className = "headline";
      p.textContent = this.board.result.winner ? `${this.seatLabel(this.board.result.winner)} wins as ${this.board.result.winner}` : "Draw";
      ui.status.appendChild(p);
    } else {
      const p = document.createElement("p");
      p.className = "headline";
      const actor = this.seatActor(this.board.turn);
      if (this.running && actor.kind === "ai") {
        p.textContent = `${actor.label} is thinking as ${this.board.turn}`;
      } else if (this.running) {
        p.textContent = `Your move, ${this.board.turn}`;
      } else if (currentMode.auto) {
        p.textContent = "Press Start to begin";
        p.className = "";
      } else {
        p.textContent = `Your move, ${this.board.turn}`;
      }
      ui.status.appendChild(p);
    }
    ui.board.innerHTML = "";
    const winSet = new Set(this.board.result?.line ?? []);
    for (let i = 0;i < 9; i++) {
      const mark = this.board.board[i];
      const cell = document.createElement("button");
      cell.type = "button";
      const cls = ["cell"];
      if (mark)
        cls.push("filled");
      if (winSet.has(i))
        cls.push("win");
      if (i === this.fresh)
        cls.push("fresh");
      cell.className = cls.join(" ");
      cell.setAttribute("aria-label", `${CELL_NAMES[i]}, ${mark ?? "empty"}`);
      if (mark)
        cell.appendChild(buildSvg(mark));
      if (this.heat && typeof this.heat[String(i)] === "number") {
        const span = document.createElement("span");
        span.className = "pct";
        span.textContent = pct(this.heat[String(i)]);
        cell.appendChild(span);
        cell.style.setProperty("--heat", String(this.heat[String(i)]));
      }
      if (!mark && !this.board.result && this.mode !== "jev-llm") {
        cell.classList.add("playable");
        cell.addEventListener("click", () => this.onCell(i));
      }
      ui.board.appendChild(cell);
    }
    const roles = this.roles();
    const items = [
      { label: this.actorFor("a").label, seat: roles.X === "a" ? "X" : "O", value: this.stats.a },
      { label: "Draws", seat: "", value: this.stats.draw },
      { label: this.actorFor("b").label, seat: roles.X === "b" ? "X" : "O", value: this.stats.b }
    ];
    ui.score.innerHTML = "";
    for (const item of items) {
      const tile = document.createElement("div");
      tile.className = item.label === "Draws" ? "tile d" : "tile";
      const name = document.createElement("span");
      name.className = "tname";
      name.textContent = item.label;
      tile.appendChild(name);
      if (item.seat) {
        const s = document.createElement("span");
        s.className = `tseat ${item.seat.toLowerCase()}`;
        s.textContent = `plays ${item.seat}`;
        tile.appendChild(s);
      }
      const val = document.createElement("strong");
      val.textContent = String(item.value);
      tile.appendChild(val);
      ui.score.appendChild(tile);
    }
    ui.logList.innerHTML = "";
    if (!this.log.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No moves yet.";
      ui.logList.appendChild(li);
    } else {
      this.log.forEach((entry, idx) => {
        const li = document.createElement("li");
        li.className = `${entry.seat.toLowerCase()}${entry.warn ? " warn" : ""}`;
        const span = document.createElement("span");
        span.textContent = `${idx + 1}. ${entry.who} (${entry.seat}) took ${entry.cell}`;
        li.appendChild(span);
        if (entry.detail) {
          const small = document.createElement("small");
          small.textContent = entry.detail;
          li.appendChild(small);
        }
        ui.logList.appendChild(li);
      });
    }
  }
}

// src/main.ts
var target = document.getElementById("app");
if (target)
  new App(target);
