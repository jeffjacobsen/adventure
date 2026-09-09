import type { World } from './schema.ts';

export interface MapExit { from: number; to: number | null; message?: number; motion: number; conditional: boolean; magic: boolean }

/** Enumerate travel alternatives, retaining the initiating command across fallbacks.
 * This is a static authoring view, not a replacement for game-rule evaluation. */
export function mapExits(world: World): MapExit[] {
  const exits: MapExit[] = [];
  const rules = new Map(world.travel.map(r => [r.id, r]));
  for (const room of world.locations) {
    const local = world.travel.filter(r => r.from === room.id);
    const motions = room.forced ? [1] : [...new Set(local.flatMap(r => r.motions))];
    for (const motion of motions) {
      let rule = local.find(r => r.motions.includes(motion));
      let conditional = false;
      const visited = new Set<string>();
      while (rule) {
        if (visited.has(rule.id)) throw new Error(`Travel cycle at ${rule.id}`);
        visited.add(rule.id);
        conditional ||= !['always', 'playerOnly'].includes(rule.condition.kind);
        const base = { from: room.id, motion, conditional, magic: [62, 65, 71].includes(motion) };
        const o = rule.outcome;
        if (o.kind === 'location') exits.push({ ...base, to: o.location });
        if (o.kind === 'death') exits.push({ ...base, to: 0 });
        if (o.kind === 'message') exits.push({ ...base, to: null, message: o.message });
        if (o.kind === 'special') {
          conditional = true;
          if (o.handler === 301) {
            exits.push({ ...base, conditional, to: 199 - room.id }, { ...base, conditional, to: null, message: 117 });
          } else if (o.handler === 302) {
            exits.push({ ...base, conditional, to: room.id === 33 ? 100 : 33 });
          } else if (o.handler === 303) {
            exits.push({ ...base, conditional, to: 239 - room.id }, { ...base, conditional, to: null }, { ...base, conditional, to: 0 });
          } else throw new Error(`Unknown special travel ${o.handler}`);
        }
        if (['always', 'playerOnly'].includes(rule.condition.kind)) break;
        rule = rule.fallback ? rules.get(rule.fallback) : undefined;
      }
    }
  }
  return exits;
}

const preferred: Record<number, string> = { 1: 'AUTO', 4: 'UPSTREAM', 5: 'DOWNSTREAM', 7: 'FORWARD', 19: 'IN', 29: 'U', 30: 'D', 43: 'E', 44: 'W', 45: 'N', 46: 'S', 62: 'XYZZY', 65: 'PLUGH', 71: 'PLOVER' };
export function motionName(world: World, motion: number): string {
  return preferred[motion] ?? world.vocabulary.find(v => v.kind === 0 && v.id === motion)?.word ?? `motion ${motion}`;
}
