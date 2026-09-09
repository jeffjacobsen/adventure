import type { SourceRef, World } from './schema.ts';

export function lookup(world: World, word: string, kind?: number): number {
  const entry = world.vocabulary.find(v => v.word === word.toUpperCase().slice(0, 5) && (kind === undefined || v.kind === kind));
  if (!entry) throw new Error(`Missing vocabulary: ${word} (${kind ?? 'any'})`);
  return kind === undefined ? entry.code : entry.id;
}

export function sourceAnchor(source: string, needle: string): SourceRef {
  const i = source.split('\n').findIndex(line => line.includes(needle));
  if (i < 0) throw new Error(`Missing Fortran source anchor: ${needle}`);
  return { file: 'original/adventure.f', line: i + 1 };
}

/** Extract actual mnemonic assignments; SPICES is the only explicit compatibility addition. */
export function extractMnemonics(world: World, fortran: string) {
  const result: Record<string, { id: number; source: SourceRef; compatibility?: string }> = {};
  for (const [i, line] of fortran.split('\n').entries()) {
    const m = line.match(/^\s*(\w+)=VOCAB\(0\+'([^']+)',([012])\)/);
    if (m) result[m[1]] = { id: lookup(world, m[2], Number(m[3])), source: { file: 'original/adventure.f', line: i + 1 } };
  }
  for (const [name, other] of [['ROD2', 'ROD'], ['PLANT2', 'PLANT'], ['TROLL2', 'TROLL']]) {
    result[name] = { id: result[other].id + 1, source: sourceAnchor(fortran, `${name}=${other}+1`) };
  }
  result.SPICES = { id: lookup(world, 'SPICES', 1), source: sourceAnchor(fortran, 'PROP(SPICES)'), compatibility: 'C001' };
  return result;
}

export interface ObjectState { place: number; fixed: number; prop: number }
export interface ScoringState {
  objects: Record<number, ObjectState>; deaths: number; dwarfFlag: number;
  gaveUp: boolean; closing: boolean; closed: boolean; bonus: 0 | 133 | 134 | 135; hints: number[];
}

export function initialObjects(world: World): Record<number, ObjectState> {
  const result: Record<number, ObjectState> = {};
  for (const p of world.placements) result[p.object] = { place: p.location, fixed: p.fixed, prop: 0 };
  for (const o of world.objects.filter(o => o.id >= 50 && o.id <= 79)) result[o.id].prop = -1;
  return result;
}

export function scoringInputs(world: World) {
  const chest = lookup(world, 'CHEST', 1);
  return {
    treasures: world.objects.filter(o => o.id >= 50 && o.id <= 79).map(o => ({
      id: o.id, discovery: 2, total: o.id < chest ? 12 : o.id === chest ? 14 : 16,
    })),
    maxDeaths: Array.from({ length: 5 }, (_, i) => i).filter(i => world.messages.some(m => m.id === 81 + 2 * i)).length,
    building: 3, magazine: lookup(world, 'MAGAZ', 1), wittsEnd: 108,
    deepCave: 25, perSurvival: 10, notQuitting: 4, closing: 25,
    ending: { 0: 10, 133: 45, 134: 30, 135: 25 }, magazinePoint: 1, allowance: 2,
  };
}

/** Pure translation of labels 20000–20030; no discovery, turns or quit prompt. */
export function calculateScore(world: World, state: ScoringState, context: 'quitPreview' | 'final') {
  const input = scoringInputs(world);
  if (state.deaths < 0 || state.deaths > input.maxDeaths || !Number.isInteger(state.deaths)) throw new Error('Invalid death count');
  const parts: Record<string, number> = { treasures: 0 };
  for (const treasure of input.treasures) {
    const object = state.objects[treasure.id];
    if (!object) throw new Error(`Missing treasure state ${treasure.id}`);
    if (object.prop >= 0) parts.treasures += treasure.discovery;
    if (object.place === input.building && object.prop === 0) parts.treasures += treasure.total - treasure.discovery;
  }
  parts.survival = (input.maxDeaths - state.deaths) * input.perSurvival;
  parts.notQuitting = context === 'final' && !state.gaveUp ? input.notQuitting : 0;
  parts.deepCave = state.dwarfFlag !== 0 ? input.deepCave : 0;
  parts.closing = state.closing ? input.closing : 0;
  parts.ending = state.closed ? input.ending[state.bonus] : 0;
  parts.magazine = state.objects[input.magazine]?.place === input.wittsEnd ? 1 : 0;
  parts.allowance = input.allowance;
  parts.hints = -[...new Set(state.hints)].reduce((cost, id) => {
    const hint = world.hints.find(h => h.id === id);
    if (!hint) throw new Error(`Unknown hint ${id}`);
    return cost + hint.cost;
  }, 0);
  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  const maximum = input.treasures.reduce((sum, t) => sum + t.total, 0) + input.maxDeaths * 10 + 25 + 4 + 25 + 45 + 1 + 2;
  return { score, maximum, parts, rank: world.ranks.find(r => score <= r.ceiling) ?? null };
}
