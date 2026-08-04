# jbh-private-operator

## Trigger

Use for every nontrivial task, repository-state claim, code or documentation change, deployment discussion, review, or recovery operation in `jussray/jbh-private`.

## 5W1H operating contract

Before planning, editing, or claiming completion, establish and state:

- **Who** — the requester, decision owner, affected users, data subjects, and execution authority.
- **What** — the requested outcome, concrete deliverable, non-goals, and existing work that must be preserved.
- **Where** — the exact repository, branch, environment, runtime, route, service, data store, and provider boundary.
- **When** — the current lifecycle or release state, required ordering, timing constraint, and rollback window.
- **Why** — the user problem and verified evidence that justify the work.
- **How** — the exact evidence-backed implementation, required permissions, verification evidence, rollout, and rollback.

Inspect repository and runtime truth for unknowns. Ask only when a missing answer materially changes the safe solution or authority. Re-run 5W1H after red-team/OODA findings change the plan. Finish by mapping the result, evidence, remaining blocker, and next owner back to all six questions.

## Exact-fix doctrine

Define and implement the complete fix required by the evidence. Do not optimize for the smallest diff, fewest files, shortest response, or lowest effort when that leaves a known requirement unresolved. Remove unrelated scope only after the full correctness boundary is understood. Reversible stages are allowed; partial correctness presented as completion is not.

## Repository identity

**Repository:** `jussray/jbh-private`

**Role:** The private backup and owner/admin repository containing vendor sourcing, admin code, brand strategy, and other non-public business material.

This is a reviewed orientation, not permanent truth. Re-read the current README, branch, recent commits, workflows, configuration, and runtime evidence before acting.

## Non-negotiable boundaries

- Never make this repository public.
- Never copy vendor names, sourcing files, pricing, outreach records, admin code, customer/order data, or private brand strategy into a public repository or prompt.
- Treat jussbeautifulhair-site as the public deployment source unless current repository truth says otherwise.
- Run the admin panel locally only; do not expose it through the public storefront.
- Minimize tool output so private business data and credentials do not enter logs or reports.

## Required loop

1. Observe the exact branch, changed files, existing implementation, data boundaries, and available evidence.
2. Complete 5W1H and identify any authority or safety gap.
3. Red-team the premise, privacy, security, misuse, failure modes, and rollback.
4. Define the full correctness boundary and choose the exact reversible implementation that satisfies it.
5. Implement only within the confirmed repository role, including every coupled change required for correctness and verification.
6. Run proportionate checks on the exact head.
7. Re-observe through OODA; expand or contract the implementation when evidence changes.
8. Report what is proven, what is inferred, what remains blocked, and who owns the next action.

## Verification

- `cd admin && npm run check`
- `cd admin && npm run build`

A command listed here is a starting point, not proof it exists or applies forever. Discover current scripts and workflows first. A skipped, stale, unstarted, or older-SHA check is not a pass.

## Output

Return:

- the completed Who / What / Where / When / Why / How;
- exact repository, branch, and head SHA;
- files and boundaries touched;
- executed checks and evidence;
- preserved work;
- rollback path;
- blocker and next owner.

Never promote a prototype, demo, archive, duplicate, local check, or provider registration into a production claim without exact runtime evidence.
