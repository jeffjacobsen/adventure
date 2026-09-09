import type { World, TextBlock } from '../world/schema.ts';
import { calculateScore } from '../world/baseline.ts';
import { selectTravel } from '../world/travel.ts';
import { carried, here, newGame, random, type GameState } from './state.ts';
import { tickHints } from './hints.ts';
import { beginClosing, enterRepository } from './closing.ts';
import { dwarfBlocks, updateActors } from './actors.ts';

export interface GameEvent { kind: 'text' | 'move' | 'inventory' | 'error' | 'game-over' | 'question'; text: string; location?: number }
export interface StepResult { state: GameState; events: GameEvent[] }

const text = (block: TextBlock | null | undefined) => block?.lines.map(line => line.text).join('\n') ?? '';
const words = (line: string) => line.trim().toUpperCase().split(/\s+/).filter(Boolean);
const supported = new Set(Array.from({ length: 140 }, (_, i) => i + 1));

export class AdventureEngine {
  readonly world: World;
  state: GameState;
  readonly simulateActors: boolean;
  private inputWasDark = false;
  constructor(world: World, state = newGame(world), options: { actors?: boolean } = {}) {
    this.world = world; this.state = state; this.simulateActors = options.actors !== false;
  }

  start(): StepResult {
    return { state: this.state, events: this.state.gameOver ? this.endingEvents() :
      this.state.pending ? [this.question()] : this.describe() };
  }

  private question(): GameEvent {
    const pending = this.state.pending;
    if (!pending) throw new Error('No pending question');
    const prompt = pending.kind === 'instructions' ? `${this.message(65).text}\nAccepting costs 5 score points and gives 1,000 lamp turns instead of 330. YES or NO?`
      : pending.kind === 'reincarnate' ? this.message(81 + this.state.deaths * 2).text
      : pending.kind === 'quit' ? this.message(22).text
      : pending.kind === 'dragon' ? this.message(49).text
      : pending.kind === 'hint' ? pending.stage === 'offer' ? this.message(this.world.hints.find(h=>h.id===pending.id)!.question).text : `This hint will cost you ${this.world.hints.find(h=>h.id===pending.id)!.cost} points.\n${this.message(175).text}`
      : pending.kind === 'oyster-hint' ? `${this.message(192).text}\nAccepting costs 10 points. YES or NO?`
      : pending.kind === 'say' ? 'Say what?'
      : pending.kind === 'verb' ? `What do you want to do with the ${pending.word.toLowerCase()}?`
      : `What do you want to ${pending.verb.toLowerCase()}?`;
    return { kind: 'question', text: prompt };
  }

  step(input: string): StepResult {
    this.inputWasDark = this.dark();
    const token = words(input)[0]?.slice(0, 5);
    const confirmation = this.state.pending !== undefined && ['quit', 'instructions', 'reincarnate', 'hint', 'oyster-hint'].includes(this.state.pending.kind);
    const sayReply = this.state.pending?.kind === 'say' && words(input).length === 1;
    const dragonYes = this.state.pending?.kind === 'dragon' && (token === 'Y' || token === 'YES');
    const timed = !!token && !['RESTA', 'HELP', '?'].includes(token) && !confirmation && !dragonYes && !this.state.gameOver;
    const events: GameEvent[] = [];
    if (timed) {
      if (this.state.knifeLocation > 0 && this.state.knifeLocation !== this.state.location) this.state.knifeLocation = 0;
      this.state.eggSequence = Math.min(0, -this.state.eggSequence);
      this.state.turns++;
      random(this.state, 1); // Source's otherwise unused input-boundary draw.
      if (!sayReply) {
        if (!this.state.closed) {
          const unseen = Object.entries(this.state.objects).some(([id,o]) => Number(id) >= 50 && Number(id) <= 64 && o.prop < 0);
          if (!this.state.closing && !unseen && this.state.location >= 15 && this.state.location !== 33) this.state.clock1--;
          if (this.state.clock1 === 0) {
            beginClosing(this.state); events.push(this.message(129));
            // Source jumps past lamp handling but still executes this command.
            return this.finishStep(input, events, timed);
          }
          if (this.state.closing && --this.state.clock2 === 0) {
            enterRepository(this.state);
            return { state: this.state, events: [this.message(132), {kind:'move',text:'',location:115}, ...this.describe()] };
          }
        }
        if (this.state.objects[2].prop === 1) this.state.lampLimit--;
        if (this.state.lampLimit <= 30 && here(this.state, 39) && this.state.objects[39].prop === 0 && here(this.state, 2)) {
          this.state.objects[39].prop = 1;
          if (carried(this.state, 39)) this.state.objects[39].place = this.state.location;
          this.state.lampLimit += 2500; this.state.lampWarned = false;
          events.push(this.message(188));
        } else if (this.state.lampLimit === 0) {
          this.state.lampLimit = -1;
          this.state.objects[2].prop = 0;
          if (here(this.state, 2)) events.push(this.message(184));
        } else if (this.state.lampLimit < 0 && this.state.location <= 8) {
          this.state.gaveUp = true; this.state.gameOver = true; this.state.pending = undefined;
          return { state: this.state, events: [...events, this.message(185), ...this.endingEvents()] };
        } else if (this.state.lampLimit <= 30 && !this.state.lampWarned && here(this.state, 2)) {
          this.state.lampWarned = true;
          events.push(this.message(this.state.objects[39].prop === 1 ? 189 : this.state.objects[39].place === 0 ? 183 : 187));
        }
      }
    }
    return this.finishStep(input, events, timed);
  }

  private finishStep(input: string, events: GameEvent[], timed: boolean): StepResult {
    const result = this.command(input);
    const reveal: GameEvent[] = [];
    if (this.state.closed && !this.state.gameOver) {
      if (carried(this.state,15) && this.state.objects[15].prop < 0) reveal.push(this.objectText(15,1));
      for (const item of Object.values(this.state.objects)) if (item.place === -1 && item.prop < 0) item.prop = -1 - item.prop;
    }
    return { state: this.state, events: [...events, ...result.events, ...reveal, ...(timed ? this.checkHints() : [])] };
  }

  private command(input: string): StepResult {
    const parsed = words(input);
    if (!parsed.length) return { state: this.state, events: [{ kind: 'error', text: 'Please enter a command.' }] };
    const first = parsed[0].slice(0, 5), second = parsed[1]?.slice(0, 5);
    if (first === 'RESTA') { this.state = newGame(this.world); return this.start(); }
    if (first === 'HELP' || first === '?') return { state: this.state, events: [{ kind: 'text', text: 'Try compass directions, ENTER, OUT, TAKE, DROP, LOOK, LIGHT, OFF, UNLOCK, or INVENTORY. Answer pending questions with YES or NO. :save and :load manage CLI checkpoints.' }, ...(this.state.pending ? [this.question()] : [])] };
    if (this.state.gameOver) return { state: this.state, events: [{ kind: 'game-over', text: 'The game is over. Type RESTART to play again.' }] };
    if (this.state.pending?.kind === 'dragon') {
      this.state.pending = undefined;
      if (first === 'YES' || first === 'Y') return { state: this.state, events: this.defeatDragon() };
      // Source treats other replies as the next command, rather than YES/NO validation.
    }
    if (this.state.pending?.kind === 'oyster-hint') {
      if (!['Y','YES','N','NO'].includes(first)) return {state:this.state,events:[this.question()]};
      this.state.pending = undefined;
      const yes = ['Y','YES'].includes(first);
      if (yes) this.state.hints.push(2);
      return {state:this.state,events:[this.message(yes ? 193 : 54)]};
    }
    if (this.state.pending?.kind === 'hint') {
      if (!['Y', 'YES', 'N', 'NO'].includes(first)) return { state: this.state, events: [{ kind: 'text', text: 'Please answer YES or NO.' }] };
      const {stage,id} = this.state.pending;
      const hint = this.world.hints.find(h=>h.id===id)!;
      this.state.pending = undefined;
      if (first === 'N' || first === 'NO') return { state: this.state, events: [this.message(54), ...this.resumeHint()] };
      if (stage === 'offer') {
        this.state.pending = { kind: 'hint', id, stage: 'cost' };
        return { state: this.state, events: [this.question()] };
      }
      this.state.hints.push(id);
      if (this.state.lampLimit > 30) this.state.lampLimit += 30*hint.cost;
      return { state: this.state, events: [this.message(hint.message), ...this.resumeHint()] };
    }
    if (this.state.pending && (this.state.pending.kind === 'quit' || this.state.pending.kind === 'instructions' || this.state.pending.kind === 'reincarnate')) {
      if (!['Y', 'YES', 'N', 'NO'].includes(first)) return { state: this.state, events: [{ kind: 'text', text: 'Please answer YES or NO.' }] };
      const pending = this.state.pending;
      const yes = first === 'Y' || first === 'YES';
      this.state.pending = undefined;
      if (pending.kind === 'instructions') {
        if (yes) { this.state.hints.push(3); this.state.lampLimit = 1000; }
        return { state: this.state, events: [...(yes ? [this.message(1)] : []), ...this.narrate()] };
      }
      if (pending.kind === 'reincarnate') return { state: this.state, events: this.reincarnate(yes, pending.recoveryLocation) };
      if (yes) { this.state.gaveUp = true; this.state.gameOver = true; }
      return { state: this.state, events: yes ? this.endingEvents() : [this.message(54)] };
    }
    if (this.state.pending?.kind === 'say' && !second) {
      this.state.pending = undefined;
      return { state: this.state, events: this.say(parsed[0]) };
    }
    const pending = this.state.pending;
    if(first==='ENTER' && second){
      if(['STREA','WATER'].includes(second))return {state:this.state,events:[this.message(this.localLiquid()===21?70:43)]};
      return this.command(parsed.slice(1).join(' '));
    }
    if ((first === 'WATER' || first === 'OIL') && second &&
        ((second === 'PLANT' && here(this.state, 24)) || (second === 'DOOR' && here(this.state, 9)))) {
      return this.command(`POUR ${first}`);
    }
    let entry = this.world.vocabulary.find(v => v.word === first);
    if (entry?.kind === 1 && entry.id === 5 && !here(this.state,5) && here(this.state,6)) entry = {...entry,id:6};
    if (!entry && first !== 'EXAMI') {
      let id=60;if(random(this.state,100)<20)id=61;if(random(this.state,100)<20)id=13;
      return {state:this.state,events:[this.message(id)]};
    }
    if (pending?.kind === 'object' && entry?.kind === 1 && !second) {
      this.state.pending = undefined;
      return { state: this.state, events: this.action(pending.verb, this.actionId(pending.verb)!, entry.id) };
    }
    if (pending?.kind === 'verb' && entry?.kind === 2 && !second) {
      this.state.pending = undefined;
      return { state: this.state, events: this.action(first, entry.id, pending.object) };
    }
    this.state.pending = undefined;
    if (entry?.kind === 3) return { state: this.state, events: [this.message(entry.id)] };
    if (entry?.code === 2025 && !second) return { state: this.state, events: this.recallEggs(first) };
    if (entry?.kind === 2 && [30, 31].includes(entry.id)) return { state: this.state, events: [{ kind: 'text', text: 'This version has no timeshare hours or suspension restrictions. Use the save controls to keep a checkpoint.' }] };
    if (entry?.kind === 2 && entry.id === 3) {
      if (!second) { this.state.pending = { kind: 'say' }; return { state: this.state, events: [this.question()] }; }
      return { state: this.state, events: this.say(parsed[1]) };
    }
    if (entry?.kind === 2 && entry.id === 18 && !second) { this.state.pending = { kind: 'quit' }; return { state: this.state, events: [this.question()] }; }
    if (entry?.code === 2026 && !second) {this.state.abbreviation=10000;this.state.detail=3;return {state:this.state,events:[this.message(156)]};}
    if (first === 'LOOK' || first === 'EXAMI') return { state: this.state, events: this.look() };
    if (first === 'WEST' && ++this.state.westCount === 10) {const result=this.move(44);return {state:this.state,events:[this.message(17),...result]};}
    if (entry?.kind === 0) return { state: this.state, events: this.move(entry.id) };
    if (entry?.kind === 2 && entry.id === 20 && !second) return { state: this.state, events: [{ kind: 'inventory', text: this.inventory() }] };
    if (entry?.kind === 2 && entry.id === 24 && !second) {
      const score = this.score();
      this.state.pending = { kind: 'quit' };
      return { state: this.state, events: [{ kind: 'text', text: `If you were to quit now, you would score ${score.score} out of a possible ${score.maximum}.` }, this.message(143)] };
    }
    if (entry?.kind === 1) {
      if (!this.available(entry.id)) {
        if (entry.id === 3 && [1, 4, 7].includes(this.state.location)) return { state: this.state, events: this.move(this.motionId('DEPRE')!) };
        if (entry.id === 3 && this.state.location > 9 && this.state.location < 15) return { state: this.state, events: this.move(this.motionId('ENTRA')!) };
        return { state: this.state, events: [{ kind: 'error', text: 'I see no such thing here.' }] };
      }
      if (second) {
        const next = this.world.vocabulary.find(v => v.word === second);
        if (next?.kind === 2) return this.command(`${second} ${first}`);
        if (next?.kind === 0) return { state: this.state, events: this.move(next.id) };
        return { state: this.state, events: [{ kind: 'error', text: 'Please use an action with that object.' }] };
      }
      this.state.pending = { kind: 'verb', object: entry.id, word: first };
      return { state: this.state, events: [this.question()] };
    }
    let object = second ? this.objectId(second) : this.inferredObject(first);
    const verb = this.actionId(first);
    if (verb !== null) {
      const next = second ? this.world.vocabulary.find(v => v.word === second) : undefined;
      if (next?.kind === 0) return { state: this.state, events: this.move(next.id) };
      if (next?.kind === 3) return { state: this.state, events: [this.message(next.id)] };
      if (second && object === null) return { state: this.state, events: [{ kind: 'error', text: 'I see no such thing here.' }] };
      if (object === null && [1, 2, 4, 6, 9, 10, 16, 17, 19, 21, 28, 29].includes(verb)) {
        if ([4, 6].includes(verb)) for (const id of [14, 15, 9, 3, 64]) if (here(this.state, id)) object = id;
        const candidates = Object.entries(this.state.objects).filter(([, item]) => first === 'DROP' ? item.place === -1 : item.place === this.state.location || item.fixed === this.state.location)
          .filter(([id]) => this.world.objects.find(o => o.id === Number(id))?.inventory);
        if (object === null && verb === 1 && candidates.length === 1 && !this.dwarfHere()) object = Number(candidates[0][0]);
        if (object === null) {
          this.state.pending = { kind: 'object', verb: first };
          return { state: this.state, events: [{ kind: 'text', text: `What do you want to ${first.toLowerCase()}?` }] };
        }
      }
      const result = this.action(first, verb, object);
      return { state: this.state, events: result };
    }
    const motion = this.motionId(first);
    if (motion !== null) {
      const result = this.move(motion);
      return { state: this.state, events: result };
    }
    return { state: this.state, events: [{ kind: 'error', text: `I don't understand that.` }] };
  }

  private say(word: string): GameEvent[] {
    const entry = this.world.vocabulary.find(v => v.word === word.slice(0, 5));
    if (entry?.kind === 0 && [62, 65, 71].includes(entry.id)) return this.move(entry.id);
    if (entry?.code === 2025) return this.recallEggs(word.slice(0, 5));
    return [{ kind: 'text', text: `Okay, "${word}".` }];
  }

  private checkHints(): GameEvent[] {
    const id=tickHints(this.world,this.state);
    if(id===null)return [];
    if(this.state.pending && ['object','verb','say'].includes(this.state.pending.kind)) this.state.hintResume=this.state.pending as NonNullable<GameState['hintResume']>;
    this.state.pending={kind:'hint',id,stage:'offer'};
    return [this.question()];
  }
  private resumeHint():GameEvent[]{
    this.state.pending=this.state.hintResume;delete this.state.hintResume;
    return this.state.pending?[this.question()]:[];
  }

  private recallEggs(word: string): GameEvent[] {
    const k = this.world.vocabulary.find(v => v.kind === 3 && v.word === word)!.id;
    if (this.state.eggSequence !== 1 - k) return [this.message(this.state.eggSequence !== 0 ? 151 : 42)];
    this.state.eggSequence = k;
    if (k !== 4) return [this.message(54)];
    this.state.eggSequence = 0;
    const eggs = this.state.objects[56];
    if (eggs.place === 92 || (eggs.place === -1 && this.state.location === 92)) return [this.message(42)];
    if (eggs.place === 0 && this.state.objects[33].place === 0 && this.state.objects[33].prop === 0) this.state.objects[33].prop = 1;
    const appearance = this.state.location === 92 ? 0 : here(this.state, 56) ? 1 : 2;
    eggs.place = 92;
    return [{ kind: 'text', text: text(this.world.objects.find(o => o.id === 56)!.states.find(s => s.index === appearance)!.text) }];
  }

  private defeatDragon(): GameEvent[] {
    const placement = this.world.placements.find(p => p.object === 31)!;
    const center = (placement.location + placement.fixed) / 2;
    this.state.objects[31] = { place: center, fixed: -1, prop: 2 };
    this.state.objects[62] = { place: center, fixed: 0, prop: 0 };
    for (const item of Object.values(this.state.objects)) {
      if (item.place === placement.location || item.place === placement.fixed) item.place = center;
    }
    this.state.location = center;
    return [{ kind: 'text', text: text(this.world.objects.find(o => o.id === 31)!.states.find(s => s.index === 1)!.text) },
      { kind: 'move', text: '', location: center }, ...this.arrive(this.inputWasDark)];
  }

  score(context: 'quitPreview' | 'final' = 'quitPreview') {
    return calculateScore(this.world, { objects: this.state.objects, deaths: this.state.deaths,
      dwarfFlag: this.state.dwarfFlag, gaveUp: this.state.gaveUp, closing: this.state.closing, closed: this.state.closed, bonus: this.state.bonus, hints: this.state.hints }, context);
  }

  private panic(): GameEvent[] {
    if (!this.state.panic) this.state.clock2 = 15;
    this.state.panic = true;
    return [this.message(130)];
  }
  private finish(message: number): GameEvent[] {
    this.state.gameOver = true; this.state.pending = undefined;
    return [this.message(message), ...this.endingEvents()];
  }
  private endingEvents(): GameEvent[] {
    const score = this.score('final');
    return [{ kind: 'game-over', text: `You scored ${score.score} out of a possible ${score.maximum}, using ${this.state.turns} turns.\n${score.rank ? text(score.rank.text) : ''}\nGAME OVER. Type RESTART to play again.` }];
  }

  private message(id: number): GameEvent {
    let message = text(this.world.messages.find(m => m.id === id));
    // Omit the obsolete contact invitation from modern instructions; retain the source and credits.
    if (id === 1) message = message.split('\n').filter(line => line.trim() !== 'CONTACT DON IF YOU HAVE ANY QUESTIONS, COMMENTS, ETC.').join('\n');
    return { kind: 'text', text: message };
  }
  private dark() {
    const room = this.world.locations.find(l => l.id === this.state.location)!;
    return !(room.conditionBits & 1) && !(here(this.state, 2) && this.state.objects[2].prop === 1);
  }

  private motionId(word: string) { const entry = this.world.vocabulary.find(v => v.kind === 0 && v.word === word); return entry?.id ?? null; }
  private actionId(word: string) { const entry = this.world.vocabulary.find(v => v.kind === 2 && v.word === word); return entry?.id ?? null; }
  private objectId(word: string) {
    const entry = this.world.vocabulary.find(v => v.kind === 1 && v.word === word && v.id in this.state.objects);
    return entry?.id === 5 && !here(this.state,5) && here(this.state,6) ? 6 : entry?.id ?? null;
  }
  private inferredObject(word: string) { return this.objectId(word); }

  private move(motion: number): GameEvent[] {
    const origin = this.state.location;
    if (motion === this.motionId('LOOK')) return this.look();
    const wasDark = this.inputWasDark;
    if (motion === this.motionId('NULL')) return this.arrive(wasDark);
    if (motion === this.motionId('CAVE')) return [this.message(origin < 8 ? 57 : 58), ...this.arrive(wasDark)];
    if (motion === this.motionId('BACK')) {
      let target = this.state.previousLocation;
      if (this.world.locations.find(l => l.id === target)?.forced) target = this.state.secondPreviousLocation;
      this.rememberMove();
      if (target === origin) return [this.message(91), ...this.arrive(wasDark)];
      const rows = this.world.travel.filter(r => r.from === origin);
      // Source labels 20–25 prefer a direct destination; only then use the last
      // forced intermediary whose FIRST travel destination leads to the target.
      let row = rows.find(r => r.outcome.kind === 'location' && r.outcome.location === target);
      if (!row) {
        for (const candidate of rows) {
          if (candidate.outcome.kind !== 'location') continue;
          const via = candidate.outcome.location;
          const first = this.world.travel.find(r => r.from === via)?.outcome;
          if (this.world.locations.find(l => l.id === via)?.forced && first?.kind === 'location' && first.location === target) row = candidate;
        }
      }
      if (!row) return [this.message(140), ...this.arrive(wasDark)];
      motion = row.motions[0];
    } else this.rememberMove();
    let selected = selectTravel(this.world, this.state.location, motion, this.state.objects, range => random(this.state, range));
    if (!selected) {
      const message=[29,30,43,44,45,46,47,48,49,50].includes(motion)?9:[7,36,37].includes(motion)?10:[11,19].includes(motion)?11:[62,65].includes(motion)?42:motion===17?80:12;
      return [this.message(message),...this.arrive(wasDark)];
    }
    if (selected.outcome.kind === 'special' && selected.outcome.handler === 302) {
      this.state.objects[59].place = origin;
      // Re-select with the emerald no longer carried: the source continues at
      // the next different destination, which is the normal PLOVER route.
      selected = selectTravel(this.world, origin, motion, this.state.objects, range => random(this.state, range))!;
    }
    let outcome = selected.outcome;
    if (outcome.kind === 'special' && outcome.handler === 301) {
      const carriedIds = Object.entries(this.state.objects).filter(([id, o]) => ![21, 22].includes(Number(id)) && o.place === -1).map(([id]) => Number(id));
      if (carriedIds.length !== 0 && !(carriedIds.length === 1 && carriedIds[0] === 59)) return [this.message(117), ...this.arrive(wasDark)];
      outcome = { kind: 'location', location: 199 - origin };
    }
    if (outcome.kind === 'special' && outcome.handler === 303) {
      const troll = this.state.objects[33];
      if (troll.prop === 1) {
        troll.prop = 0; this.setTroll(true);
        return [this.objectText(33, 1), ...this.arrive(wasDark)];
      }
      const destination = 239 - origin;
      if (troll.prop === 0) troll.prop = 1;
      if (carried(this.state, 35)) {
        this.state.objects[32].prop = 1;
        troll.prop = 2;
        this.state.objects[35] = { place: destination, fixed: -1, prop: 3 };
        if (this.state.objects[63].prop < 0) this.state.lostTreasures++;
        return [this.message(162), ...this.die(destination)];
      }
      outcome = { kind: 'location', location: destination };
    }
    if (outcome.kind === 'message') return [this.message(outcome.message), ...this.arrive(wasDark)];
    if (outcome.kind === 'death') return this.die(origin);
    if (outcome.kind !== 'location' || !supported.has(outcome.location)) {
      throw new Error('Invalid or unhandled travel outcome');
    }
    if (this.state.closing && outcome.location < 9) return [...this.panic(), ...this.arrive(wasDark)];
    if (this.simulateActors && dwarfBlocks(this.world, this.state, outcome.location)) return [this.message(2), ...this.arrive(wasDark)];
    this.state.location = outcome.location;
    const events: GameEvent[] = [];
    for (let i = 0; i < 16; i++) {
      const room = this.world.locations.find(l => l.id === this.state.location)!;
      if (!room.forced) break;
      if(text(room.long)!=='>$<')events.push({ kind: 'text', text: text(room.long) });
      this.rememberMove();
      const forced = selectTravel(this.world, room.id, 1, this.state.objects, range => random(this.state, range));
      if (forced?.outcome.kind === 'death') return [...events, ...this.die(origin)];
      if (forced?.outcome.kind !== 'location') throw new Error('Unsupported forced transition');
      this.state.location = forced.outcome.location;
    }
    return [...events, { kind: 'move', text: '', location: this.state.location }, ...this.arrive(wasDark)];
  }

  private rememberMove() {
    this.state.secondPreviousLocation = this.state.previousLocation;
    this.state.previousLocation = this.state.location;
  }

  private arrive(wasDark: boolean): GameEvent[] {
    const actorUpdate = this.simulateActors && !this.state.closing ? updateActors(this.world, this.state) : { notices: [], fatal: false };
    if (!this.simulateActors && this.state.location >= 15 && this.state.dwarfFlag === 0) this.state.dwarfFlag = 1;
    const events: GameEvent[] = actorUpdate.notices.map(n => n.message !== undefined ? this.message(n.message) : { kind: 'text', text: n.text! });
    if (actorUpdate.fatal) return [...events, ...this.die(this.state.location)];
    if (wasDark && this.dark() && random(this.state, 100) < 35) return [...events, this.message(23), ...this.die(this.state.location)];
    this.discover();
    return [...events, ...this.narrate()];
  }

  /** Source room-narration clue; passive start/render never consumes randomness. */
  private look():GameEvent[]{
    const explain=this.state.detail++<3?[this.message(15)]:[];
    this.state.visits[this.state.location]=0;
    return [...explain,...this.arrive(false)];
  }
  private narrate(): GameEvent[] {
    if(!this.dark()){
      this.state.descriptionLong=this.state.visits[this.state.location]%this.state.abbreviation===0;
      this.state.visits[this.state.location]++;
    }
    const events = this.describe();
    if (this.state.location === 33 && random(this.state, 100) < 25 && !this.state.closing) events.push(this.message(8));
    return events;
  }

  private die(recoveryLocation: number): GameEvent[] {
    if (this.state.closing) { this.state.deaths++; return this.finish(131); }
    this.state.pending = { kind: 'reincarnate', recoveryLocation };
    return [this.question()];
  }

  /** Source labels 99/98: count the death after YES/NO, then drop carried gear. */
  private reincarnate(yes: boolean, recoveryLocation: number): GameEvent[] {
    const events = [this.message(yes ? 82 + this.state.deaths * 2 : 54)];
    this.state.deaths++;
    if (!yes || this.state.deaths >= 3) {
      this.state.gameOver = true;
      return [...events, ...this.endingEvents()];
    }
    this.state.objects[21].place = 0;
    this.state.objects[22].place = 0;
    if (carried(this.state, 2)) this.state.objects[2].prop = 0;
    for (const id of Object.keys(this.state.objects).map(Number).sort((a, b) => b - a)) {
      if (carried(this.state, id)) this.state.objects[id].place = id === 2 ? 1 : recoveryLocation;
    }
    this.state.location = 3;
    this.state.previousLocation = 3;
    this.state.secondPreviousLocation = recoveryLocation;
    return [...events, { kind: 'move', text: '', location: 3 }, ...this.narrate()];
  }

  private discover() {
    if (this.state.closed || this.dark()) return;
    for (const [id, item] of Object.entries(this.state.objects)) {
      if (Number(id) >= 50 && item.prop < 0 && here(this.state, Number(id))) {
        item.prop = [62, 64].includes(Number(id)) ? 1 : 0;
        const remaining = Object.entries(this.state.objects).filter(([key, o]) => Number(key) >= 50 && Number(key) <= 64 && o.prop < 0).length;
        if (remaining !== 0 && remaining === this.state.lostTreasures) this.state.lampLimit = Math.min(35, this.state.lampLimit);
      }
    }
  }

  private action(word: string, verb: number, object: number | null): GameEvent[] {
    let id = object ?? this.inferredObject(word);
    if ([2,17].includes(verb) && id === 5 && !carried(this.state,5) && carried(this.state,6)) id = 6;
    if (verb === 23) {
      if (!this.state.closed || this.state.objects[6].prop < 0) return [this.message(67)];
      this.state.bonus = here(this.state,6) ? 135 : this.state.location === 115 ? 134 : 133;
      return this.finish(this.state.bonus);
    }
    if (verb === 12) return this.attack(id);
    if (verb === 19 || verb === 20) {
      if (id === null) return [this.message(59)];
      return [this.message(carried(this.state, id) ? 24 : this.state.closed ? 138 : this.available(id) ? 94 : 59)];
    }
    if (id !== null && !this.available(id)) return [{ kind: 'error', text: 'I see no such thing here.' }];
    if (verb === 27) {
      if (this.dark()) return [{ kind: 'error', text: 'It is too dark to read.' }];
      const readable = [16, 13, 36].filter(o => here(this.state, o));
      const target = id ?? (this.state.closed && carried(this.state,15) ? 15 : readable.length === 1 ? readable[0] : null);
      if (target === null) return this.askObject('READ');
      if (target === 15 && this.state.closed && carried(this.state,15)) {
        if (this.state.hints.includes(2)) return [this.message(194)];
        this.state.pending = {kind:'oyster-hint'}; return [this.question()];
      }
      return [this.message(target === 16 ? 190 : target === 13 ? 196 : target === 36 ? 191 : 195)];
    }
    if (verb === 28 && id === 23) return this.state.closed ? [this.message(197), ...this.finish(136)] : [this.message(148)];
    if (verb === 29) return id === 17 && this.state.closed ? [this.message(199), ...this.finish(136)] : [this.message(110)];
    if (verb === 16) return [this.message(id === 2 ? 75 : 76)];
    if (verb === 22) return this.fill(id);
    if (verb === 13) return this.pour(id);
    if (verb === 15) return this.drink(id);
    if (verb === 14 && (id === 19 || (id === null && here(this.state, 19)))) {
      this.state.objects[19].place = 0; return [this.message(72)];
    }
    if (verb === 14) return id===null?this.askObject('EAT'):[this.message([8,11,14,15,17,31,33,35].includes(id)?71:110)];
    if (verb === 5) return [this.message(54)];
    if (verb === 1) return this.take(id);
    if (verb === 2) return this.drop(id);
    if (verb === 17) return this.throwObject(id);
    if (verb === 28 && id === 58 && this.state.objects[58].prop === 0) {
      this.shatterVase(); return [this.message(198)];
    }
    if (verb === 7 || verb === 8) return id === null || id === 2 ? this.lamp(verb === 7) : [this.message(78)];
    if (verb === 4 || verb === 6) return this.grate(verb === 4, id);
    if (verb === 9) return this.wave(id);
    if (verb === 21) return this.feed(id);
    return [this.message(this.world.actionDefaults.find(a=>a.action===verb)!.message)];
  }

  private liquid(): number {
    return this.state.objects[20].prop === 0 ? 21 : this.state.objects[20].prop === 2 ? 22 : 0;
  }
  private localLiquid(): number {
    const bits = this.world.locations.find(l => l.id === this.state.location)!.conditionBits;
    return bits & 4 ? (bits & 2 ? 22 : 21) : 0;
  }
  private available(id: number): boolean {
    if (id === 17) return (this.state.closed && here(this.state,17)) || this.dwarfHere();
    if (id === 18) return this.state.knifeLocation === this.state.location;
    return here(this.state, id) || ((id === 21 || id === 22) &&
      (this.localLiquid() === id || (this.liquid() === id && here(this.state, 20))));
  }
  private askObject(verb: string): GameEvent[] {
    this.state.pending = { kind: 'object', verb };
    return [this.question()];
  }
  private fill(id: number | null): GameEvent[] {
    if (id === 58) {
      if (!this.localLiquid()) return [this.message(144)];
      if (!carried(this.state, 58)) return [this.message(29)];
      this.state.objects[58].prop = 2;
      this.state.objects[58].fixed = -1;
      return [this.message(145), ...this.drop(58)];
    }
    if (id === null && !here(this.state, 20)) return this.askObject('FILL');
    if (id !== null && id !== 20) return [this.message(29)];
    if (this.liquid()) return [this.message(105)];
    const liquid = this.localLiquid();
    if (!liquid) return [this.message(106)];
    this.state.objects[20].prop = liquid === 21 ? 0 : 2;
    if (carried(this.state, 20)) this.state.objects[liquid].place = -1;
    return [this.message(liquid === 21 ? 107 : 108)];
  }
  private pour(id: number | null): GameEvent[] {
    if (id === null || id === 20) id = this.liquid();
    if (!id) return this.askObject('POUR');
    if (!carried(this.state, id)) return [this.message(29)];
    if (id !== 21 && id !== 22) return [this.message(78)];
    this.state.objects[20].prop = 1;
    this.state.objects[id].place = 0;
    if (here(this.state, 9)) {
      this.state.objects[9].prop = id === 22 ? 1 : 0;
      return [this.message(id === 22 ? 114 : 113)];
    }
    if (here(this.state, 24)) {
      if (id === 22) return [this.message(112)];
      const plant = this.state.objects[24];
      const response = this.world.objects.find(o => o.id === 24)!.states.find(s => s.index === plant.prop + 1)!;
      plant.prop = (plant.prop + 2) % 6;
      this.state.objects[25].prop = plant.prop / 2;
      return [{ kind: 'text', text: text(response.text) }, ...this.arrive(this.inputWasDark)];
    }
    return [this.message(77)];
  }
  private drink(id: number | null): GameEvent[] {
    if (id !== null && id !== 21) return [this.message(110)];
    if (this.liquid() === 21 && here(this.state, 20)) {
      this.state.objects[20].prop = 1; this.state.objects[21].place = 0;
      return [this.message(74)];
    }
    if (this.localLiquid() === 21) return [this.message(73)];
    return this.askObject('DRINK');
  }

  private take(id: number | null): GameEvent[] {
    if (id === 18 && this.state.knifeLocation === this.state.location) {
      this.state.knifeLocation = -1; return [this.message(116)];
    }
    if (id === 17 && this.dwarfHere()) return [this.message(25)];
    if (id === 21 || id === 22) {
      if (this.liquid() === id && here(this.state, 20)) return this.take(20);
      if (!carried(this.state, 20)) return [this.message(104)];
      return this.liquid() === 0 ? this.fill(20) : [this.message(105)];
    }
    if (id === null || !here(this.state, id)) return [{ kind: 'error', text: 'I see no such thing here.' }];
    const item = this.state.objects[id];
    if (carried(this.state, id)) return [this.message(24)];
    if (item.fixed !== 0) return id === 35 && item.prop === 1 ? [this.message(169)] : [{ kind: 'text', text: 'You cannot carry that.' }];
    if (Object.entries(this.state.objects).filter(([id, o]) => ![21, 22].includes(Number(id)) && o.place === -1).length >= 7) return [this.message(92)];
    if (id === 8 && item.prop === 0) {
      const rod = this.objectId('ROD'), cage = this.objectId('CAGE');
      if (rod !== null && carried(this.state, rod)) return [{ kind: 'text', text: 'The bird is frightened by the rod and will not let you catch it.' }];
      if (cage === null || !carried(this.state, cage)) return [{ kind: 'text', text: 'You can catch the bird, but you cannot carry it without the cage.' }];
      item.prop = 1;
      this.state.objects[cage].place = -1;
    }
    if ((id === 4 || id === 8) && this.state.objects[8].prop !== 0) this.state.objects[12 - id].place = -1;
    item.place = -1;
    if (id === 20 && this.liquid()) this.state.objects[this.liquid()].place = -1;
    return [{ kind: 'text', text: 'Taken.' }];
  }
  private drop(id: number | null): GameEvent[] {
    if ((id === 21 || id === 22) && carried(this.state, id)) id = 20;
    if (id === null || !carried(this.state, id)) return [{ kind: 'error', text: 'You are not carrying that.' }];
    this.state.objects[id].place = this.state.location;
    if (id === 54 && here(this.state, 38)) {
      this.state.objects[54].place = 0;
      this.state.objects[39].place = this.state.location;
      return [this.objectText(39, 0)];
    }
    if (id === 35 && here(this.state, 33)) {
      this.setTroll(false); this.state.objects[33].prop = 2;
      return [this.message(163)];
    }
    if (id === 58 && this.state.location !== 96) {
      const pillow = this.state.objects[10];
      const cushioned = pillow.place === this.state.location || pillow.fixed === this.state.location;
      if (!cushioned) this.shatterVase();
      else this.state.objects[58].prop = 0;
      const description = this.world.objects.find(o => o.id === 58)!.states.find(s => s.index === (cushioned ? 1 : 3))!;
      return [{ kind: 'text', text: text(description.text) }];
    }
    if (id === 20 && this.liquid()) this.state.objects[this.liquid()].place = 0;
    if (id === 4 && this.state.objects[8].prop !== 0) this.state.objects[8].place = this.state.location;
    if (id === 8) this.state.objects[8].prop = 0;
    if (id === 8 && here(this.state,11) && this.state.closed) return [this.message(30), ...this.finish(136)];
    if (id === 8 && here(this.state, 31) && this.state.objects[31].prop === 0) {
      this.state.objects[8].place = 0;
      if (this.state.objects[11].place === 19) this.state.lostTreasures++;
      return [this.message(154)];
    }
    if (id === 8 && this.state.location === 19) {
      const snake = this.objectId('SNAKE');
      if (snake !== null && here(this.state, snake) && this.state.objects[snake].prop === 0) {
        this.state.objects[snake].prop = 1;
        this.state.objects[snake].place = 0;
        this.state.objects[snake].fixed = 0;
        this.state.objects[8].prop = 0;
        this.state.objects[8].place = this.state.location;
        return [{ kind: 'text', text: 'The little bird attacks the green snake and drives it away.' }, ...this.describe()];
      }
    }
    return [{ kind: 'text', text: 'Dropped.' }, ...this.describe()];
  }
  private lamp(on: boolean): GameEvent[] {
    const lamp = this.objectId('LAMP');
    if (lamp === null || !here(this.state, lamp)) return [{ kind: 'error', text: 'You have no lamp.' }];
    if (on && this.state.lampLimit < 0) return [this.message(184)];
    const wasDark = this.dark();
    this.state.objects[lamp].prop = on ? 1 : 0;
    this.discover();
    return [{ kind: 'text', text: on ? 'Your lamp is now on.' : 'Your lamp is now off.' }, ...(on && wasDark ? this.narrate() : this.dark() ? [this.message(16)] : [])];
  }
  private wave(id: number | null): GameEvent[] {
    const rod = this.objectId('ROD'), fissure = this.objectId('FISSU');
    if (this.state.closing || rod === null || fissure === null || id !== rod || !carried(this.state, rod) || !here(this.state, fissure))
      return [{ kind: 'text', text: 'Nothing happens.' }];
    this.state.objects[fissure].prop = this.state.objects[fissure].prop === 0 ? 1 : 0;
    return [{ kind: 'text', text: this.state.objects[fissure].prop ? 'A crystal bridge now spans the fissure.' : 'The crystal bridge has vanished.' }];
  }
  private dwarfHere(): boolean {
    return this.state.dwarfFlag >= 2 && this.state.actors.slice(0, 5).some(a => a.location === this.state.location);
  }
  private attack(id: number | null, thrownAxe = false): GameEvent[] {
    if (id === null) {
      let targets = [17, 11, 31, 33, 35].filter(o => this.available(o) && (o !== 17 || this.dwarfHere()) &&
        (![31, 35].includes(o) || this.state.objects[o].prop === 0));
      if (!targets.length) targets = [...(!thrownAxe && here(this.state, 8) ? [8] : []),
        ...(here(this.state, 14) || here(this.state, 15) ? [14] : [])];
      if (targets.length > 1) return this.askObject('KILL');
      id = targets[0] ?? null;
    } else if (!this.available(id)) return [{ kind: 'error', text: 'I see no such thing here.' }];
    if (id === 17 && this.state.closed) return this.finish(136);
    if (id === 8 && this.state.closed) return [this.message(137)];
    if (id === 31 && this.state.objects[31].prop === 0) {
      this.state.pending = { kind: 'dragon' }; return [this.question()];
    }
    if (id === 8) {
      this.state.objects[8].place = 0; this.state.objects[8].prop = 0;
      if (this.state.objects[11].place === 19) this.state.lostTreasures++;
      return [this.message(45)];
    }
    return [this.message(id === 17 ? 49 : id === 11 ? 46 : id === 31 ? 167 : id === 33 ? 157 :
      id === 35 ? 165 + Math.floor((this.state.objects[35].prop + 1) / 2) : id === 14 || id === 15 ? 150 : 44)];
  }

  private objectText(id: number, index: number): GameEvent {
    return { kind: 'text', text: text(this.world.objects.find(o => o.id === id)?.states.find(s => s.index === index)?.text) };
  }
  private setTroll(present: boolean) {
    const placement = this.world.placements.find(p => p.object === 33)!;
    this.state.objects[33].place = present ? placement.location : 0;
    this.state.objects[33].fixed = present ? placement.fixed : 0;
    this.state.objects[34].place = present ? 0 : placement.location;
    this.state.objects[34].fixed = present ? 0 : placement.fixed;
  }
  private throwObject(id: number | null): GameEvent[] {
    if (id === null) return this.askObject('THROW');
    if (!carried(this.state, id)) return [this.message(29)];
    if (id >= 50 && id <= 64 && here(this.state, 33)) {
      this.state.objects[id].place = 0; this.setTroll(false);
      return [this.message(159)];
    }
    if (id === 19 && here(this.state, 35)) return this.feed(35);
    if (id === 28) {
      const dwarf = this.state.actors.slice(0, 5).find(a => a.location === this.state.location);
      if (dwarf) {
        this.state.objects[28].place = this.state.location;
        let response = 48;
        if (random(this.state, 3) !== 0) {
          dwarf.location = 0; dwarf.seen = false;
          this.state.dwarfKills++;
          response = this.state.dwarfKills === 1 ? 149 : 47;
        }
        return [this.message(response), ...this.arrive(this.inputWasDark)];
      }
      if (here(this.state, 35) && this.state.objects[35].prop === 0) {
        this.state.objects[28].place = this.state.location;
        this.state.objects[28].fixed = -1; this.state.objects[28].prop = 1;
        return [this.message(164)];
      }
      if (here(this.state, 33) || (here(this.state, 31) && this.state.objects[31].prop === 0)) {
        this.state.objects[28].place = this.state.location;
        return [this.message(here(this.state, 33) ? 158 : 152), ...this.arrive(this.inputWasDark)];
      }
      return this.attack(null, true);
    }
    return this.drop(id);
  }

  private feed(id: number | null): GameEvent[] {
    if (id === 17 && this.dwarfHere()) {
      if (!here(this.state, 19)) return [this.message(14)];
      this.state.dwarfFlag++; return [this.message(103)];
    }
    if (id === 35 && here(this.state, 35)) {
      if (!here(this.state, 19)) return [this.message(this.state.objects[35].prop === 3 ? 110 : this.state.objects[35].prop === 0 ? 102 : 14)];
      this.state.objects[19].place = 0;
      this.state.objects[35].prop = 1;
      this.state.objects[28].fixed = 0; this.state.objects[28].prop = 0;
      return [this.message(168)];
    }
    const snake = this.objectId('SNAKE'), bird = this.objectId('BIRD');
    if (!this.state.closed && id === snake && snake !== null && bird !== null && here(this.state, snake) && here(this.state, bird)) {
      this.state.objects[bird].place = 0;
      this.state.objects[bird].prop = 0;
      this.state.lostTreasures++;
      return [this.message(101)];
    }
    return [this.message(id===8?100:id===11?102:id===31?(this.state.objects[31].prop===0?102:110):id===33?182:14)];
  }
  private grate(open: boolean, id: number | null): GameEvent[] {
    if (id === 64) {
      if (!here(this.state, 1)) return [this.message(31)];
      const chain = this.state.objects[64], bear = this.state.objects[35];
      if (open) {
        if (chain.prop === 0) return [this.message(37)];
        if (bear.prop === 0) return [this.message(41)];
        chain.prop = 0; chain.fixed = 0;
        if (bear.prop !== 3) bear.prop = 2;
        bear.fixed = 2 - bear.prop;
        return [this.message(171)];
      }
      if (this.state.location !== 130) return [this.message(173)];
      if (chain.prop !== 0) return [this.message(34)];
      chain.prop = 2; chain.fixed = -1;
      if (chain.place === -1) chain.place = this.state.location;
      return [this.message(172)];
    }
    if (id === 14 || id === 15) {
      const offset = id - 14;
      if (!open) return [this.message(61)];
      if (!carried(this.state, 57)) return [this.message(122 + offset)];
      if (carried(this.state, id)) return [this.message(120 + offset)];
      if (id === 14) {
        this.state.objects[14].place = 0;
        this.state.objects[15].place = this.state.location;
        this.state.objects[61].place = 105;
      }
      return [this.message(124 + offset)];
    }
    if (id === 9 && here(this.state, 9)) return [this.message(this.state.objects[9].prop === 1 ? 54 : 111)];
    if(id===9)return [this.message(this.state.objects[9].prop===1?54:111)];
    if(id===4)return [this.message(32)];
    if(id===1)return [this.message(55)];
    const grate = this.objectId('GRATE');
    const keys = this.objectId('KEYS');
    if (id !== grate || grate === null || !here(this.state, grate)) return [{ kind: 'text', text: 'There is nothing here with a lock.' }];
    if (keys === null || !here(this.state, keys)) return [{ kind: 'text', text: 'You have no keys.' }];
    if (grate === null) return [{ kind: 'text', text: 'There is nothing here with a lock.' }];
    if (this.state.closing) return this.panic();
    this.state.objects[grate].prop = open ? 1 : 0;
    return [{ kind: 'text', text: open ? 'The grate is now unlocked.' : 'The grate is now locked.' }];
  }

  private inventory() {
    const names = Object.entries(this.state.objects).filter(([id, item]) => ![21, 22].includes(Number(id)) && item.place === -1).map(([id]) => {
      const object = this.world.objects.find(o => o.id === Number(id));
      return object ? text(object.inventory) : `Object ${id}`;
    });
    return names.length ? `You are carrying:\n${names.join('\n')}` : 'You are empty-handed.';
  }

  private shatterVase() {
    this.state.objects[58].place = this.state.location;
    this.state.objects[58].prop = 2;
    this.state.objects[58].fixed = -1;
  }
  private describe(): GameEvent[] {
    if (this.dark()) return [this.message(16)];
    const location = this.world.locations.find(l => l.id === this.state.location);
    const lines = [...(carried(this.state, 35) ? [this.message(141).text] : []), text(this.state.descriptionLong ? location?.long : location?.short ?? location?.long)];
    for (const [id, item] of Object.entries(this.state.objects)) {
      if (item.place !== this.state.location && item.fixed !== this.state.location) continue;
      if (this.state.closed && item.prop < 0) continue;
      if (Number(id) === 7 && carried(this.state, 50)) continue;
      const object = this.world.objects.find(o => o.id === Number(id));
      const property = Number(id) === 7 && item.fixed === this.state.location ? 1 : item.prop >= 0 ? item.prop : 0;
      const state = object?.states[property];
      if (state && !state.suppressed) lines.push(text(state.text));
    }
    return [{ kind: 'text', text: lines.filter(Boolean).join('\n\n') }];
  }
}
