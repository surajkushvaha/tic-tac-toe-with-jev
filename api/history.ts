import { saveGame, getStats } from '../server/history';
import type { GameRecord } from '../server/types';

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

export default async function handler(req: Request) {
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
    if (req.method === 'POST') {
      const text = await req.text();
      if (!text) return json({ error: 'Request body must be valid JSON.' }, 400);
      
      const body = JSON.parse(text) as GameRecord;
      if (!body.id || !body.moves || !body.boardStates) {
        return json({ error: 'Invalid game record.' }, 400);
      }
      
      await saveGame(body);
      console.log(`[History] Saved game ${body.id}: winner=${body.winner ?? 'draw'}, ${body.moves.length} moves`);
      return json({ ok: true });
    }

    if (req.method === 'GET') {
      const stats = await getStats();
      return json(stats as any);
    }
    
    return json({ error: 'Method not allowed' }, 405);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error(`[Error] /api/history: ${message}`);
    return json({ error: message }, 500);
  }
}
