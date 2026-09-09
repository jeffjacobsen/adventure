import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { AdventureEngine } from '../game/engine.ts';
import { restoreGame, saveGame } from '../game/save.ts';
import type { World } from '../world/schema.ts';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

async function body(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('Checkpoint or request is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Stateless adapter. All game transitions and save validation stay in the engine. */
export function createGameServer(world: World, options: { publicOrigin?: string } = {}) {
  let publicOrigin: string | undefined;
  if (options.publicOrigin !== undefined) {
    const url = new URL(options.publicOrigin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without credentials, a path, query or fragment.');
    }
    publicOrigin = url.origin;
  }
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const path = request.url ?? '/';
    try {
      if (request.method === 'GET' && assets.has(path)) {
        const [file, type] = assets.get(path)!;
        response.setHeader('Content-Type', type);
        response.end(await readFile(new URL(`../../web/${file}`, import.meta.url)));
        return;
      }
      if (request.method !== 'POST' || !['/api/new', '/api/step', '/api/load'].includes(path)) {
        response.writeHead(404); response.end('Not found'); return;
      }
      // Explicit public origin supports TLS termination without trusting forwarded headers.
      const allowedOrigin = publicOrigin ?? `http://${request.headers.host}`;
      if (request.headers.origin && request.headers.origin !== allowedOrigin) {
        response.writeHead(403); response.end('Origin not allowed'); return;
      }
      if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('Expected JSON.');
      const data = await body(request);
      if (!data || typeof data !== 'object') throw new Error('Invalid request.');
      if (path !== '/api/new' && typeof data.save !== 'string') throw new Error('Missing checkpoint.');
      const engine = path === '/api/new' ? new AdventureEngine(world)
        : new AdventureEngine(world, restoreGame(world, data.save));
      if (path === '/api/step' && (typeof data.command !== 'string' || data.command.length > 500)) throw new Error('Enter a command of at most 500 characters.');
      const result = path === '/api/step' ? engine.step(data.command) : engine.start();
      const inventory = world.objects.filter(o => ![21, 22].includes(o.id) && engine.state.objects[o.id]?.place === -1)
        .map(o => o.inventory.lines.map(l => l.text).join('\n'));
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ save: saveGame(world, engine.state), events: result.events,
        inventory, turns: engine.state.turns, gameOver: engine.state.gameOver,
        question: engine.state.pending !== undefined }));
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unable to process request.' }));
    }
  });
}
