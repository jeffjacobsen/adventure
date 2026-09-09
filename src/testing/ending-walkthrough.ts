import type { World } from '../world/schema.ts';
import { AdventureEngine } from '../game/engine.ts';
import { saveGame, restoreGame } from '../game/save.ts';

/** Reviewed continuation of the user's open-ended step 237. Only normal inputs;
 * waiting with LOOK avoids movement in darkness after switching the lamp off. */
export function completeEnding(world: World, checkpoint: string) {
  const engine = new AdventureEngine(world, restoreGame(world, checkpoint));
  const commands: {command:string;turn:number;location:number;events:string[]}[] = [];
  const step = (command: string) => {
    const resumed = new AdventureEngine(world, restoreGame(world, saveGame(world,engine.state)));
    const result = engine.step(command);
    if (JSON.stringify(resumed.step(command)) !== JSON.stringify(result) || saveGame(world,resumed.state) !== saveGame(world,engine.state)) throw new Error(`Ending checkpoint mismatch: ${command}`);
    commands.push({command,turn:engine.state.turns,location:engine.state.location,events:result.events.map(e=>e.text)});
    if (engine.state.pending?.kind === 'hint') {step('NO');return;}
    if (engine.state.pending) throw new Error(`Unexpected question during ending: ${engine.state.pending.kind}`);
  };
  step('OFF');
  for(let count=0;!engine.state.closed && !engine.state.gameOver && count<80;count++) step('LOOK');
  if (!engine.state.closed || engine.state.gameOver) throw new Error('Repository not reached within closing clocks');
  const repositorySave = saveGame(world,engine.state);
  for(const command of ['SW','GET ROD','NE','DROP ROD','SW','BLAST']) step(command);
  const score = engine.score('final');
  if (!engine.state.gameOver || engine.state.bonus !== 133 || score.score !== 350) throw new Error(`Maximum-score ending failed: ${score.score}`);
  return {score,turns:engine.state.turns,commands,repositorySave,save:saveGame(world,engine.state)};
}
