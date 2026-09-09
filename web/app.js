const $ = id => document.getElementById(id);
const input = $('command'), transcript = $('transcript');
let checkpoint = null, busy = false, history = [], cursor = 0, draft = '';
const controls = ['submit', 'save', 'load', 'restart', 'help'];

function lock(value) {
  busy = value;
  input.disabled = value || !checkpoint;
  for (const id of controls) $(id).disabled = value || (!checkpoint && id !== 'restart' && id !== 'load');
}
function append(text, kind = '') {
  if (!text) return;
  const p = document.createElement('p');
  p.className = `event ${kind}`;
  p.textContent = text;
  transcript.append(p);
  transcript.scrollTop = transcript.scrollHeight;
}
async function request(path, data, command) {
  if (busy) return;
  lock(true);
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to continue.');
    checkpoint = result.save;
    if (path !== '/api/step') {
      transcript.replaceChildren();
      history = []; cursor = 0; draft = ''; input.value = '';
    }
    if (command) {
      append(`> ${command}`, 'command');
      history.push(command); cursor = history.length; draft = ''; input.value = '';
    }
    for (const event of result.events) append(event.text, event.kind);
    $('turns').textContent = `${result.turns} turn${result.turns === 1 ? '' : 's'}`;
    $('inventory').replaceChildren(...(result.inventory.length ? result.inventory : ['Empty-handed']).map(name => {
      const li = document.createElement('li'); li.textContent = name; return li;
    }));
    $('status').textContent = result.gameOver ? 'Adventure ended. Load a save or start again.' : result.question ? 'The game is waiting for your answer.' : 'Your move.';
  } catch (error) {
    $('status').textContent = `${error.message} Your current game has been kept. Check that the local game server is running.`;
  } finally { lock(false); input.focus(); }
}
$('command-form').addEventListener('submit', event => {
  event.preventDefault();
  const command = input.value.trim();
  if (command && checkpoint) request('/api/step', { save: checkpoint, command }, command);
});
input.addEventListener('keydown', event => {
  if (!['ArrowUp', 'ArrowDown'].includes(event.key) || !history.length) return;
  event.preventDefault();
  if (cursor === history.length) draft = input.value;
  cursor = Math.max(0, Math.min(history.length, cursor + (event.key === 'ArrowUp' ? -1 : 1)));
  input.value = cursor === history.length ? draft : history[cursor];
});
$('help').addEventListener('click', () => request('/api/step', { save: checkpoint, command: 'HELP' }, 'HELP'));
$('restart').addEventListener('click', () => {
  if (!checkpoint || window.confirm('Start a new adventure? Download a save first if you want to keep this game.')) request('/api/new', {});
});
$('save').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([checkpoint], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = `adventure-${new Date().toISOString().replaceAll(':', '-')}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('status').textContent = 'Checkpoint downloaded. Keep it to resume in either interface.';
});
$('load').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async () => {
  const file = $('file').files[0]; $('file').value = '';
  if (!file || busy) return;
  if (file.size > 1_000_000) { $('status').textContent = 'That file is too large to be an Adventure checkpoint.'; return; }
  if (checkpoint && !window.confirm('Replace this game with the selected checkpoint?')) return;
  try { await request('/api/load', { save: await file.text() }); }
  catch { $('status').textContent = 'Unable to read that file. Your current game has been kept.'; }
});
request('/api/new', {});
