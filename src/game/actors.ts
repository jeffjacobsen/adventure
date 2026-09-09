import type { World } from '../world/schema.ts';
import { carried, here, random, type GameState } from './state.ts';

export interface ActorState { location: number; previousLocation: number; seen: boolean }
export function initialActors(): ActorState[] {
  return [19, 27, 33, 44, 64, 114].map(location => ({ location, previousLocation: 0, seen: false }));
}
export interface ActorNotice { message?: number; text?: string }

/** Source 6012: actors use raw destinations, not player travel conditions.
 * Only condition 100 is forbidden to them. Repeated adjacent destinations are
 * collapsed, but nonadjacent repeats retain their original random weighting. */
export function actorDestinations(world: World, actor: ActorState, pirate: boolean): number[] {
  const choices: number[] = [];
  for (const row of world.travel.filter(r => r.from === actor.location)) {
    const next = row.outcome.kind === 'location' ? row.outcome.location : 0;
    const room = world.locations.find(l => l.id === next);
    if (!room || next < 15 || next === actor.location || next === actor.previousLocation ||
        next === choices.at(-1) || choices.length >= 19 || room.forced ||
        (pirate && (room.conditionBits & 8)) || row.condition.kind === 'playerOnly') continue;
    choices.push(next);
  }
  return choices.length ? choices : [actor.previousLocation];
}

export function dwarfBlocks(world: World, state: GameState, destination: number): boolean {
  const room = world.locations.find(l => l.id === state.location)!;
  return destination !== state.location && !room.forced && !(room.conditionBits & 8) &&
    state.actors.slice(0, 5).some(a => a.seen && a.previousLocation === destination);
}

/** Source 6000–6030. Called once at an eligible movement update before narration. */
export function updateActors(world: World, state: GameState,
  draw: (range: number) => number = range => random(state, range)): { notices: ActorNotice[]; fatal: boolean } {
  const notices: ActorNotice[] = [];
  const room = world.locations.find(l => l.id === state.location)!;
  if (room.forced || (room.conditionBits & 8)) return { notices, fatal: false };
  if (state.dwarfFlag === 0) {
    if (state.location >= 15) state.dwarfFlag = 1;
    return { notices, fatal: false };
  }
  if (state.dwarfFlag === 1) {
    if (state.location < 15 || draw(100) < 95) return { notices, fatal: false };
    state.dwarfFlag = 2;
    for (let i = 0; i < 2; i++) {
      const dwarf = state.actors[draw(5)];
      if (draw(100) < 50) dwarf.location = 0;
    }
    for (const dwarf of state.actors.slice(0, 5)) {
      if (dwarf.location === state.location) dwarf.location = 18;
      dwarf.previousLocation = dwarf.location;
    }
    state.objects[28].place = state.location;
    return { notices: [{ message: 3 }], fatal: false };
  }
  let total = 0, attacks = 0, hits = 0;
  for (const [index, actor] of state.actors.entries()) {
    if (actor.location === 0) continue;
    const choices = actorDestinations(world, actor, index === 5);
    const next = choices[draw(choices.length)];
    actor.previousLocation = actor.location;
    actor.location = next;
    actor.seen = (actor.seen && state.location >= 15) || actor.location === state.location || actor.previousLocation === state.location;
    if (!actor.seen) continue;
    actor.location = state.location;
    if (index === 5) {
      if (state.location === 114 || state.objects[55].prop >= 0) continue;
      const treasures = Array.from({ length: 15 }, (_, i) => 50 + i)
        .filter(id => !(id === 60 && [100, 101].includes(state.location)));
      const stolen = treasures.some(id => carried(state, id));
      const remaining = Object.entries(state.objects).filter(([id, o]) => Number(id) >= 50 && Number(id) <= 64 && o.prop < 0).length;
      const sighting = remaining === state.lostTreasures + 1 && !treasures.some(id => here(state, id)) &&
        state.objects[55].place === 0 && here(state, 2) && state.objects[2].prop === 1;
      if (stolen || sighting) {
        notices.push({ message: stolen ? 128 : 186 });
        if (!stolen || state.objects[36].place === 0) state.objects[55].place = 114;
        state.objects[36].place = 140;
        if (stolen) for (const id of treasures) {
          const item = state.objects[id];
          if (carried(state, id) || ((item.place === state.location || item.fixed === state.location) && item.fixed === 0)) item.place = 114;
        }
        actor.location = 114; actor.previousLocation = 114; actor.seen = false;
      } else if (actor.previousLocation !== actor.location && draw(100) < 20) notices.push({ message: 127 });
      continue;
    }
    total++;
    if (actor.previousLocation !== actor.location) continue;
    attacks++;
    if (state.knifeLocation >= 0) state.knifeLocation = state.location;
    if (draw(1000) < 95 * (state.dwarfFlag - 2)) hits++;
  }
  if (total) notices.push(total === 1 ? { message: 4 } : { text: `There are ${total} threatening little dwarves in the room with you.` });
  if (attacks) {
    if (state.dwarfFlag === 2) state.dwarfFlag = 3;
    notices.push(attacks === 1 ? { message: 5 } : { text: `${attacks} of them throw knives at you!` });
    notices.push(hits > 1 ? { text: `${hits} of them get you!` } : { message: (attacks === 1 ? 52 : 6) + hits });
  }
  return { notices, fatal: hits > 0 };
}
