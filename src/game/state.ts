import type { ObjectState } from '../world/baseline.ts';
import { initialObjects } from '../world/baseline.ts';
import type { World } from '../world/schema.ts';
import { initialActors, type ActorState } from './actors.ts';

export interface GameState {
  closing: boolean;
  closed: boolean;
  panic: boolean;
  clock1: number;
  clock2: number;
  bonus: 0 | 133 | 134 | 135;
  location: number;
  previousLocation: number;
  secondPreviousLocation: number;
  randomState: number;
  deaths: number;
  dwarfFlag: number;
  actors: ActorState[];
  dwarfKills: number;
  knifeLocation: number;
  lampWarned: boolean;
  hints: number[];
  ploverHintTurns: number;
  hintTurns: Record<number,number>;
  hintResume?: {kind:'verb';object:number;word:string}|{kind:'object';verb:string}|{kind:'say'};
  visits: Record<number,number>;
  abbreviation: number;
  detail: number;
  descriptionLong: boolean;
  westCount: number;
  eggSequence: number;
  lostTreasures: number;
  gaveUp: boolean;
  objects: Record<number, ObjectState>;
  turns: number;
  lampLimit: number;
  gameOver: boolean;
  transcript: string[];
  pending?: { kind: 'object'; verb: string } | { kind: 'quit' } |
    { kind: 'verb'; object: number; word: string } | { kind: 'say' } |
    { kind: 'hint'; id: number; stage: 'offer' | 'cost' } | { kind: 'dragon' } |
    { kind: 'instructions' } | { kind: 'oyster-hint' } | { kind: 'reincarnate'; recoveryLocation: number };
}

export function newGame(world: World, seed = 12345): GameState {
  if (!Number.isInteger(seed) || seed < 1 || seed >= 1048576) throw new Error('Seed must be an integer from 1 to 1048575.');
  return { closing: false, closed: false, panic: false, clock1: 30, clock2: 50, bonus: 0, location: 1, previousLocation: 0, secondPreviousLocation: 0,
    randomState: seed, deaths: 0, dwarfFlag: 0, actors: initialActors(), dwarfKills: 0, knifeLocation: 0,
    lampWarned: false, hints: [], hintTurns: Object.fromEntries([4,5,6,7,8,9].map(id=>[id,0])), visits: Object.fromEntries(world.locations.map(l=>[l.id,0])), abbreviation: 5, detail: 0, descriptionLong: true, westCount: 0, ploverHintTurns: 0, eggSequence: 0, lostTreasures: 0, gaveUp: false,
    objects: initialObjects(world), turns: 0,
    lampLimit: 330, gameOver: false, transcript: [], pending: { kind: 'instructions' } };
}

/** Original RAN recurrence; wall-clock seeding belongs to the adapter. */
export function random(state: GameState, range: number): number {
  state.randomState = state.randomState * 1021 % 1048576;
  return Math.floor(range * state.randomState / 1048576);
}

export function carried(state: GameState, object: number) { return state.objects[object]?.place === -1; }
export function here(state: GameState, object: number) {
  const item = state.objects[object];
  return !!item && (item.place === state.location || item.place === -1 || item.fixed === state.location);
}
