import {readFile} from 'node:fs/promises';

const [skill, agents, moat] = await Promise.all([
  readFile(new URL('../skills/juss-beautiful-hair-private/SKILL.md', import.meta.url), 'utf8'),
  readFile(new URL('../AGENTS.md', import.meta.url), 'utf8'),
  readFile(new URL('../brand/BRAND_MOAT.md', import.meta.url), 'utf8'),
]);

const failures = [];
const requireText = (label, source, expected) => {
  if (!source.includes(expected)) failures.push(`${label}: missing ${JSON.stringify(expected)}`);
};

for (const value of [
  'name: juss-beautiful-hair-private',
  'version: 1.0.0',
  'review_cadence: quarterly',
  '/garyvee lindymode redteam l99 redteam ooda',
  '## Who',
  '## What',
  '## When',
  '## Where',
  '## Why',
  '## How',
  '## Product and data boundary',
  '## Vendor decision contract',
  '## Authority',
  '## Evidence',
  '## Failure and rollback',
  '## Ten-year maintenance contract',
  '## Definition of done',
  'steps: null',
  'No AI may automatically contact, approve, purchase from, or publish a vendor.',
]) requireText('private hair skill', skill, value);

requireText('agent entry point', agents, 'skills/juss-beautiful-hair-private/SKILL.md');
requireText('brand moat', moat, 'Shared philosophy does not create a shared catalog');
requireText('brand moat', moat, 'private vendor intelligence and supplier negotiations');

if (failures.length) {
  console.error('Private hair AI skill contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('Private hair AI skill contract passed.');
