import { readFile, writeFile } from 'node:fs/promises';
import { importWorld } from '../src/world/import.ts';
import type { TravelRule, World } from '../src/world/schema.ts';

const prose = (block: { lines: { text: string }[] } | null | undefined) => block?.lines.map(l => l.text).join(' ') ?? '(no description)';
const short = (world: World, id: number) => {
  const loc = world.locations.find(l => l.id === id)!;
  const value = prose(loc.short ?? loc.long);
  return value.split(/(?<=[.!?])\s+/)[0];
};
const outcome = (rule: TravelRule): string => {
  const o = rule.outcome;
  if (o.kind === 'location') return `#${o.location}`;
  if (o.kind === 'death') return 'death';
  if (o.kind === 'message') return `message ${o.message} (stays)`;
  return `special ${o.handler}`;
};

// Player-only rows always pass for the player. Special handlers 301–303
// additionally depend on carried objects or puzzle state outside the travel table.
function conditional(world: World, id: number) {
  return world.travel.some(rule => rule.from === id && (
    !['always', 'playerOnly'].includes(rule.condition.kind) ||
    rule.outcome.kind === 'special'
  ));
}

function commands(world: World, id: number) {
  const byOutcome = new Map<string, string[]>();
  for (const rule of world.travel.filter(r => r.from === id)) {
    const words = rule.motions.map(m => m === 1 ? 'AUTO' : world.vocabulary.filter(v => v.kind === 0 && v.id === m).map(v => v.word).join('/'))
      .filter(Boolean);
    const key = outcome(rule);
    byOutcome.set(key, [...(byOutcome.get(key) ?? []), ...words]);
  }
  return [...byOutcome.entries()].map(([next, words]) => `${[...new Set(words)].sort().join(', ')} → ${next}`).join('; ');
}

const root = new URL('../', import.meta.url);
const world = importWorld(await readFile(new URL('original/adventure.dat', root), 'utf8'));
const locations = world.locations.map(location => location.id).sort((a, b) => a - b);
const lines = [
  '# Complete location map', '',
  'All locations from the original database are listed, including forced passages and the two repository rooms. X marks locations with probability- or object-dependent motions, including special travel handlers. Conditions themselves are omitted. Player-only restrictions do not receive an X because they always allow the player.', '',
  'Commands and outcomes are taken from the travel table; conditional alternatives are shown without selecting a route. A failed condition can fall through to another outcome even when that row lists different commands. `AUTO` means forced motion. General commands such as LOOK and INVENTORY are not listed.', '',
  `Starting location: **#1 — ${short(world, 1)}**. Total locations: **${locations.length}**. Repository rooms #115–116 are reached through cave closing.`, '',
  '| Location | Conditional | Short description | Acceptable commands → next location/outcome |',
  '| ---: | :---: | --- | --- |',
];
for (const id of locations) lines.push(`| ${id} | ${conditional(world, id) ? 'X' : ''} | ${short(world, id).replaceAll('|', '\\|')} | ${commands(world, id).replaceAll('|', '\\|')} |`);
lines.push('', 'Generated with `npm run partial-map`; source rows and conditions remain in `build/world.json`. The table is an authoring aid, not a complete walkthrough or player map.');
await writeFile(new URL('docs/PARTIAL_MAP.md', root), lines.join('\n') + '\n');
console.log(`Wrote docs/PARTIAL_MAP.md (${locations.length} locations).`);
