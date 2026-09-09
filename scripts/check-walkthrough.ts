import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadOriginalWorld } from '../src/game/load.ts';
import { parseTreasureWalkthrough } from '../src/testing/treasure-walkthrough.ts';

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--strict')) throw new Error('Usage: npm run walkthrough [-- --strict]');
  const root = new URL('../', import.meta.url);
  const world = await loadOriginalWorld();
  const fixture = parseTreasureWalkthrough(await readFile(new URL('walkthrough/README.md', root), 'utf8'));
  const issues = fixture.commands.flatMap(row => {
    const words = row.command.split(' ');
    if (words.length === 1 && ['YES','NO','Y','N'].includes(words[0])) return [];
    return words.filter(word=>!world.vocabulary.some(v=>v.word===word.slice(0,5)))
      .map(word=>({sequence:row.sequence,sourceLine:row.sourceLine,code:'unknown-word',message:`No vocabulary entry for ${word}`}));
  });
  await mkdir(new URL('build/', root), { recursive: true });
  await writeFile(new URL('build/walkthrough.json', root), JSON.stringify({
    formatVersion: 2, ...fixture, issues, verification: 'Static audit only; use walkthrough:replay to execute the game',
  }, null, 2) + '\n');
  console.log(`${fixture.commands.length} numbered commands from ${fixture.source}; ${issues.length} vocabulary findings.`);
  for(const issue of issues) console.log(`${fixture.source}:${issue.sourceLine}: ${issue.message}`);
  console.log('Saved build/walkthrough.json. Final closing advice is retained as a note.');
  console.log('No game executed. Run npm run walkthrough:replay for the treasure-collection regression.');
  if (args.includes('--strict') && issues.length) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
