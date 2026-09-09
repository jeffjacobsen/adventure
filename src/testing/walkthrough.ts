import { createHash } from 'node:crypto';
import type { World, SourceRef } from '../world/schema.ts';

export interface WalkthroughInput { phase: number; file: string; text: string }
export interface WalkthroughIssue {
  code: 'empty-phase' | 'unknown-word' | 'extra-words';
  message: string; source: SourceRef;
}

/** Candidate command tape, not an executed transcript or a winning-game oracle. */
export function prepareWalkthrough(world: World, inputs: WalkthroughInput[]) {
  const issues: WalkthroughIssue[] = [];
  let sequence = 0;
  const ordered = [...inputs].sort((a, b) => a.phase - b.phase);
  if (ordered.length !== 5 || ordered.some((p, i) => p.phase !== i + 1))
    throw new Error('Expected exactly phases 1–5');
  const phases = ordered.map(input => {
    const commands = input.text.split(/\r?\n/).flatMap((raw, i) => {
      if (!raw.trim()) return [];
      const source = { file: input.file, line: i + 1 };
      const words = raw.trim().toUpperCase().split(/\s+/);
      const tokens = words.slice(0, 2).map(word => word.slice(0, 5));
      if (words.length > 2) issues.push({ code: 'extra-words', source,
        message: 'More than two words: review how the original input routine handles this line.' });
      // SAY accepts arbitrary payload; yes/no is valid only when a question is pending.
      const reply = words.length === 1 && ['Y', 'YES', 'N', 'NO'].includes(words[0]);
      const first = world.vocabulary.find(v => v.word === tokens[0]);
      const isSay = first?.kind === 2 && first.id === 3;
      tokens.forEach((token, index) => {
        if (reply || (isSay && index === 1)) return;
        if (!world.vocabulary.some(v => v.word === token)) issues.push({ code: 'unknown-word', source,
          message: `No vocabulary entry for ${words[index]} (five-character token ${token}).` });
      });
      return [{ sequence: ++sequence, phaseStep: 0, raw, input: raw.trim(), tokens,
        requiresPendingQuestion: reply && !first, source }];
    }).map((command, index) => ({ ...command, phaseStep: index + 1 }));
    if (!commands.length) issues.push({ code: 'empty-phase', source: { file: input.file, line: 1 }, message: `Phase ${input.phase} has no commands.` });
    return { phase: input.phase, file: input.file,
      sha256: createHash('sha256').update(input.text).digest('hex'), commands };
  });
  return {
    formatVersion: 1,
    target: { score: 350, ending: 'successful repository blast' },
    verification: 'not executed; target score is an objective, not an observed result',
    readiness: issues.length ? 'needs revision before replay' : 'needs runtime replay',
    scope: 'Vocabulary screening only; does not verify routes, object presence, questions, puzzles, turn timing or score.',
    randomSeed: null,
    commandCount: sequence,
    phases, issues,
  };
}
