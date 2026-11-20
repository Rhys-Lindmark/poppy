import { run } from 'node:test';
import { fileURLToPath } from 'node:url';
import interoperability from '../data/interop-evidence.json' with { type: 'json' };
import storefronts from '../data/storefront-results.json' with { type: 'json' };

const file = fileURLToPath(new URL('../test/sandbox.test.mjs', import.meta.url));
const checks = [];
for await (const event of run({ files: [file], concurrency: false })) {
  if (!['test:pass', 'test:fail'].includes(event.type) || event.data.name === file) continue;
  checks.push({
    check: event.data.name,
    outcome: event.type === 'test:pass' ? 'pass' : 'fail',
    ...(event.type === 'test:fail' ? { evidence: event.data.details.error.message } : {}),
  });
}
const passed = checks.length > 0 && checks.every(({ outcome }) => outcome === 'pass');
console.log(JSON.stringify({
  protocol_version: '1.0',
  extensions: { operations: '3' },
  agent: 'Bundled Personal Agent',
  store: 'Demo Store',
  environment: 'local HTTPS sandbox',
  outcome: passed ? 'pass' : 'fail',
  checks,
  interoperability,
  storefronts,
}, null, 2));
if (!passed) process.exitCode = 1;
