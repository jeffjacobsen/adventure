import type { Diagnostic, SourceRef, World } from './schema.ts';

export function validateWorld(world: World): Diagnostic[] {
  const issues: Diagnostic[] = [];
  const report = (code: string, message: string, source?: SourceRef, severity: 'error' | 'warning' = 'error') =>
    issues.push({ severity, code, message, ...(source ? { source } : {}) });
  const locations = new Set(world.locations.map(l => l.id));
  const messages = new Set(world.messages.map(m => m.id));
  const objects = new Set(world.placements.map(p => p.object));
  const motions = new Set(world.vocabulary.filter(v => v.kind === 0).map(v => v.id));
  const actions = new Set(world.vocabulary.filter(v => v.kind === 2).map(v => v.id));
  const hasMessage = (id: number, source?: SourceRef) => {
    if (id !== 0 && !messages.has(id)) report('message-reference', `Unknown message ${id}`, source);
  };
  const hasLocation = (id: number, source?: SourceRef) => {
    if (!locations.has(id)) report('location-reference', `Unknown location ${id}`, source);
  };
  const unique = (items: { id: number; source?: SourceRef }[], kind: string) => {
    const seen = new Set<number>();
    for (const item of items) {
      if (seen.has(item.id)) report('duplicate-id', `Duplicate ${kind} ${item.id}`, item.source);
      seen.add(item.id);
    }
  };
  unique(world.objects, 'object');
  unique(world.placements.map(p => ({ id: p.object, source: p.source })), 'placement');
  unique(world.hints, 'hint');
  unique(world.actionDefaults.map(a => ({ id: a.action, source: a.source })), 'action default');
  const seenSources = new Set<number>();
  let previousSource: number | undefined;
  for (const rule of world.travel) {
    hasLocation(rule.from, rule.source);
    if (previousSource !== rule.from && seenSources.has(rule.from)) report('travel-order', 'Noncontiguous travel source', rule.source);
    previousSource = rule.from;
    seenSources.add(rule.from);
    for (const motion of rule.motions) if (motion !== 1 && !motions.has(motion)) {
      const known = rule.from === 113 && rule.encodedDestination === 109 && motion === 109;
      report(known ? 'legacy-motion-109' : 'motion-reference', `Motion ${motion} has no vocabulary entry`, rule.source, known ? 'warning' : 'error');
    }
    const condition = rule.condition;
    if ('object' in condition && !objects.has(condition.object)) report('condition-object', `Unknown object ${condition.object}`, rule.source);
    if (condition.kind === 'propertyNot' && condition.value < 0) report('condition-property', 'Invalid property comparison', rule.source);
    const outcome = rule.outcome;
    if (outcome.kind === 'location') hasLocation(outcome.location, rule.source);
    if (outcome.kind === 'message') hasMessage(outcome.message, rule.source);
    if (outcome.kind === 'special' && ![301, 302, 303].includes(outcome.handler)) report('special-handler', `Unknown handler ${outcome.handler}`, rule.source);
    const needsFallback = !['always', 'playerOnly'].includes(condition.kind) || (outcome.kind === 'special' && outcome.handler === 302);
    if (needsFallback && !rule.fallback) report('missing-fallback', 'Conditional travel or special 302 has no next different destination', rule.source);
    if (rule.fallback) {
      const next = world.travel.find(r => r.id === rule.fallback);
      const start = world.travel.indexOf(rule);
      const expected = world.travel.slice(start + 1).find(r => r.from !== rule.from || r.encodedDestination !== rule.encodedDestination);
      if (!next || next.from !== rule.from || next.id !== expected?.id || next.encodedDestination === rule.encodedDestination)
        report('invalid-fallback', 'Fallback must be the next different destination within this location', rule.source);
    }
  }
  for (const location of world.locations) {
    const first = world.travel.find(r => r.from === location.id);
    if (!first) report('missing-travel', `Location ${location.id} has no travel`);
    if (location.forced !== (first?.motions[0] === 1) || (location.forced && location.conditionBits !== 2))
      report('forced-location', `Incorrect forced-motion flags at ${location.id}`);
  }
  // Forced movement is followed without asking for input; unconditional loops would hang.
  for (const location of world.locations.filter(l => l.forced)) {
    const seen = new Set<number>();
    let current = location.id;
    while (world.locations.find(l => l.id === current)?.forced) {
      if (seen.has(current)) { report('forced-cycle', `Automatic motion cycle from ${location.id}`); break; }
      seen.add(current);
      const first = world.travel.find(r => r.from === current)!;
      if (first.condition.kind !== 'always' || first.outcome.kind !== 'location') break;
      current = first.outcome.location;
    }
  }
  for (const v of world.vocabulary) {
    if (v.kind < 0 || v.kind > 3 || v.id <= 0 || !v.word || v.word.length > 5 || /\s/.test(v.word))
      report('vocabulary-format', `Invalid vocabulary ${v.word}/${v.code}`, v.source);
    if (v.kind === 1 && !objects.has(v.id)) report('vocabulary-object', `Unknown object ${v.id}`, v.source);
    // FEE/FIE/FOE/FOO/FUM use category 3 as sequence values, not spoken messages.
    if (v.kind === 3 && !['FEE', 'FIE', 'FOE', 'FOO', 'FUM'].includes(v.word)) hasMessage(v.id, v.source);
  }
  for (const object of world.objects) {
    if (!objects.has(object.id)) report('object-placement', `Object ${object.id} lacks placement`);
    object.states.forEach((state, i) => {
      if (state.index !== i || state.marker !== i * 100) report('property-order', `Object ${object.id}: nonconsecutive state descriptions`, state.text.lines[0]?.source);
      if (!state.text.lines.length) report('property-text', `Object ${object.id}: empty state`);
    });
    if (!object.states.length && ![21, 22].includes(object.id)) report('missing-properties', `Object ${object.id} lacks state descriptions`);
  }
  for (const p of world.placements) {
    if (p.object <= 0 || p.object >= 100 || p.location < 0 || p.fixed < -1) report('placement-range', 'Invalid placement', p.source);
    if (p.location > 0) hasLocation(p.location, p.source);
    if (p.fixed > 0) hasLocation(p.fixed, p.source);
    if (!world.objects.some(o => o.id === p.object) && ![17, 18].includes(p.object)) report('missing-object-text', `Object ${p.object} lacks descriptions`, p.source);
  }
  const bits = new Set<string>();
  for (const row of world.conditionRows) {
    if (row.bit < 0 || row.bit > 9) report('condition-bit', `Unknown condition bit ${row.bit}`, row.source);
    for (const id of row.locations) {
      hasLocation(id, row.source);
      const key = `${id}:${row.bit}`;
      if (bits.has(key)) report('duplicate-bit', `Repeated condition bit ${key}`, row.source);
      bits.add(key);
    }
  }
  for (const a of world.actionDefaults) {
    if (!actions.has(a.action)) report('action-reference', `Unknown action ${a.action}`, a.source);
    hasMessage(a.message, a.source);
  }
  for (const action of actions) if (!world.actionDefaults.some(a => a.action === action)) report('missing-action-default', `Action ${action} lacks default`);
  for (const h of world.hints) {
    if (h.id < 2 || h.id > 9 || h.turns < 0 || h.cost < 0) report('hint-values', 'Invalid hint', h.source);
    hasMessage(h.question, h.source); hasMessage(h.message, h.source);
    if (h.id >= 4 && (!h.question || !h.message)) report('hint-message', 'Contextual hints need question and answer', h.source);
  }
  for (const row of world.conditionRows.filter(r => r.bit >= 4))
    if (!world.hints.some(h => h.id === row.bit)) report('hint-bit', `No hint for bit ${row.bit}`, row.source);
  for (let i = 1; i < world.ranks.length; i++) if (world.ranks[i].ceiling <= world.ranks[i - 1].ceiling) report('rank-order', 'Rank thresholds must increase');
  if (world.ranks.at(-1)?.ceiling !== 9999) report('rank-coverage', 'Expected final catch-all rank');
  return issues;
}
