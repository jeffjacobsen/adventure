import type { GameState } from './state.ts';

/** Labels 10000 and 11000. Keep endgame transitions independent of presentation. */
export function beginClosing(state: GameState) {
  state.objects[3].prop = 0; state.objects[12].prop = 0;
  for (const actor of state.actors) { actor.location = 0; actor.seen = false; }
  state.objects[33].place = 0; state.objects[33].fixed = 0;
  state.objects[34].place = 117; state.objects[34].fixed = 122;
  if (state.objects[35].prop !== 3) state.objects[35].place = 0;
  for (const id of [64,28]) { state.objects[id].prop = 0; state.objects[id].fixed = 0; }
  state.clock1 = -1; state.closing = true;
}

export function enterRepository(state: GameState) {
  const put = (id: number, location: number, prop: number) => {
    state.objects[id].place = location; state.objects[id].prop = -1 - prop;
  };
  for (const [id,prop] of [[20,1],[24,0],[15,0],[2,0],[5,0],[17,0]]) put(id,115,prop);
  state.location = 115; state.previousLocation = 115; state.descriptionLong = true; state.visits[115] = 1;
  state.objects[3].place = 116; // PUT's return value is intentionally not assigned to the grate.
  for (const [id,prop] of [[11,1],[8,1],[4,0],[6,0],[10,0]]) put(id,116,prop);
  put(23,115,0); state.objects[23].fixed = 116;
  for (const item of Object.values(state.objects)) if (item.place === -1) item.place = 0;
  state.clock2 = 0; state.closed = true; state.pending = undefined;
}
