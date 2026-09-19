# Tic-Tac-Toe with Jev 🎮

A fun weekend project built to experiment with **Jev (TypeSafe AI)** and test its capabilities in game logic, probability-based decision making, and tactical reasoning.

This project features a fully playable Tic-Tac-Toe web app where you can play against Jev, an OpenAI-compatible LLM, or even watch them play against each other.

## Features

- **Jev (TypeSafe) Integration:** Jev evaluates the board and returns a probability distribution over the available cells. The UI visualizes this confidence using a heatmap overlay on the board!
- **LLM Compatibility:** Drop in any OpenAI-compatible API endpoint (like Ollama, Groq, or OpenAI) to play against an LLM.
- **Auto-Play Arena:** Put Jev and an LLM in the ring together in "Jev vs LLM" mode and watch them battle it out automatically.
- **Game History Learning:** The more you play, the smarter the AIs get. The backend records every game, analyzes winning/losing patterns for specific board positions, and injects this historical context into the AI prompts. They literally learn from their mistakes!
- **Clean Architecture:** A lightweight Bun backend (`server/`) handles all API keys and prompt construction, serving a static, bundled frontend (`src/`).

## Setup

1. **Install Dependencies:**
   Ensure you have [Bun](https://bun.sh/) installed.
   ```bash
   bun install
   ```

2. **Configure Environment:**
   Create a `.env` file in the root directory (it's gitignored) and add your API keys:
   ```env
   # Required for Jev
   TYPESAFE_API_KEY=your_typesafe_key

   # Optional: For LLM opponent (works with OpenAI, Ollama, etc.)
   LLM_BASE_URL=https://api.openai.com/v1
   LLM_API_KEY=your_llm_key
   LLM_MODEL=gpt-4o-mini
   ```

3. **Start the Development Server:**
   ```bash
   bun run dev
   ```
   The backend will start at `http://localhost:3000`.

## Architecture

The project was recently refactored to ensure API keys remain secure and the codebase stays modular:

- `src/` (Frontend): Contains the game state logic, UI rendering, and Settings. It's bundled into `app.js` using Bun.
- `server/` (Backend): A Bun HTTP server that serves the frontend, proxies AI requests to hide API keys, handles the TypeSafe/LLM prompt engineering, and manages the Game History learning engine.
- `data/history.json`: Local storage for the history learning engine.

## The Learning Engine

Every time a game concludes, the moves are saved to `data/history.json`. Before Jev or the LLM makes a move, the server's history module fingerprints the current board, searches the JSON for past identical scenarios, and injects a summary into the AI's system prompt (e.g., *"You've lost 3 times from this position when you didn't take the center. Moves that led to wins: center, top-left"*).

## License

MIT - Feel free to fork and experiment!
