import { readFile } from 'node:fs/promises';
import { importWorld } from '../world/import.ts';
import type { World } from '../world/schema.ts';

export async function loadOriginalWorld(path = 'original/adventure.dat'): Promise<World> {
  return importWorld(await readFile(path, 'utf8'), path);
}
