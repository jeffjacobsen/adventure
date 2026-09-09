import { createHash } from 'node:crypto';
import type { World } from '../world/schema.ts';
import { newGame, type GameState } from './state.ts';
import { initialActors } from './actors.ts';

const fingerprint = (world: World) => createHash('sha256').update(JSON.stringify(world)).digest('hex');

export function saveGame(world: World, state: GameState): string {
  return JSON.stringify({ format: 'adventure-opening', version: 9, world: fingerprint(world), state }, null, 2);
}

/** Reject incompatible or malformed saves before replacing the running game. */
export function restoreGame(world: World, contents: string): GameState {
  const save = JSON.parse(contents);
  if (save?.format !== 'adventure-opening' || ![1, 2, 3, 4, 5, 6, 7, 8, 9].includes(save.version) || save.world !== fingerprint(world)) {
    throw new Error('Incompatible save format or world data.');
  }
  const s = save.state;
  if (save.version < 8 && s && typeof s === 'object') {
    s.closing = false; s.closed = false; s.panic = false; s.clock1 = 30; s.clock2 = 50; s.bonus = 0;
  }
  if (save.version < 7 && s && typeof s === 'object') {
    s.actors = initialActors(); s.dwarfKills = 0; s.knifeLocation = 0;
  }
  if (save.version < 6 && s && typeof s === 'object') s.lostTreasures = s.objects?.[8]?.place === 0 && s.objects?.[11]?.place === 19 ? 1 : 0;
  if (save.version < 5 && s && typeof s === 'object') s.eggSequence = 0;
  if (save.version < 4 && s && typeof s === 'object') s.ploverHintTurns = 0;
  // Version 1 always skipped instructions. Its terminal states predate ending scores.
  if (save.version === 1 && s && typeof s === 'object') {
    s.hints = [];
    s.gaveUp = s.gameOver === true && s.deaths === 0;
  }
  if(save.version<9 && s && typeof s==='object'){
    s.hintTurns=Object.fromEntries([4,5,6,7,8,9].map(id=>[id,id===8?s.ploverHintTurns:0]));
    s.visits=Object.fromEntries(world.locations.map(l=>[l.id,0]));s.abbreviation=5;s.detail=0;s.descriptionLong=true;s.westCount=0;
    if(s.pending?.kind==='hint')s.pending.id=8;
    delete s.hintResume;
  }
  const validLocation = (n: unknown) => Number.isInteger(n) && world.locations.some(l => l.id === n);
  const integer = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max;
  if (!s || !validLocation(s.location) ||
      ![s.previousLocation, s.secondPreviousLocation].every(n => n === 0 || validLocation(n)) ||
      !integer(s.turns, 0, Number.MAX_SAFE_INTEGER) || !integer(s.lampLimit, -1, 4000) ||
      !integer(s.ploverHintTurns, 0, Number.MAX_SAFE_INTEGER) ||
      !integer(s.eggSequence, -3, 3) ||
      !integer(s.lostTreasures, 0, 15) ||
      !integer(s.randomState, 1, 1048575) || !integer(s.deaths, 0, 3) || !integer(s.dwarfFlag, 0, Number.MAX_SAFE_INTEGER) ||
      !integer(s.dwarfKills, 0, 5) || !(s.knifeLocation === -1 || s.knifeLocation === 0 || validLocation(s.knifeLocation)) ||
      !Array.isArray(s.actors) || s.actors.length !== 6 || !s.actors.every((a: any) => a &&
        [a.location, a.previousLocation].every(n => n === 0 || validLocation(n)) && typeof a.seen === 'boolean') ||
      !['closing','closed','panic'].every(k => typeof s[k] === 'boolean') ||
      !integer(s.clock1,-1,30) || s.clock1 === 0 || !integer(s.clock2,0,50) || ![0,133,134,135].includes(s.bonus) ||
      (s.closed && (!s.closing || s.clock2 !== 0 || ![115,116].includes(s.location))) || (!s.closed && s.clock2 === 0) || (s.closing !== (s.clock1 === -1)) ||
      (!s.closing && s.panic) || (s.bonus !== 0 && (!s.closed || !s.gameOver)) ||
      typeof s.gameOver !== 'boolean' || typeof s.lampWarned !== 'boolean' ||
      typeof s.gaveUp !== 'boolean' || !Array.isArray(s.hints) || s.hints.length > 8 || new Set(s.hints).size !== s.hints.length ||
      !s.hints.every((id: unknown) => (save.version >= 9 && typeof id === 'number' && world.hints.some(h=>h.id===id)) || (save.version >= 8 && id === 2) || id === 3 || (save.version >= 4 && id === 8)) ||
      !Array.isArray(s.transcript) || !s.transcript.every((line: unknown) => typeof line === 'string')) throw new Error('Invalid saved state.');
  if(!s.hintTurns || Object.keys(s.hintTurns).length!==6 || ![4,5,6,7,8,9].every(id=>integer(s.hintTurns[id],0,Number.MAX_SAFE_INTEGER)) ||
    !s.visits || Object.keys(s.visits).length!==140 || !world.locations.every(l=>integer(s.visits[l.id],0,Number.MAX_SAFE_INTEGER)) ||
    ![5,10000].includes(s.abbreviation) || !integer(s.detail,0,Number.MAX_SAFE_INTEGER) || typeof s.descriptionLong!=='boolean' || !integer(s.westCount,0,Number.MAX_SAFE_INTEGER)) throw new Error('Invalid saved hint or description state.');
  if(s.hintResume!==undefined && (s.pending?.kind!=='hint' || !(s.hintResume?.kind==='say' ||
    (s.hintResume?.kind==='object' && world.vocabulary.some(v=>v.kind===2&&v.word===s.hintResume.verb)) ||
    (s.hintResume?.kind==='verb' && world.vocabulary.some(v=>v.kind===1&&v.id===s.hintResume.object&&v.word===s.hintResume.word))))) throw new Error('Invalid saved hint continuation.');
  const initial = newGame(world);
  if (!s.objects || Object.keys(s.objects).length !== Object.keys(initial.objects).length) throw new Error('Invalid saved objects.');
  for (const id of Object.keys(initial.objects)) {
    const item = s.objects[id];
    if (!item || ![item.place, item.fixed].every(n => n === -1 || n === 0 || validLocation(n)) ||
        !integer(item.prop, s.closed ? -2 : -1, 6)) throw new Error(`Invalid saved object ${id}.`);
  }
  if (s.pending !== undefined && !(s.pending?.kind === 'quit' ||
      (save.version >= 8 && s.pending?.kind === 'oyster-hint' && s.closed && s.objects[15].place === -1 && !s.hints.includes(2)) ||
      (save.version >= 2 && s.pending?.kind === 'instructions' && s.turns === 0 && s.deaths === 0 && s.hints.length === 0 && s.location === 1) ||
      (save.version >= 2 && s.pending?.kind === 'reincarnate' && s.deaths < 3 && validLocation(s.pending.recoveryLocation)) ||
      (save.version >= 4 && s.pending?.kind === 'hint' && ['offer', 'cost'].includes(s.pending.stage) && world.hints.some(h=>h.id===s.pending.id && h.id>=4) && !s.hints.includes(s.pending.id)) ||
      (save.version >= 5 && s.pending?.kind === 'dragon' && [119, 121].includes(s.location) && s.objects[31].prop === 0) ||
      (save.version >= 3 && s.pending?.kind === 'say') ||
      (save.version >= 3 && s.pending?.kind === 'verb' && typeof s.pending.word === 'string' &&
       world.vocabulary.some(v => v.kind === 1 && v.id === s.pending.object && v.word === s.pending.word)) ||
      (s.pending?.kind === 'object' && typeof s.pending.verb === 'string' &&
       world.vocabulary.some(v => v.kind === 2 && v.word === s.pending.verb)))) throw new Error('Invalid saved question.');
  if (s.gameOver && s.pending !== undefined) throw new Error('Finished game cannot have a pending question.');
  return s as GameState;
}
