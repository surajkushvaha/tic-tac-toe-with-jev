import { getTypesafeKey, getLlmBase, getLlmModel, getLlmKey } from '../server/env';
import type { ServerConfig } from '../server/types';

export function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
  });
}

export async function GET(req: Request) {
  const config: ServerConfig = {
    jevAvailable: !!getTypesafeKey(),
    llmAvailable: !!getLlmKey() || !!getLlmBase(),
    defaultLlmModel: getLlmModel(),
    defaultJevModel: 'jev-latest',
  };

  return new Response(JSON.stringify(config), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}
