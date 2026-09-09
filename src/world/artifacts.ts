import { extractMnemonics, initialObjects, scoringInputs, sourceAnchor } from './baseline.ts';
import type { World } from './schema.ts';

export function summarize(world: World) {
  return {
    locations: world.locations.length,
    shortDescriptions: world.locations.filter(l => l.short).length,
    travelRows: world.travel.length,
    motionEntries: world.travel.reduce((sum, t) => sum + t.motions.length, 0),
    vocabularyEntries: world.vocabulary.length,
    vocabularyCodes: new Set(world.vocabulary.map(v => v.code)).size,
    objectDescriptions: world.objects.length, placements: world.placements.length,
    treasures: scoringInputs(world).treasures.length, generalMessages: world.messages.length,
    actions: world.actionDefaults.length, ranks: world.ranks.length, hints: world.hints.length,
    administrationMessages: world.magicMessages.length,
    maximumScore: scoringInputs(world).treasures.reduce((n, t) => n + t.total, 0) + scoringInputs(world).maxDeaths * 10 + 102,
  };
}

export function extractBaseline(world: World, fortran: string) {
  const mnemonics = extractMnemonics(world, fortran);
  const scalar = (name: string) => {
    const line = fortran.split('\n').find(l => new RegExp(`^\\s*${name}=\\d+$`).test(l));
    if (!line) throw new Error(`Missing initial constant ${name}`);
    return { value: Number(line.split('=')[1]), source: sourceAnchor(fortran, line.trim()) };
  };
  const repository = [...fortran.matchAll(/(?:PROP\((\w+)\)|FOO)=PUT\((\w+),(115|116),(\d+)\)/g)].map(m => {
    const name = m[2];
    if (!mnemonics[name]) throw new Error(`Unknown repository mnemonic ${name}`);
    return { object: mnemonics[name].id, name, location: Number(m[3]),
      prop: m[1] ? -1 - Number(m[4]) : 0, source: sourceAnchor(fortran, m[0]) };
  });
  return {
    status: 'source-derived, not runtime-verified', mnemonics,
    constants: Object.fromEntries(['CLOCK1', 'CLOCK2', 'LIMIT', 'CHLOC', 'CHLOC2', 'DALTLC', 'MAXTRS'].map(name => [name, scalar(name)])),
    initialObjects: initialObjects(world),
    initialTreasureTally: scoringInputs(world).treasures.length,
    scoring: scoringInputs(world),
    repository: {
      placements: repository, playerLocation: 115, mirrorFixed: 116,
      remainingInventory: 'destroy after PUT operations',
      source: sourceAnchor(fortran, '11000\tPROP(BOTTLE)'),
    },
    anchors: {
      travel: sourceAnchor(fortran, '8\tKK=KEY(LOC)'),
      carry: sourceAnchor(fortran, '9010\tIF(TOTING(OBJ))'),
      grate: sourceAnchor(fortran, '9043\tK=34+PROP(GRATE)'),
      clocks: sourceAnchor(fortran, 'IF(TALLY.EQ.0.AND.LOC.GE.15.AND.LOC.NE.33)'),
      closing: sourceAnchor(fortran, '10000\tPROP(GRATE)=0'),
      blast: sourceAnchor(fortran, '9230\tIF(PROP(ROD2)'),
      score: sourceAnchor(fortran, '20000\tSCORE=0'),
      random: sourceAnchor(fortran, 'INTEGER FUNCTION RAN(RANGE)'),
    },
  };
}

const plain = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
const prose = (block: { lines: { text: string }[] }) => block.lines.map(l => l.text).join(' ');

export function catalogMarkdown(world: World): string {
  const lines = ['# World catalog (generated)', '',
    'Authoring data contains spoilers. Source-derived classifications are provisional, not an art specification.', '',
    'Regenerate with `npm run import`. Each property entry below can be a persistent state or an event; classify it during Phase 2.', '',
    '## Locations', '', '| ID | Classification | Initial object IDs | Description |', '| --- | --- | --- | --- |'];
  for (const l of world.locations) {
    const objects = world.placements.filter(p => p.location === l.id || p.fixed === l.id).map(p => p.object);
    const kind = l.forced ? 'automatic transition/message' : [115, 116].includes(l.id) ? 'repository endpoint (shared scene)' : 'place/view';
    lines.push(`| [${l.id}](../original/adventure.dat#L${l.long.lines[0].source.line}) | ${kind} | ${objects.join(', ')} | ${plain(prose(l.long))} |`);
  }
  lines.push('', '## Logical objects and state text', '',
    'Two-location fixtures and alternate plant/troll representations must share visual state. No initial location means absent at startup, not unused.', '',
    'Dwarves/knives are special records without section-5 text. Water/oil have inventory text but no independent floor description.', '');
  for (const p of world.placements) {
    const o = world.objects.find(o => o.id === p.object);
    const names = world.vocabulary.filter(v => v.kind === 1 && v.id === p.object).map(v => v.word);
    const type = p.object >= 50 ? 'treasure' : [21, 22].includes(p.object) ? 'liquid' : [17, 18].includes(p.object) ? 'special actor/effect'
      : [6, 25, 34].includes(p.object) ? 'alternate representation' : [8, 11, 30, 31, 33, 35].includes(p.object) ? 'actor'
        : p.fixed !== 0 ? 'fixture' : 'prop';
    lines.push(`### ${p.object}: ${o ? prose(o.inventory) : names[0]}`, '',
      `Classification: ${type}. Initial place: ${p.location}; fixed: ${p.fixed}. Aliases: ${names.join(', ') || '(none)'}.`, '',
      `[Placement source](../original/adventure.dat#L${p.source.line}).`, '');
    for (const s of o?.states ?? []) lines.push(`- State/message ${s.index}${s.suppressed ? ' (suppressed)' : ''}: ${prose(s.text)}`);
    lines.push('');
  }
  const motionIds = new Set(world.travel.flatMap(t => t.motions));
  const absent = world.vocabulary.filter(v => v.kind === 0 && !motionIds.has(v.id));
  lines.push('## Vocabulary outside direct travel', '',
    'These entries may be parser built-ins (e.g. BACK/LOOK), not unused content:', '',
    absent.map(v => `${v.word} (${v.id})`).join(', '), '',
    'Dormant objects include the pirate chest, pearl, axe and batteries: actions/encounters spawn or move them.',
    'Use reference/puzzles.json and reference/scenarios.json for dependencies and source-traced behavior.', '');
  return lines.join('\n');
}

/** DOT is a logical rule graph, not a layout or a reachability proof. */
export function graphDot(world: World): string {
  const q = (s: string) => JSON.stringify(s);
  const lines = ['digraph adventure {', '  rankdir=LR;', '  node [shape=box];',
    '  death [label="Death / reincarnation", shape=octagon];'];
  for (const l of world.locations) lines.push(`  l${l.id} [label=${q(`${l.id}: ${prose(l.short ?? l.long).slice(0, 90)}`)}${l.forced ? ', shape=diamond' : ''}];`);
  for (const t of world.travel) {
    const r = `r${t.source.line}`;
    const aliases = t.motions.map(m => m === 1 ? 'AUTO' : world.vocabulary.find(v => v.kind === 0 && v.id === m)?.word ?? `UNKNOWN:${m}`);
    lines.push(`  ${r} [label=${q(`${aliases.join('/')}\n${JSON.stringify(t.condition)}`)}, shape=ellipse];`, `  l${t.from} -> ${r};`);
    const o = t.outcome;
    if (o.kind === 'location') lines.push(`  ${r} -> l${o.location} [label="pass"];`);
    if (o.kind === 'death') lines.push(`  ${r} -> death [label="pass"];`);
    if (o.kind === 'message') {
      lines.push(`  m${t.source.line} [label=${q(`Message ${o.message}; stay at ${t.from}`)}, shape=note];`, `  ${r} -> m${t.source.line} [label="pass"];`);
    }
    if (o.kind === 'special') {
      const desc = o.handler === 301 ? '301: load-gated passage 99/100' : o.handler === 302 ? '302: drop emerald; use fallback' : '303: troll/bear crossing 117/122; may die';
      lines.push(`  s${t.source.line} [label=${q(desc)}, shape=hexagon];`, `  ${r} -> s${t.source.line} [label="pass"];`);
      if (o.handler === 302 && t.fallback) lines.push(`  s${t.source.line} -> r${t.fallback.slice(7)} [label="after drop", style=dashed];`);
    }
    if (t.fallback && !['always', 'playerOnly'].includes(t.condition.kind))
      lines.push(`  ${r} -> r${t.fallback.slice(7)} [label="condition fails", style=dashed];`);
  }
  lines.push('  endgame [label="CLOCK2 reaches zero: repository setup", shape=hexagon];', '  endgame -> l115;', '}');
  return lines.join('\n') + '\n';
}
