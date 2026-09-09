import { loadOriginalWorld } from '../src/game/load.ts';
import { createGameServer } from '../src/web/server.ts';

const port = Number(process.env.PORT ?? 3500);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
const server = createGameServer(await loadOriginalWorld(), { publicOrigin: process.env.PUBLIC_ORIGIN });
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') console.log(`Adventure browser preview: http://127.0.0.1:${address.port}\nPress Ctrl+C to stop.`);
});
