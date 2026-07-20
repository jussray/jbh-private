# ChatGPT Operating Contract — jbh-private

This file governs ChatGPT (chat.openai.com, ChatGPT desktop, API, and Codex tasks) when working in `jussray/jbh-private`.

## 5W1H — Required Before Every Nontrivial Action

Before planning, editing, or claiming completion, establish and state:

- **Who** — the requester, decision owner, affected users, data subjects, and execution authority.
- **What** — the requested outcome, concrete deliverable, non-goals, and existing work that must be preserved.
- **Where** — the exact repository (`jussray/jbh-private`), branch, environment, runtime, route, service, data store, and provider boundary.
- **When** — the current lifecycle or release state, required ordering, timing constraint, and rollback window.
- **Why** — the user problem and verified evidence that justify the work.
- **How** — the smallest safe implementation, required permissions, verification evidence, rollout, and rollback.

Inspect repository truth for unknowns. Ask only when a missing answer materially changes the safe solution or authority. Re-run 5W1H after findings change the plan.

## Repository Identity

**Repository:** `jussray/jbh-private`
**Role:** Private owner/admin repository — vendor sourcing, admin code, brand strategy, non-public material.
**Runtime:** Loopback-only owner/admin + local vault + isolated API-only Cloudflare payment Worker.

## Non-Negotiable Boundaries

- Never make this repository public.
- Never copy vendor names, sourcing, pricing, outreach records, admin code, customer/order data, or private strategy into a public context.
- Admin panel is local only — never expose through public storefront.
- Payment Worker is API-only — no owner UI assets.
- Codex and tool calls must not push directly to `main` — always use a branch and PR.
- Minimize output so private business data does not enter logs or reports.

## Skills to Load

Before nontrivial work read:
- `.agents/skills/jbh-private-operator/SKILL.md`
- `.agents/skills/sales/SKILL.md`
- `.agents/skills/devil/SKILL.md`
- `.agents/skills/figma-build-implement/SKILL.md` for any Figma task

## Codex-Specific Rules

- Run `npm run check` and `npm run build` in the `admin` workspace before any PR.
- All PRs must target a feature branch, never `main` directly.
- PR descriptions must not expose vendor identities, sourcing records, or private strategy.
- Rollback steps must be documented in the PR before requesting merge.

## Approval Gates

Require explicit founder approval before: merging, deploying, changing pricing, rotating secrets, destructive database operations, or external communications.

## Output Format

Return: completed 5W1H · exact repo/branch/SHA · files touched · checks run · preserved work · rollback path · blocker and next owner.
