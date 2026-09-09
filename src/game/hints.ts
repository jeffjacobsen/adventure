import type {World} from '../world/schema.ts';
import {carried,here,type GameState} from './state.ts';

/** Source hint gates 40400–40900. Thresholds, costs and text come from section 11. */
export function tickHints(world:World,state:GameState):number|null {
  if(state.gameOver)return null;
  const bits=world.locations.find(l=>l.id===state.location)!.conditionBits;
  let offered:number|null=null;
  for(const hint of world.hints.filter(h=>h.id>=4)){
    if(state.hints.includes(hint.id))continue;
    const count=hint.id===8?state.ploverHintTurns:state.hintTurns[hint.id];
    const next=bits&(1<<hint.id)?count+1:0;
    state.hintTurns[hint.id]=next;if(hint.id===8)state.ploverHintTurns=next;
    if(next<hint.turns)continue;
    const empty=(loc:number)=>loc===0||!Object.values(state.objects).some(o=>o.place===loc||o.fixed===loc);
    const holding=Object.entries(state.objects).filter(([id,o])=>![21,22].includes(Number(id))&&o.place===-1).length;
    const eligible=hint.id===4?state.objects[3].prop===0&&!here(state,1)
      :hint.id===5?here(state,8)&&carried(state,5)&&state.pending?.kind==='verb'&&state.pending.object===8
      :hint.id===6?here(state,11)&&!here(state,8)
      :hint.id===7?empty(state.location)&&empty(state.previousLocation)&&empty(state.secondPreviousLocation)&&holding>1
      :hint.id===8?state.objects[59].prop!==-1&&state.objects[60].prop===-1:true;
    if(!eligible){if(hint.id!==5){state.hintTurns[hint.id]=0;if(hint.id===8)state.ploverHintTurns=0;}continue;}
    if(offered!==null||state.pending&&!['object','verb','say'].includes(state.pending.kind))continue;
    state.hintTurns[hint.id]=0;if(hint.id===8)state.ploverHintTurns=0;
    offered=hint.id;
  }
  return offered;
}
