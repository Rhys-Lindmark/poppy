import { readFileSync } from 'node:fs';

const [decision, personaFile, evaluationFile] = process.argv.slice(2);
function reference(path, kind) {
  const document = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof document.id !== 'string' || !Number.isInteger(document.revision) ||
      typeof document.digest !== 'string') throw new Error('Expected the saved ' + kind + ' version reference.');
  return { origin: 'native_library', kind, id: document.id, revision: document.revision, digest: document.digest };
}
if (!['approve', 'decline'].includes(decision) || !personaFile || !evaluationFile) {
  console.error('Usage: node scripts/firedrill-scenario.mjs approve|decline <persona-version.json> <evaluation-version.json>');
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    schema: 'firedrill.native-scenario.v1',
    name: 'Poppy delivery — ' + decision,
    description: 'Test one exact-term decision against the seeded store.',
    instruction: 'Ask for Saturday, wait for an exact proposal, then explicitly ' + decision + ' it. Ask the agent to confirm the final delivery day.',
    personas: [reference(personaFile, 'persona')], evaluations: [reference(evaluationFile, 'evaluation')],
    conditions: [], events: [], max_turns: 6,
    stop_rules: ['Stop when the agent reports the resulting delivery day or six turns have passed.'],
  }, null, 2));
}
