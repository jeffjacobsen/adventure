/** Schema v1: ordered, source-backed data; no rendering or mutable game state. */
export interface SourceRef { file: string; line: number }
export interface RecordLine { key: number; value: string; source: SourceRef; raw: string }
export interface Section { id: number; source: SourceRef; records: RecordLine[] }
export interface TextBlock { id: number; lines: { text: string; source: SourceRef }[] }
export type Condition =
  | { kind: 'always' }
  | { kind: 'chance'; percent: number }
  | { kind: 'playerOnly' }
  | { kind: 'carrying'; object: number }
  | { kind: 'present'; object: number }
  | { kind: 'propertyNot'; object: number; value: number };
export type Outcome =
  | { kind: 'location'; location: number }
  | { kind: 'death' }
  | { kind: 'special'; handler: number }
  | { kind: 'message'; message: number };
export interface TravelRule {
  id: string; from: number; encodedDestination: number; motions: number[];
  condition: Condition; outcome: Outcome; fallback: string | null; source: SourceRef;
}
export interface Vocabulary { code: number; kind: number; id: number; word: string; source: SourceRef }
export interface ObjectDescription {
  id: number; inventory: TextBlock;
  states: { index: number; marker: number; text: TextBlock; suppressed: boolean }[];
}
export interface Placement { object: number; location: number; fixed: number; source: SourceRef }
export interface Hint { id: number; turns: number; cost: number; question: number; message: number; source: SourceRef }
export interface World {
  schemaVersion: 1;
  sections: Section[];
  locations: { id: number; long: TextBlock; short: TextBlock | null; conditionBits: number; forced: boolean }[];
  travel: TravelRule[];
  vocabulary: Vocabulary[];
  objects: ObjectDescription[];
  messages: TextBlock[];
  placements: Placement[];
  actionDefaults: { action: number; message: number; source: SourceRef }[];
  conditionRows: { bit: number; locations: number[]; source: SourceRef }[];
  ranks: { ceiling: number; text: TextBlock }[];
  hints: Hint[];
  magicMessages: TextBlock[];
}
export interface Diagnostic { severity: 'error' | 'warning'; code: string; message: string; source?: SourceRef }
