import { type Seat, CELL_NAMES, otherSeat, cellKind } from './types';
import { getTypesafeKey, getTypesafeEndpoint } from './env';
import { describeTactics } from './tactics';
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

export async function handleJevMove(body: Record<string, unknown>): Promise<Response> {
  const board = body.board as Array<Seat | null>;
  const seat = body.seat as Seat;
  const model = (body.model as string) || 'jev-latest';
  const hints = body.hints !== false;

  if (!Array.isArray(board) || board.length !== 9) {
    return jsonResponse({ error: 'Invalid board state.' }, 400);
  }

  const key = getTypesafeKey();
  if (!key) {
    return jsonResponse({ error: 'TYPESAFE_API_KEY not configured in server .env file.' }, 500);
  }

  const legal = board.flatMap((cell, i) => cell === null ? [i] : []);
  if (legal.length === 0) {
    return jsonResponse({ error: 'No legal moves available.' }, 400);
  }

  // Build criteria for each legal move
  const criteria: Record<string, string> = {};
  for (const i of legal) {
    const tags = hints ? describeTactics(board, i, seat) : [];
    criteria[String(i)] = `${CELL_NAMES[i]} ${cellKind(i)}${tags.length ? `: ${tags.join('; ')}` : ''}`;
  }

  // Get history context
  const historyAdvice = await buildHistoryContext(board, seat);

  // Build instructions with history learning
  let instructions =
    `You are ${seat} in tic-tac-toe. Choose the strongest move for ${seat} among the empty cells. ` +
    `In priority order: win now; block the opponent's immediate win; create a fork or stop the opponent's fork; ` +
    `take the centre; take a corner (preferably opposite the opponent's corner); take an edge.`;

  if (historyAdvice) {
    instructions += `\n\nLEARNING FROM PAST GAMES: ${historyAdvice}`;
  }

  const payload = {
    model,
    state: {
      game: 'tic-tac-toe',
      you: seat,
      opponent: otherSeat(seat),
      board: [0, 1, 2].map(r => [0, 1, 2].map(c => board[r * 3 + c] ?? '.')),
      empty_cells: legal,
      moves_played: 9 - legal.length,
    },
    questions: {
      move: { type: 'choice', instructions, criteria },
    },
  };

  // Call TypeSafe with retries
  const endpoint = `${getTypesafeEndpoint()}/v1/systemone`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json() as any;
      const answer = data?.answers?.move;
      const move = Number(answer?.choice);
      if (!legal.includes(move)) {
        return jsonResponse({ error: `Jev returned an unusable answer: ${JSON.stringify(answer)?.slice(0, 200)}` }, 502);
      }
      console.log(`[Jev] Played ${CELL_NAMES[move]}${historyAdvice ? ' (with history context)' : ''}`);
      return jsonResponse({ move, probabilities: answer.probabilities, confidence: answer.confidence });
    }

    if ((res.status === 429 || res.status === 529) && attempt < 3) {
      await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }

    const text = (await res.text().catch(() => '')).slice(0, 240);
    return jsonResponse({
      error: `TypeSafe returned ${res.status}${res.status === 401 ? ' (check TYPESAFE_API_KEY)' : ''}${text ? `: ${text}` : ''}`,
    }, 502);
  }

  return jsonResponse({ error: 'TypeSafe request failed after retries.' }, 502);
}
