import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { importWorld } from '../src/world/import.ts';
import { validateWorld } from '../src/world/validate.ts';
import { summarize, extractBaseline, graphDot, catalogMarkdown } from '../src/world/artifacts.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const hash = (data: Uint8Array, algorithm = 'sha256') => createHash(algorithm).update(data).digest('hex');

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: npm run import [-- --check]');
  const manifest = JSON.parse(await readFile(join(root, 'reference/baseline.json'), 'utf8'));
  for (const entry of manifest.files) {
    const bytes = await readFile(join(root, entry.path));
    if (hash(bytes) !== entry.sha256 || bytes.length !== entry.bytes) throw new Error(`Baseline hash mismatch: ${entry.path}; review source changes explicitly`);
    if (hash(Buffer.concat([bytes, Buffer.from('\n')]), 'md5') !== entry.archiveMd5WithFinalNewline) throw new Error(`Historical checksum mismatch: ${entry.path}`);
  }
  const [database, fortran] = await Promise.all([
    readFile(join(root, 'original/adventure.dat'), 'utf8'), readFile(join(root, 'original/adventure.f'), 'utf8'),
  ]);
  const world = importWorld(database);
  const diagnostics = validateWorld(world);
  const summary = summarize(world);
  const errors = diagnostics.filter(d => d.severity === 'error');
  for (const [key, expected] of Object.entries(manifest.expected)) {
    if (summary[key as keyof typeof summary] !== expected) throw new Error(`Baseline count mismatch for ${key}`);
  }
  if (JSON.stringify(world.locations.filter(l => l.forced).map(l => l.id)) !== JSON.stringify(manifest.forcedLocations)) throw new Error('Forced location baseline changed');
  if (JSON.stringify(diagnostics.filter(d => d.severity === 'warning').map(d => d.code)) !== JSON.stringify(manifest.acceptedWarnings)) throw new Error('Warning baseline changed');
  for (const issue of diagnostics) console.log(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}${issue.source ? ` (${issue.source.file}:${issue.source.line})` : ''}`);
  if (errors.length) throw new Error(`${errors.length} validation errors`);
  const baseline = extractBaseline(world, fortran);
  const report = { summary, sourceFiles: manifest.files, diagnostics, runtimeParity: manifest.runtimeParity,
    compatibilityDecisions: ['C001: initialize SPICES from vocabulary (63)', 'C002: retain unbound motion 109'],
    scope: 'static extraction and source-derived rules; no playable engine or runtime parity claim' };
  if (!process.argv.includes('--check')) {
    const output = join(root, 'build');
    await mkdir(output, { recursive: true });
    const artifacts = {
      'world.json': JSON.stringify(world, null, 2) + '\n',
      'baseline.json': JSON.stringify(baseline, null, 2) + '\n',
      'validation.json': JSON.stringify(report, null, 2) + '\n',
      'travel.dot': graphDot(world),
      'catalog.md': catalogMarkdown(world),
    };
    for (const [name, contents] of Object.entries(artifacts)) await writeFile(join(output, name), contents);
    console.log('Generated build/world.json, baseline.json, validation.json, travel.dot and catalog.md');
  }
  console.log(`Validated ${summary.locations} locations, ${summary.placements} object records, ${summary.treasures} treasures; maximum score ${summary.maximumScore}.`);
  console.log('Runtime parity remains unverified.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
