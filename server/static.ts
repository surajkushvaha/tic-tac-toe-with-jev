import { getRoot } from './env';

declare const Bun: {
  file(path: string): {
    exists(): Promise<boolean>;
    stream(): ReadableStream;
  };
};

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js:   'application/javascript; charset=utf-8',
  css:  'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg:  'image/svg+xml',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  ico:  'image/x-icon',
};

export function serveIndex() {
  const root = getRoot();
  return new Response(Bun.file(`${root}/index.html`).stream(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function serveStatic(pathname: string): Promise<Response> {
  const root = getRoot().replace(/[\\/]$/, '');
  const filePath = `${root}/${pathname.replace(/^\/+/, '')}`;

  if (!filePath.startsWith(root)) {
    return new Response('Forbidden', { status: 403 });
  }

  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) return new Response('Not found', { status: 404 });

  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return new Response(file.stream(), {
    headers: {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    },
  });
}
