import { loadDotEnv, getTypesafeKey, getLlmBase, getLlmModel, getLlmKey, getPort } from './env';
import { handleJevMove } from './jev';
import { handleLlmMove } from './llm';
import { saveGame, getStats, loadHistory } from './history';
import { serveIndex, serveStatic } from './static';
import type { GameRecord, ServerConfig } from './types';

declare const Bun: {
  serve(options: any): any;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Cache-Control': 'no-store',
    },
  });
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

await loadDotEnv();
const PORT = getPort();

const server = Bun.serve({
  port: PORT,

  async fetch(req: Request) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
      });
    }

    try {
      // ── API routes ─────────────────────────────────────────────────────

      if (url.pathname === '/api/health') {
        return json({ ok: true });
      }

      if (url.pathname === '/api/config') {
        const config: ServerConfig = {
          jevAvailable: !!getTypesafeKey(),
          llmAvailable: !!getLlmKey() || !!getLlmBase(),
          defaultLlmModel: getLlmModel(),
          defaultJevModel: 'jev-latest',
        };
        return json(config as any);
      }

      if (url.pathname === '/api/move/jev' && req.method === 'POST') {
        const body = await readBody(req);
        return handleJevMove(body);
      }

      if (url.pathname === '/api/move/llm' && req.method === 'POST') {
        const body = await readBody(req);
        return handleLlmMove(body);
      }

      if (url.pathname === '/api/history' && req.method === 'POST') {
        const body = await readBody(req) as unknown as GameRecord;
        if (!body.id || !body.moves || !body.boardStates) {
          return json({ error: 'Invalid game record.' }, 400);
        }
        await saveGame(body);
        console.log(`[History] Saved game ${body.id}: winner=${body.winner ?? 'draw'}, ${body.moves.length} moves`);
        return json({ ok: true });
      }

      if (url.pathname === '/api/history' && req.method === 'GET') {
        const stats = await getStats();
        return json(stats as any);
      }

      // ── Static files ───────────────────────────────────────────────────

      if (url.pathname === '/') {
        return serveIndex();
      }

      return serveStatic(url.pathname);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      console.error(`[Error] ${url.pathname}: ${message}`);
      return json({ error: message }, 500);
    }
  },
});

console.log(`\nBackend running at http://localhost:${PORT}`);
console.log(`Jev (TypeSafe): ${getTypesafeKey() ? 'API key loaded ✓' : '✗ No TYPESAFE_API_KEY'}`);
console.log(`LLM: base=${getLlmBase()}, model=${getLlmModel() || '(not set)'}, key=${getLlmKey() ? '✓' : '(not set)'}`);
console.log(`Game history: learning enabled\n`);
