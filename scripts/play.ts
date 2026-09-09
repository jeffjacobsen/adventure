import { createInterface } from 'node:readline';
import { AdventureEngine } from '../src/game/engine.ts';
import { loadOriginalWorld } from '../src/game/load.ts';
import { readFile, writeFile } from 'node:fs/promises';
import { saveGame, restoreGame } from '../src/game/save.ts';
import { newGame } from '../src/game/state.ts';

const world = await loadOriginalWorld();
const seed = process.env.ADVENTURE_SEED === undefined ? 12345 : Number(process.env.ADVENTURE_SEED);
const engine = new AdventureEngine(world, newGame(world, seed));
console.log('Adventure 350 — opening preview. :save [file], :load [file], HELP, RESTART.');
for (const event of engine.start().events) if (event.text) console.log(event.text);
const input = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
if (process.stdin.isTTY) input.prompt();
for await (const line of input) {
  const control = line.trim().match(/^:(save|load)(?:\s+(.+))?$/i);
  try {
    if (control) {
      const file = control[2] ?? 'adventure-save.json';
      if (control[1].toLowerCase() === 'save') {
        await writeFile(file, saveGame(world, engine.state), { flag: 'wx' });
        console.log(`Saved to ${file}. Use a new filename for another checkpoint.`);
      } else {
        engine.state = restoreGame(world, await readFile(file, 'utf8'));
        console.log(`Loaded ${file}.`);
        for (const event of engine.start().events) if (event.text) console.log(event.text);
      }
    } else for (const event of engine.step(line).events) if (event.text) console.log(event.text);
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); }
  if (process.stdin.isTTY) input.prompt();
}
