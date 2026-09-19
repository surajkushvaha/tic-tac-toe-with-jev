declare const Bun: {
  env: Record<string, string | undefined>;
  file(path: string): {
    text(): Promise<string>;
    exists(): Promise<boolean>;
    stream(): ReadableStream;
  };
};

declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
};

const ROOT = process.cwd();
const envPath = `${ROOT.replace(/[\\/]$/, '')}/.env`;

export async function loadDotEnv() {
  const text = await Bun.file(envPath).text().catch(() => '');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!Bun.env[key]) Bun.env[key] = value;
  }
}

export const getTypesafeKey = () => Bun.env.TYPESAFE_API_KEY || Bun.env.TYPESAFE_AI || '';
export const getTypesafeEndpoint = () => (Bun.env.TYPESAFE_ENDPOINT || 'https://api.typesafe.ai').replace(/\/+$/, '');
export const getLlmKey = () => Bun.env.LLM_API_KEY || Bun.env.OLLAMA_API_KEY || Bun.env.GOOGLE_API_KEY || '';
export const getLlmBase = () => (Bun.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
export const getLlmModel = () => Bun.env.LLM_MODEL || '';
export const getPort = () => Number(Bun.env.PORT || 3000);
export const getRoot = () => ROOT;
