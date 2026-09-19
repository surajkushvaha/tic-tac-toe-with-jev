import { type Seat, CELL_NAMES } from './types';
import { getLlmKey, getLlmBase, getLlmModel } from './env';
import { buildHistoryContext } from './history';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

export async function handleLlmMove(body: Record<string, unknown>): Promise<Response> {
  const board = body.board as Array<Seat | null>;
  const seat = body.seat as Seat;
  const model = (body.model as string) || getLlmModel();

  if (!Array.isArray(board) || board.length !== 9) {
    return jsonResponse({ error: 'Invalid board state.' }, 400);
  }
  if (!model) {
    return jsonResponse({ error: 'No LLM model configured. Set LLM_MODEL in .env or pass model in request.' }, 400);
  }

  const legal = board.flatMap((cell, i) => cell === null ? [i] : []);
  if (legal.length === 0) {
    return jsonResponse({ error: 'No legal moves available.' }, 400);
  }

  // Build the grid display
  const cellStr = (idx: number) => board[idx] ?? String(idx);
  const grid = [0, 3, 6].map(r => ` ${cellStr(r)} | ${cellStr(r + 1)} | ${cellStr(r + 2)} `).join('\n---+---+---\n');

  // Get history context
  const historyAdvice = await buildHistoryContext(board, seat);

  // Build system prompt with history
  let systemPrompt =
    'You are a perfect tic-tac-toe player. Cells are numbered 0-8, left to right, top to bottom. ' +
    'Reply with a single digit: the cell you play. No explanation.';

  if (historyAdvice) {
    systemPrompt += `\n\nIMPORTANT — LEARNING FROM PAST GAMES: ${historyAdvice}`;
  }

  const url = `${getLlmBase()}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = getLlmKey();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `You are ${seat}. Board (digits mark empty cells):\n\n${grid}\n\nEmpty cells: ${legal.join(', ')}. Reply with only the number of your move.`,
    },
  ];

  let lastReply = '';
  let withTemperature = true;

  for (let attempt = 0; attempt < 2; attempt++) {
    let content: string | null = null;

    for (let retry = 0; retry < 4; retry++) {
      const reqBody: Record<string, unknown> = { model, messages };
      if (withTemperature) reqBody.temperature = 0;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody),
      });

      if (res.ok) {
        const data = await res.json() as any;
        content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string') content = JSON.stringify(content ?? '');
        break;
      }

      const errText = (await res.text().catch(() => '')).slice(0, 240);

      if (res.status === 400 && withTemperature && /temperature/i.test(errText)) {
        withTemperature = false;
        continue;
      }

      if ((res.status === 429 || res.status >= 500) && retry < 3) {
        await new Promise(r => setTimeout(r, 600 * 2 ** retry));
        continue;
      }

      return jsonResponse({
        error: `LLM returned ${res.status}${res.status === 401 ? ' (check LLM_API_KEY)' : ''}${errText ? `: ${errText}` : ''}`,
      }, 502);
    }

    if (content === null) {
      return jsonResponse({ error: 'LLM request failed.' }, 502);
    }

    lastReply = content;

    // Parse the move
    const found = [...lastReply.matchAll(/(?<!\d)[0-8](?!\d)/g)]
      .map(m => Number(m[0]))
      .filter(n => legal.includes(n));
    if (found.length) {
      const move = found[found.length - 1];
      console.log(`[LLM] Played ${CELL_NAMES[move]}${historyAdvice ? ' (with history context)' : ''}`);
      return jsonResponse({ move });
    }

    // Re-prompt
    messages.push(
      { role: 'assistant', content: lastReply },
      { role: 'user', content: `That was not a legal move. Pick one of: ${legal.join(', ')}. Reply with only the digit.` }
    );
  }

  // Fallback: random
  const fallbackMove = legal[Math.floor(Math.random() * legal.length)];
  console.log(`[LLM] Fallback random move: ${CELL_NAMES[fallbackMove]}`);
  return jsonResponse({
    move: fallbackMove,
    fallback: true,
    note: `No legal move in LLM reply ("${lastReply.slice(0, 40)}"), played a random cell.`,
  });
}
