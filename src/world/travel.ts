import type { ObjectState } from './baseline.ts';
import type { TravelRule, World } from './schema.ts';

/** Evaluates data-table selection only; special-handler effects and turn logic belong to Phase 1. */
export function selectTravel(world: World, location: number, motion: number,
  objects: Record<number, ObjectState>, draw: (range: number) => number): TravelRule | null {
  let rule = world.travel.find(r => r.from === location && (r.motions.includes(1) || r.motions.includes(motion)));
  while (rule) {
    const c = rule.condition;
    let passes = false;
    if (c.kind === 'always') passes = true;
    else if (c.kind === 'chance' || c.kind === 'playerOnly') {
      const roll = draw(100);
      if (!Number.isInteger(roll) || roll < 0 || roll >= 100) throw new Error('Random draw outside [0, 100)');
      passes = roll < (c.kind === 'chance' ? c.percent : 100);
    } else {
      const object = objects[c.object];
      if (!object) throw new Error(`Missing object state ${c.object}`);
      passes = c.kind === 'carrying' ? object.place === -1
        : c.kind === 'present' ? object.place === -1 || object.place === location || object.fixed === location
        : object.prop !== c.value;
    }
    if (passes) return rule;
    if (!rule.fallback) throw new Error(`No conditional fallback for ${rule.id}`);
    rule = world.travel.find(r => r.id === rule!.fallback);
  }
  return null;
}
