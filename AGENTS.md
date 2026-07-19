# Agent Instructions

Use these instructions whenever Claude, Codex, ChatGPT, Perplexity, GitHub-connected agents, or other AI coding agents work in this repository.

## Founder operating stack

Use the full founder stack for nontrivial work:

```text
/elonmusk /garyvee lindymode redteam l99 redteam ooda /truthmode
```

`/elonmusk` adds first-principles reduction, bottleneck identification, leverage analysis, and deletion of unnecessary complexity. It does not replace the founder stack. The first redteam attacks the premise. L99 maps provenance, state, release, rollback, and long-term drift. The second redteam attacks the selected implementation.

## Truth hierarchy

1. Current repository, branch, exact commit, and deployed configuration actually inspected.
2. Founder Control Room records, especially release-truth, outage, merge, Cloudflare, and cross-repo evidence.
3. Current test results, Playwright evidence, logs, schemas, runtime behavior, and Cloudflare build/deploy evidence.
4. Explicit founder decisions and approved project records.
5. Current official provider documentation.
6. Prior summaries, memory, generated plans, and assumptions.

Do not claim a file, feature, migration, deployment, fix, test, or merge exists without evidence.

## Infrastructure outage and CI classification

When GitHub Actions fails, classify the evidence before blaming code:

- `runner_startup_failure`: GitHub runner or job startup failed before meaningful steps executed, especially when jobs show no steps, no logs, or null log URLs.
- `workflow_no_jobs`: the workflow itself schedules no jobs or is skipped before jobs exist.
- `workflow_step_failure`: at least one job executed steps and logs show a concrete failing command, assertion, build, lint, type, or Playwright step.

Never call a zero-step/no-log GitHub Actions failure a code regression. Treat it as infrastructure evidence. However, an infrastructure outage can still gate merge, release, and deployment truth under this repo's release rules until Founder Control Room and any available Cloudflare/runtime evidence explain the situation.

## Control Room and Cloudflare release truth

Look to Founder Control Room first for release-truth interpretation. Capture the exact repository, PR, branch, head SHA, workflow, run, job evidence, classification, Cloudflare build status, runtime evidence, and next gate.

Cloudflare build or deploy success is separate from GitHub Actions success. GitHub Actions outage is not application failure, and Cloudflare success is not proof that all app, auth, data, privacy, or Playwright gates passed. Record both without blending them.

## Work completion rule

Continue working the requested task until it is done or until a real blocker is reached. Do not stop at a plan when a focused implementation, verification, or documentation update is available.

Every handoff must state what was changed, what was verified, what remains blocked, and the next gate.

## Playwright verification

For UI, route, browser, release, onboarding, checkout, auth-flow, or runtime behavior changes, verify with Playwright on the exact changed head before calling the task complete. If Playwright is not applicable, say why. If Playwright cannot run because of infrastructure, missing secrets, missing browser dependencies, or a GitHub runner outage, record that as a verification blocker rather than converting it into code blame.

## Merge authority

Agents may merge when the merge is the correct evidence-backed integration step, not merely because a PR exists or a badge looks green.

A merge is safe only when repository, target branch, PR, and exact head SHA are verified; the scope is focused; changed files have been reviewed; required checks have genuinely executed and passed, or a documented infrastructure outage is classified and the remaining evidence is sufficient for the specific change; Playwright has passed for any changed user-facing web/runtime path, or is explicitly inapplicable; Founder Control Room and Cloudflare evidence have been checked when release truth or deployment is involved; no unresolved critical review thread remains; privacy, security, brand/IP, credentials, user data, and project boundaries remain intact; rollback or safe forward-fix is understood; and the merge itself does not silently perform deployment, migration, auth/RLS changes, billing/spending, external publication, destructive deletion, credential movement, or any other separately gated action.

If those conditions are not met, keep working or leave the PR open with the exact blocker.

## Provider roles

- Claude: long-context repo reasoning, focused implementation, refactor planning, and documentation. Read `AGENTS.md` and any local `CLAUDE.md` before acting.
- Codex: code edits, tests, Playwright, CI triage, and repository operations. Keep patches focused and evidence-backed.
- ChatGPT: reasoning, review, debugging, threat modeling, data analysis, and founder-readable decisions. Separate fact, inference, and action.
- Perplexity: current public research and source discovery. It is not private repository, account, Supabase, Cloudflare, or production truth unless those systems are explicitly connected and inspected.

## Separate gates

Do not deploy, roll back production, run destructive migrations, alter auth/RLS, rotate or expose secrets, spend funds, publish externally, send external communications, delete user material, or change production routing without explicit approval for that exact action.

Never delete Ray/Juss material without explicit approval for that specific deletion.
