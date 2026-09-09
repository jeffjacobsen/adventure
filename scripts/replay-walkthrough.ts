import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadOriginalWorld } from '../src/game/load.ts';
import { completeEnding } from '../src/testing/ending-walkthrough.ts';
import { replayTreasureWalkthrough } from '../src/testing/treasure-walkthrough.ts';

const ending = process.argv.includes('--ending');
const args = process.argv.slice(2).filter(arg=>arg !== '--ending');
if (args.length > 1 || (args[0] && !/^\d+$/.test(args[0]))) throw new Error('Usage: npm run walkthrough:replay -- [seed] [--ending]');
const root = new URL('../', import.meta.url);
const world = await loadOriginalWorld();
const result = replayTreasureWalkthrough(world, await readFile(new URL('walkthrough/README.md', root), 'utf8'), Number(args[0] ?? 12345));
await mkdir(new URL('build/', root), { recursive: true });
const { save, ...report } = result;
await writeFile(new URL('build/treasure-walkthrough.json', root), JSON.stringify(report, null, 2) + '\n');
await writeFile(new URL('build/treasure-walkthrough.save.json', root), save);
console.log(`${result.status.toUpperCase()}: ${result.deposited}/15 intact treasures deposited; score ${result.score.score} before closing.`);
console.log(`Seed ${result.seed}; ${result.turns} turns; ${result.dwarfKills} dwarves killed; ${result.lampRemaining} lamp turns remain.`);
console.log(`Axe encounter: ${result.axeEncounter}; pirate theft: ${result.pirateTheft}; ${result.checkpoints} checkpoint comparisons.`);
console.log('Saved report/transcript and portable checkpoint in build/treasure-walkthrough*.json.');
if (ending && !result.failure) {
  const finished = completeEnding(world, save);
  await writeFile(new URL('build/ending-walkthrough.json',root), JSON.stringify({seed:result.seed,score:finished.score,turns:finished.turns,commands:finished.commands},null,2)+'\n');
  await writeFile(new URL('build/repository.save.json',root),finished.repositorySave);
  await writeFile(new URL('build/ending.save.json',root),finished.save);
  console.log(`ENDING PASSED: ${finished.score.score}/350 in ${finished.turns} turns; ${finished.commands.length} additional checkpoint comparisons.`);
  console.log('Saved repository checkpoint, final save and ending transcript in build/.');
} else console.log('Collection-only run. Add --ending to verify the full 350-point finish.');
if (result.failure) { console.error(result.failure); process.exitCode = 1; }
