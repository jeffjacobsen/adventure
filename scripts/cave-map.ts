import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { loadOriginalWorld } from '../src/game/load.ts';
import { mapExits, motionName } from '../src/world/map.ts';

const world = await loadOriginalWorld();
const exits = mapExits(world);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const alike = [...range(42,58), ...range(80,87),114];
const different = [107,112,...range(131,140)];
const group = (id: number) => alike.includes(id) ? 'alike' : different.includes(id) ? 'different' : String(id);
const regions = [
  { title: 'Daylight & the entrance', subtitle: 'Road, forest, grate and the first descent', ids: [...range(1,14),16,79] },
  { title: 'Halls, fissure & the mazes', subtitle: 'The great halls and two collapsed maze networks', ids: [15,17,18,20,21,22,27,40,41,59,60,61,62,63,...alike,...different] },
  { title: 'The king’s hall & Y2', subtitle: 'Side chambers, the window and routes into the deep cave', ids: [19,28,29,30,31,32,33,34,35,36,37,38,39] },
  { title: 'Bedquilt & the shell passages', subtitle: 'A web of junctions, corridors and dead ends', ids: [64,65,103,102,104,105,106,108] },
  { title: 'Twopit & the water route', subtitle: 'Swiss Cheese, the plant, Giant Room and the waterfall', ids: [23,24,25,26,66,67,68,...range(88,96)] },
  { title: 'Secret canyons & the dragon', subtitle: 'Overlapping canyon views, the reservoir and a one-way descent', ids: [69,70,71,74,75,76,77,78,109,110,111,113,119,120,121] },
  { title: 'Plover & the chasm approach', subtitle: 'Oriental Room, the narrow passage and the near bank', ids: [72,73,97,98,99,100,101,117,118] },
  { title: 'Beyond the troll bridge', subtitle: 'Warm walls, the volcano vista and the bear’s room', ids: range(122,130) },
  { title: 'The repository', subtitle: 'Endgame reference • reached by cave closing, not an ordinary exit', ids: [115,116] },
];
const names: Record<string,string> = {
  1:'End of road',2:'Hill in road',3:'Spring house',4:'Valley',5:'Forest',6:'Forest',7:'Slit in streambed',8:'Outside grate',9:'Below grate',10:'Cobble crawl',11:'Debris room',12:'Sloping canyon',13:'Bird chamber',14:'Top of small pit',15:'Hall of Mists',16:'Too-small crack',17:'Fissure · east bank',18:'Gold room',19:'Hall of Mt King',20:'Broken-neck pit',21:'Failed jump',22:'Unclimbable dome',23:'Twopit · west end',24:'East pit',25:'West pit / plant',26:'Through plant hole',27:'Fissure · west bank',28:'Low N/S passage',29:'South side chamber',30:'West side chamber',31:'Plant climb check',32:'Snake blocks way',33:'Y2',34:'Jumble of rock',35:'Window on pit',36:'Dirty passage',37:'Brink of small pit',38:'Stream pit',39:'Dusty rock room',40:'Low crawl · west',41:'West end of Mists',59:'Low crawl · east',60:'Long hall · east',61:'Long hall · west',62:'Crossover',63:'Dead end',64:'Complex junction',65:'Bedquilt',66:'Swiss Cheese',67:'Twopit · east end',68:'Slab room',69:'N/S canyon above room',70:'N/S canyon above passage',71:'Three-canyon junction',72:'Large low room',73:'Dead-end crawl',74:'Secret E/W canyon',75:'Wide place in canyon',76:'Too-tight canyon',77:'Tall E/W canyon',78:'Boulder dead end',79:'Sewer pipes',88:'Narrow corridor',89:'Nothing to climb',90:'Climb out of pit',91:'Steep incline',92:'Giant Room',93:'Cave-in',94:'Immense N/S passage',95:'Waterfall cavern',96:'Soft Room',97:'Oriental Room',98:'Misty cavern',99:'Alcove',100:'Plover Room',101:'Dark-room',102:'Arched hall',103:'Shell Room',104:'Sloping corridor',105:'Cul-de-sac',106:'Anteroom',108:'Witt’s End',109:'Mirror canyon',110:'Window on pit',111:'Top of stalactite',113:'Reservoir',115:'Repository · NE end',116:'Repository · SW end',117:'Chasm · SW bank',118:'Sloping corridor',119:'Dragon canyon · north',120:'Dragon canyon · east',121:'Dragon canyon · joined',122:'Chasm · NE bank',123:'Long E/W corridor',124:'Fork in path',125:'Warm-wall junction',126:'Volcano vista',127:'Boulder chamber',128:'Limestone passage',129:'Barren Room approach',130:'Barren Room',alike:'Maze · all alike',different:'Maze · all different'
};
const ids = regions.flatMap(r => r.ids).sort((a,b)=>a-b);
if (ids.length !== 140 || ids.some((id,i)=>id !== i+1)) throw new Error('Regions must partition all 140 locations');
const regionOf = (id: string) => regions.findIndex(r => r.ids.some(i => group(i) === id));
const members = (id: string) => world.locations.filter(l => group(l.id) === id);
const conditional = (id: string) => members(id).some(l => exits.some(e => e.from === l.id && e.conditional));
const xml = (s: string) => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const q = (s: string) => JSON.stringify(s);
const number = (id: string) => id === 'alike' ? '26 locations · chest at #114' : id === 'different' ? '12 locations · batteries at #140' : `#${id}`;

// One edge per unordered pair and travel type. Direction labels belong to the
// departure room; there is no assumption that a reverse exit exists.
const edges = new Map<string,{a:string;b:string;ab:Set<number>;ba:Set<number>;magic:boolean}>();
for (const e of exits) {
  if (!e.to || e.from === e.to || e.motion === 109) continue;
  const from = group(e.from), to = group(e.to);
  if (from === to) continue;
  const [a,b] = [from,to].sort();
  const key = `${a}:${b}:${e.magic}`;
  if (!edges.has(key)) edges.set(key,{a,b,ab:new Set(),ba:new Set(),magic:e.magic});
  edges.get(key)![from === a ? 'ab':'ba'].add(e.motion);
}
function label(motions:Set<number>) {
  // Use all compass/up/down directions when present; named aliases for the
  // same destination are available in the inspector instead of crowding lines.
  const directions = [...motions].filter(m => [29,30,43,44,45,46,47,48,49,50].includes(m));
  const selected = directions.length ? directions : [...motions];
  return selected.map(m=>motionName(world,m)).join('/');
}
const cards: {svg:string;width:number;height:number}[] = [];
for (const [index,region] of regions.entries()) {
  const local = new Set(region.ids.map(group));
  const relevant = [...edges.values()].filter(e => local.has(e.a) || local.has(e.b));
  const nodes = new Set([...local,...relevant.flatMap(e=>[e.a,e.b])]);
  const dot = ['digraph cave {', 'graph [rankdir=TB, bgcolor="transparent", pad="0.4", nodesep="0.5", ranksep="0.9", splines=true, overlap=false, outputorder=edgesfirst];',
    'node [shape=box, style="rounded,filled", fillcolor="#fffdf7", color="#89998a", fontname="Georgia", fontsize=15, margin="0.16,0.12", penwidth=1.1];',
    'edge [color="#58786f", fontcolor="#294f48", fontname="Helvetica", fontsize=10, arrowsize=0.65, penwidth=1.15, labeldistance=2.3, labelangle=25];'];
  for (const id of nodes) {
    const portal = !local.has(id);
    const forced = members(id).every(l=>l.forced);
    const title = `${names[id]}${conditional(id) ? '  X' : ''}`;
    const sub = portal ? `${number(id)} · panel ${regionOf(id)+1}` : number(id);
    dot.push(`${q(id)} [id=${q(`r${index}-n${id}`)}, label=<${xml(title)}<BR/><FONT FACE="Helvetica" POINT-SIZE="10">${xml(sub)}</FONT>>, fillcolor="${portal?'#edf1e9':id==='alike'||id==='different'?'#f3e6c7':forced?'#f2ede4':'#fffdf7'}", color="${conditional(id)?'#b78d45':'#89998a'}", style="${portal?'rounded,dashed,filled':'rounded,filled'}", tooltip=${q(names[id])}];`);
  }
  for (const e of relevant) {
    dot.push(`${q(e.a)} -> ${q(e.b)} [dir=${q(e.ab.size && e.ba.size ? 'both' : e.ab.size ? 'forward' : 'back')}, label=${q([e.ab.size ? `${e.a === 'alike' ? 'MA' : e.a === 'different' ? 'MD' : '#'+e.a}: ${label(e.ab)}` : '', e.ba.size ? `${e.b === 'alike' ? 'MA' : e.b === 'different' ? 'MD' : '#'+e.b}: ${label(e.ba)}` : ''].filter(Boolean).join('\n'))}, color="${e.magic?'#93628e':'#58786f'}", fontcolor="${e.magic?'#7b4b76':'#294f48'}", style="${e.magic?'dashed':'solid'}", id=${q(`r${index}-e-${e.a}-${e.b}-${e.magic}`)}];`);
  }
  dot.push('}');
  const result = execFileSync('dot',['-Tsvg'],{input:dot.join('\n'),encoding:'utf8'});
  const vb = result.match(/viewBox="0.00 0.00 ([\d.]+) ([\d.]+)"/)!.slice(1).map(Number);
  const inner = result.slice(result.indexOf('<g id='), result.lastIndexOf('</svg>')).replace('id="graph0"', `id="graph-${index}"`);
  cards.push({svg:inner,width:vb[0],height:vb[1]});
}
const cardWidth=1080, gap=28, margin=48, header=255;
const scales=cards.map(c=>Math.min((cardWidth-32)/c.width,1.2));
const rowHeights=[0,1,2].map(row=>Math.max(...cards.slice(row*3,row*3+3).map((c,i)=>c.height*scales[row*3+i]))+118);
const width=margin*2+3*cardWidth+gap*2, height=header+rowHeights.reduce((a,b)=>a+b,0)+gap*2+100;
let svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="map-title map-desc"><title id="map-title">Colossal Cave: an atlas of passages</title><desc id="map-desc">Nine regional diagrams of all 140 locations, with two mazes collapsed. Exit labels identify the departure room and command. X marks conditional travel. Dashed boxes continue in another panel.</desc><style>text{paint-order:stroke;stroke:#faf7ef;stroke-width:3px;stroke-linejoin:round} .node text{stroke-width:0} .node{cursor:pointer} .node:hover polygon,.node:hover path{stroke:#a66422;stroke-width:3} .selected polygon,.selected path{stroke:#b76221!important;stroke-width:4!important} .card-title{font:28px Georgia;fill:#203e36} .caption{font:16px Helvetica;fill:#647165} .kicker{font:15px Helvetica;letter-spacing:3px;fill:#647165}</style><rect width="100%" height="100%" fill="#faf7ef"/><text x="48" y="44" class="kicker">CROWTHER–WOODS / 350-POINT EDITION / AUTHOR’S ATLAS</text><text x="46" y="110" style="font:62px Georgia;fill:#203e36">Colossal Cave</text><text x="49" y="152" style="font:24px Georgia;fill:#647165">An atlas of passages — arranged for reading, not compass accuracy.</text><text x="49" y="193" class="caption">Each route label gives its departure room and command: #8: D means DOWN from #8. Arrowheads show travel directions.</text><text x="49" y="222" class="caption">X = conditional exits (conditions hidden)    ·    Purple dashed routes = magic    ·    Dashed room boxes = continuation in another panel    ·    Gold boxes = collapsed mazes (MA / MD)    ·    U / D = up / down</text>`;
const offsets:number[]=[];
for (let i=0;i<cards.length;i++) {
  const row=Math.floor(i/3), col=i%3;
  const x=margin+col*(cardWidth+gap), y=header+rowHeights.slice(0,row).reduce((a,b)=>a+b,0)+row*gap;
  offsets.push(y);
  svg+=`<g id="panel-${i}"><rect x="${x}" y="${y}" width="${cardWidth}" height="${rowHeights[row]}" rx="18" fill="#fffdf8" stroke="#d7d8c8"/><text x="${x+25}" y="${y+40}" class="card-title">${i+1}. ${xml(regions[i].title)}</text><text x="${x+25}" y="${y+69}" class="caption">${xml(regions[i].subtitle)}</text><g transform="translate(${x+(cardWidth-cards[i].width*scales[i])/2},${y+92}) scale(${scales[i]})">${cards[i].svg}</g></g>`;
}
svg+=`<text x="48" y="${height-50}" class="caption">All 140 source locations accounted for. Maze interiors, self-loops and blocked/fatal outcomes are omitted from the drawing; select a room in the HTML atlas for full travel alternatives.</text><text x="48" y="${height-23}" class="caption">Labels use compass directions where available; other aliases remain in the inspector. This is an authoring map with spoilers, not a live player map. Repository entry occurs through cave closing.</text></svg>`;
const data=Object.fromEntries(world.locations.map(l=>[l.id,{id:l.id,group:group(l.id),region:regionOf(group(l.id)),name:names[group(l.id)],description:l.long.lines.map(x=>x.text).join(' '),conditional:conditional(group(l.id)),exits:exits.filter(e=>e.from===l.id&&e.motion!==109).map(e=>({...e,command:motionName(world,e.motion),aliases:world.vocabulary.filter(v=>v.kind===0&&v.id===e.motion).map(v=>v.word)}))}]));
const root=new URL('../',import.meta.url);
await mkdir(new URL('docs/maps/',root),{recursive:true});
await writeFile(new URL('docs/maps/cave-atlas.svg',root),svg);
const template=await readFile(new URL('scripts/cave-map.html',root),'utf8');
await writeFile(new URL('docs/maps/cave-atlas.html',root),template.replace('<!-- MAP -->',svg).replace('/* DATA */',`const rooms=${JSON.stringify(data).replaceAll('<','\\u003c')}; const panels=${JSON.stringify(regions.map(r=>r.title))};`));
console.log(`Wrote SVG and interactive HTML atlas: 140 locations, ${new Set(world.locations.map(l=>group(l.id))).size} room/group nodes, 9 panels.`);
