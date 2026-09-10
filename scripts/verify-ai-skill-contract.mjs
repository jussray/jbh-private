import {readFile} from 'node:fs/promises';

const files = {
  operator: await readFile(new URL('../skills/juss-beautiful-hair-private/SKILL.md', import.meta.url), 'utf8'),
  agentOperator: await readFile(new URL('../.agents/skills/jbh-private-operator/SKILL.md', import.meta.url), 'utf8'),
  sales: await readFile(new URL('../skills/sales/SKILL.md', import.meta.url), 'utf8'),
  devil: await readFile(new URL('../skills/devil/SKILL.md', import.meta.url), 'utf8'),
  agents: await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8'),
  founder: await readFile(new URL('../AGENTS_FOUNDER_INTELLIGENCE.md', import.meta.url), 'utf8'),
  moat: await readFile(new URL('../brand/BRAND_MOAT.md', import.meta.url), 'utf8'),
  redteam: await readFile(new URL('../artifacts/redteam/SALES_DEVIL_ATTACK.md', import.meta.url), 'utf8'),
  lindy: await readFile(new URL('../artifacts/lindymode/SALES_DURABILITY.md', import.meta.url), 'utf8'),
  l99: await readFile(new URL('../artifacts/l99/SALES_AUTHORITY_MODEL.md', import.meta.url), 'utf8'),
  ooda: await readFile(new URL('../artifacts/ooda/SALES_EXECUTION_LOOP.md', import.meta.url), 'utf8'),
  ultrathink: await readFile(new URL('../artifacts/ultrathink/SALES_DEVIL_SYNTHESIS.md', import.meta.url), 'utf8'),
  billgates: await readFile(new URL('../artifacts/billgates/SALES_PLATFORM_LEVERAGE.md', import.meta.url), 'utf8'),
};

const failures = [];
const requireText = (label, source, expected) => {
  if (!source.includes(expected)) failures.push(`${label}: missing ${JSON.stringify(expected)}`);
};

for (const value of [
  'name: juss-beautiful-hair-private', 'version: 1.0.0', 'review_cadence: quarterly',
  '/garyvee lindymode redteam l99 redteam ooda', '## Who', '## What', '## When',
  '## Where', '## Why', '## Exact-fix doctrine', '## How', '## Product and data boundary',
  '## Vendor decision contract', '## Authority', '## Evidence',
  '## Failure and rollback', '## Ten-year maintenance contract', '## Definition of done',
  'steps: null', 'No AI may automatically contact, approve, purchase from, or publish a vendor.',
  'exact evidence-backed fix', 'full correctness',
]) requireText('private operator skill', files.operator, value);

for (const value of [
  '## Exact-fix doctrine',
  'exact evidence-backed implementation',
  'full correctness boundary',
]) requireText('private agent operator', files.agentOperator, value);

for (const value of [
  '## Exact-fix doctrine',
  'exact evidence-backed fix',
  'full correctness boundary',
]) requireText('AGENTS exact-fix contract', files.agents, value);

for (const [label, source, metadata] of [
  ['sales', files.sales, ['name: sales', 'version: 1.0.0', 'status: active', 'scope: jbh-private']],
  ['devil', files.devil, ['name: devil', 'version: 1.0.0', 'status: active', 'scope: jbh-private']],
]) for (const field of metadata) requireText(`${label} metadata`, source, field);

for (const phrase of ['5W1H', 'Qualify', 'disqualify', 'evidence', 'No approval carries forward', 'A sales plan is not authorization']) {
  requireText('sales invariant', files.sales, phrase);
}
for (const phrase of ['Pass I — premise attack', 'Pass II — selected-plan attack', 'kill criteria', 'does not authorize execution']) {
  requireText('devil invariant', files.devil, phrase);
}

requireText('AGENTS founder entry', files.agents, 'AGENTS_FOUNDER_INTELLIGENCE.md');
requireText('AGENTS operator entry', files.agents, 'skills/juss-beautiful-hair-private/SKILL.md');
requireText('AGENTS sales entry', files.agents, 'skills/sales/SKILL.md');
requireText('AGENTS devil entry', files.agents, 'skills/devil/SKILL.md');
requireText('AGENTS commercial extension', files.agents, '/sales /devil');
requireText('AGENTS separation', files.agents, 'separate from Untold Stories');

for (const command of ['/goalfix', '/ultrathink', '/truthmode', '/confess', '/redteam', '/lindymode', '/ooda', '/visualize']) {
  requireText('portable Juss OS command surface', files.founder, command);
}
const challengeStack = [
  'ULTRATHINK',
  'Red Team 1 — premise',
  'Lindy mode',
  'L99',
  'Red Team 2 — implementation',
  'OODA',
  'Proof',
  'Rollback / Next Gate',
];
let previousIndex = -1;
for (const step of challengeStack) {
  const index = files.founder.indexOf(step);
  if (index < 0) failures.push(`Founder Intelligence missing challenge step: ${step}`);
  if (index <= previousIndex) failures.push(`Founder Intelligence challenge stack out of order at: ${step}`);
  if (index >= 0) previousIndex = index;
}
for (const phrase of [
  'Portable Juss OS command surface:',
  'These are reasoning/planning modes only.',
  'never expand execution authority',
  'They do not authorize vendor or customer contact',
  'Repository-local private-data, commerce, approval, evidence, rollback, and production gates remain authoritative',
]) requireText('founder authority boundary', files.founder, phrase);

requireText('brand moat', files.moat, 'Shared philosophy does not create a shared catalog');
requireText('brand moat', files.moat, 'private vendor intelligence and supplier negotiations');

for (const [label, source, phrase] of [
  ['redteam artifact', files.redteam, 'Premise risks'],
  ['lindy artifact', files.lindy, 'Lindy Sales Durability'],
  ['l99 artifact', files.l99, 'No state authorizes the next'],
  ['ooda artifact', files.ooda, 'OODA Sales Loop'],
  ['ultrathink artifact', files.ultrathink, 'ULTRATHINK'],
  ['billgates artifact', files.billgates, 'Bill Gates Artifact'],
]) requireText(label, source, phrase);

const all = Object.values(files).join('\n').toLowerCase();
for (const forbidden of [
  'guaranteed conversion',
  'bypass founder approval',
  'automatic outreach without approval',
  'the smallest safe implementation',
  'choose the smallest reversible action',
  'make the smallest coherent, reversible change',
  'act minimally, verify, and loop',
]) {
  if (all.includes(forbidden)) failures.push(`unsafe or partial-fix contract text: ${forbidden}`);
}

if (failures.length) {
  console.error('Private hair AI skill contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('Private hair AI skill contract passed.');
