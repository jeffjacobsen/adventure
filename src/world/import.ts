import type { Condition, ObjectDescription, Outcome, RecordLine, Section, TextBlock, TravelRule, World } from './schema.ts';

function fail(file: string, line: number, message: string): never {
  throw new Error(`${file}:${line}: ${message}`);
}

/** Preserve physical line numbers, raw records, tabs inside prose, and order. */
export function readSections(input: string, file = 'original/adventure.dat'): Section[] {
  const sections: Section[] = [];
  let section: Section | undefined;
  let ended = false;
  const lines = input.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = i + 1;
    if (!raw.trim()) continue;
    if (ended) fail(file, line, 'content after section 0');
    if (!section) {
      if (!/^\d+$/.test(raw.trim())) fail(file, line, 'expected section number');
      const id = Number(raw.trim());
      if (id === 0) { ended = true; continue; }
      if (id !== sections.length + 1 || id > 12) fail(file, line, 'expected consecutive sections 1–12');
      section = { id, source: { file, line }, records: [] };
      sections.push(section);
      continue;
    }
    const match = raw.match(/^\s*(-?\d+)(?:(?:\t| +)(.*))?$/);
    if (!match) fail(file, line, 'expected numeric record key');
    const key = Number(match[1]);
    if (key === -1) { section = undefined; continue; }
    if (key < 0) fail(file, line, 'unexpected negative record key');
    section.records.push({ key, value: match[2] ?? '', source: { file, line }, raw });
  }
  if (section || !ended || sections.length !== 12) fail(file, lines.length, 'incomplete twelve-section database');
  return sections;
}

function numbers(record: RecordLine, min: number, max = min): number[] {
  const parts = record.value.trim() ? record.value.trim().split(/\s+/) : [];
  if (parts.length < min || parts.length > max || parts.some(p => !/^-?\d+$/.test(p))) {
    fail(record.source.file, record.source.line, `expected ${min}–${max} integer fields`);
  }
  return parts.map(Number);
}

function blocks(records: RecordLine[]): TextBlock[] {
  const result: TextBlock[] = [];
  const seen = new Set<number>();
  for (const record of records) {
    let block = result.at(-1);
    if (!block || block.id !== record.key) {
      if (seen.has(record.key)) fail(record.source.file, record.source.line, `noncontiguous text ID ${record.key}`);
      seen.add(record.key);
      block = { id: record.key, lines: [] };
      result.push(block);
    }
    if (!record.value.trim()) fail(record.source.file, record.source.line, 'empty text record');
    block.lines.push({ text: record.value, source: record.source });
  }
  return result;
}

export function decodeDestination(encoded: number): { condition: Condition; outcome: Outcome } {
  if (!Number.isSafeInteger(encoded) || encoded < 0) throw new Error('Invalid encoded destination');
  const m = Math.floor(encoded / 1000), n = encoded % 1000;
  const condition: Condition = m === 0 ? { kind: 'always' }
    : m < 100 ? { kind: 'chance', percent: m }
    : m === 100 ? { kind: 'playerOnly' }
    : m <= 200 ? { kind: 'carrying', object: m % 100 }
    : m <= 300 ? { kind: 'present', object: m % 100 }
    : { kind: 'propertyNot', object: m % 100, value: Math.floor(m / 100) - 3 };
  const outcome: Outcome = n === 0 ? { kind: 'death' }
    : n <= 300 ? { kind: 'location', location: n }
    : n <= 500 ? { kind: 'special', handler: n }
    : { kind: 'message', message: n - 500 };
  return { condition, outcome };
}

export function importWorld(input: string, file?: string): World {
  const sections = readSections(input, file);
  const records = (id: number) => sections[id - 1].records;
  const long = blocks(records(1)), short = blocks(records(2));
  const travel: TravelRule[] = records(3).map(r => {
    const [encodedDestination, ...motions] = numbers(r, 2, 21);
    return { id: `travel-${r.source.line}`, from: r.key, encodedDestination, motions,
      ...decodeDestination(encodedDestination), fallback: null, source: r.source };
  });
  // Failure scans the next different encoded destination, ignoring motion keywords.
  // This also models special 302's explicit re-entry at Fortran label 12.
  for (let i = 0; i < travel.length; i++) {
    for (let j = i + 1; j < travel.length && travel[j].from === travel[i].from; j++) {
      if (travel[j].encodedDestination !== travel[i].encodedDestination) {
        travel[i].fallback = travel[j].id;
        break;
      }
    }
  }
  const vocabulary = records(4).map(r => ({ code: r.key, kind: Math.floor(r.key / 1000),
    id: r.key % 1000, word: r.value.trim().split(/\s+/)[0], source: r.source }));
  const objects: ObjectDescription[] = [];
  let objectRecords: RecordLine[] = [];
  const finishObject = () => {
    if (!objectRecords.length) return;
    const [inventory, ...states] = blocks(objectRecords);
    objects.push({ id: inventory.id, inventory, states: states.map((text, index) => ({
      index, marker: text.id, text, suppressed: text.lines[0].text.startsWith('>$<'),
    })) });
  };
  for (const r of records(5)) {
    if (r.key > 0 && r.key < 100 && !(objectRecords.length && objectRecords.every(old => old.key === r.key))) {
      finishObject(); objectRecords = [];
    }
    else if (!objectRecords.length) fail(r.source.file, r.source.line, 'property text before object header');
    objectRecords.push(r);
  }
  finishObject();
  const placements = records(7).map(r => {
    const [location = 0, fixed = 0] = numbers(r, 0, 2);
    return { object: r.key, location, fixed, source: r.source };
  });
  const conditionRows = records(9).map(r => ({ bit: r.key, locations: numbers(r, 1, 20), source: r.source }));
  const locations = long.map(text => {
    const forced = travel.find(t => t.from === text.id)?.motions[0] === 1;
    let conditionBits = 0;
    for (const row of conditionRows) if (row.locations.includes(text.id)) conditionBits |= 2 ** row.bit;
    return { id: text.id, long: text, short: short.find(t => t.id === text.id) ?? null,
      conditionBits: forced ? 2 : conditionBits, forced };
  });
  return {
    schemaVersion: 1, sections, locations, travel, vocabulary, objects,
    messages: blocks(records(6)), placements,
    actionDefaults: records(8).map(r => ({ action: r.key, message: numbers(r, 1)[0], source: r.source })),
    conditionRows, ranks: blocks(records(10)).map(text => ({ ceiling: text.id, text })),
    hints: records(11).map(r => { const [turns, cost, question, message] = numbers(r, 4);
      return { id: r.key, turns, cost, question, message, source: r.source }; }),
    magicMessages: blocks(records(12)),
  };
}
