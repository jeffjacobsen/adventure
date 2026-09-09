import { createHash } from 'node:crypto';
import { AdventureEngine } from '../game/engine.ts';
import { newGame } from '../game/state.ts';
import { saveGame, restoreGame } from '../game/save.ts';
import type { World } from '../world/schema.ts';

export interface TreasureCommand {
  sequence: number;
  sourceLine: number;
  raw: string;
  command: string;
  annotation: string;
  directive?: 'axe-if-carried' | 'axe-if-here' | 'recover-cache';
}

/** Read the numbered command column, preserving comments and original line numbers.
 * The final open-ended closing instruction is retained as a note, not executed. */
export function parseTreasureWalkthrough(text: string) {
  const lines = text.split(/\r?\n/);
  const commands: TreasureCommand[] = [];
  let closingNote = '';
  for (const [index, raw] of lines.entries()) {
    if (!raw.trim()) continue;
    const match = raw.match(/^\s*(\d+)\.\s+(.*)$/);
    if (!match) throw new Error(`Expected a numbered command at line ${index + 1}`);
    const sequence = Number(match[1]);
    if (sequence !== commands.length + 1) throw new Error(`Nonsequential step ${sequence} at line ${index + 1}`);
    if (/^Just do anything,/.test(match[2])) { closingNote = [match[2], ...lines.slice(index + 1)].join('\n'); break; }
    const [column, ...comment] = match[2].split(/\s{2,}/);
    const paren = column.indexOf(' (');
    const command = (paren < 0 ? column : column.slice(0, paren)).trim().toUpperCase();
    const annotation = [paren < 0 ? '' : column.slice(paren + 1), ...comment].filter(Boolean).join(' ').trim();
    let directive: TreasureCommand['directive'];
    if (annotation === '(if carrying it)' && command === 'DROP AXE') directive = 'axe-if-carried';
    else if (annotation === '(if here)' && command === 'GET AXE') directive = 'axe-if-here';
    else if (annotation === '(and anything else the pirate may have stolen)' && command === 'GET CHEST') directive = 'recover-cache';
    else if (paren >= 0) throw new Error(`Unrecognized conditional instruction at line ${index + 1}`);
    if (!/^[A-Z][A-Z0-9]*(?: [A-Z][A-Z0-9]*)?$/.test(command)) throw new Error(`Invalid command column at line ${index + 1}`);
    commands.push({ sequence, sourceLine: index + 1, raw, command, annotation, ...(directive ? { directive } : {}) });
  }
  if (!commands.length) throw new Error('Empty treasure walkthrough');
  return { source: 'walkthrough/README.md', sha256: createHash('sha256').update(text).digest('hex'), commands, closingNote };
}

export interface ReplayEntry {
  sequence: number;
  sourceLine: number | null;
  reason: 'instructions' | 'route' | 'dwarf' | 'pirate-recovery' | 'axe-parking';
  command: string;
  locationBefore: number;
  locationAfter: number;
  turn: number;
  events: string[];
}

/** Exercise production rules solely through normal commands, with explicit,
 * logged adaptations for the player's encounter/recovery instructions. */
export function replayTreasureWalkthrough(world: World, text: string, seed = 12345, verifySaves = true) {
  const fixture = parseTreasureWalkthrough(text);
  const engine = new AdventureEngine(world, newGame(world, seed));
  const transcript: ReplayEntry[] = [];
  const skipped: { sequence: number; command: string; reason: string }[] = [];
  let current: TreasureCommand | undefined;
  let axeParked = false;
  let failure: string | null = null;
  let checkpoints = 0;
  let axeEncounter = false, pirateTheft = false;
  const message = (id: number) => world.messages.find(m => m.id === id)!.lines.map(l => l.text).join('\n');
  const act = (command: string, reason: ReplayEntry['reason']) => {
    const before = saveGame(world, engine.state);
    const locationBefore = engine.state.location;
    const result = engine.step(command);
    transcript.push({ sequence: current?.sequence ?? 0, sourceLine: current?.sourceLine ?? null, command, reason,
      locationBefore, locationAfter: engine.state.location, turn: engine.state.turns, events: result.events.map(e => e.text) });
    if (verifySaves) {
      const resumed = new AdventureEngine(world, restoreGame(world, before));
      if (JSON.stringify(resumed.step(command)) !== JSON.stringify(result) || saveGame(world, resumed.state) !== saveGame(world, engine.state)) {
        throw new Error(`Checkpoint replay mismatch before ${command}`);
      }
      checkpoints++;
    }
    axeEncounter ||= result.events.some(e => e.text === message(3));
    pirateTheft ||= result.events.some(e => e.text === message(128));
    if (engine.state.gameOver || engine.state.pending?.kind === 'reincarnate') throw new Error(`Game ended or player died at step ${current?.sequence ?? 0}`);
  };
  const dwarfHere = () => engine.state.dwarfFlag >= 2 && engine.state.actors.slice(0,5).some(a => a.location === engine.state.location);
  const handleDwarves = () => {
    if (engine.state.pending) return;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (engine.state.objects[28].place === engine.state.location && (!axeParked || dwarfHere())) act('GET AXE', 'dwarf');
      if (!dwarfHere()) {
        if (axeParked && engine.state.objects[28].place === -1) act('DROP AXE', 'axe-parking');
        return;
      }
      if (engine.state.objects[28].place !== -1) throw new Error('Dwarf encountered without an accessible axe');
      act('THROW AXE', 'dwarf');
    }
    throw new Error('Dwarf combat exceeded 30 attempts');
  };
  const noun = (id: number) => world.vocabulary.find(v => v.kind === 1 && v.id === id)!.word;
  try {
    act('NO', 'instructions'); // Decline the score-affecting instructions explicitly.
    for (const row of fixture.commands) {
      current = row;
      handleDwarves();
      if (row.directive === 'axe-if-carried') {
        axeParked = true;
        if (engine.state.objects[28].place !== -1) { skipped.push({ sequence: row.sequence, command: row.command, reason: 'Axe is not carried' }); continue; }
      }
      if (row.directive === 'axe-if-here') {
        axeParked = false;
        if (engine.state.objects[28].place !== engine.state.location) { skipped.push({ sequence: row.sequence, command: row.command, reason: 'Axe is not on the ground here' }); continue; }
      }
      act(row.command, 'route');
      if (row.directive === 'recover-cache') {
        if (engine.state.location !== 114) throw new Error('Chest recovery did not reach the pirate cache');
        for (let id = 50; id <= 64; id++) if (id !== 55 && engine.state.objects[id].place === 114 && engine.state.objects[id].prop >= 0) act(`GET ${noun(id)}`, 'pirate-recovery');
      }
      // The player's "anything else the pirate may have stolen" must also be
      // deposited. Log each normal DROP rather than editing treasure state.
      if (row.command === 'DROP CHEST' && engine.state.location === 3) {
        for (let id = 50; id <= 64; id++) if (engine.state.objects[id].place === -1) act(`DROP ${noun(id)}`, 'pirate-recovery');
      }
    }
  } catch (error) { failure = error instanceof Error ? error.message : String(error); }
  const treasures = Array.from({length:15},(_,i)=>50+i).map(id=>({id,name:world.objects.find(o=>o.id===id)!.inventory.lines.map(l=>l.text).join(' '),...engine.state.objects[id]}));
  const deposited = treasures.filter(o=>o.place===3&&o.prop===0).length;
  const score = engine.score();
  const passed = !failure && deposited === 15 && score.parts.magazine === 1 && engine.state.location === 108 && engine.state.deaths === 0 && !engine.state.pending;
  if (!passed && !failure) failure = 'Route finished without the required intact treasure deposits and Witt’s End magazine point';
  return {
    formatVersion: 1, source: { file: fixture.source, sha256: fixture.sha256 }, seed, instructions: 'declined',
    status: passed ? 'passed' : 'failed', failure, scope: 'Pre-closing treasure collection; not a 350-point ending',
    suppliedCommands: fixture.commands.length, executedCommands: transcript.length, checkpoints,
    turns: engine.state.turns, lampRemaining: engine.state.lampLimit, location: engine.state.location,
    deaths: engine.state.deaths, dwarfKills: engine.state.dwarfKills, axeEncounter, pirateTheft,
    deposited, treasures, score, skipped, transcript, closingNote: fixture.closingNote,
    save: saveGame(world, engine.state),
  };
}
