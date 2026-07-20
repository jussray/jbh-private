# Claude Operating Contract — jbh-private

This file governs Claude (claude.ai chat, Claude Code, and any MCP-connected Claude session) when working in `jussray/jbh-private`.

Project-local rules here are **stricter** than the global contract. They narrow but never weaken the global contract's privacy, security, evidence, approval, and truthfulness requirements.

## 5W1H — Required Before Every Nontrivial Action

Before planning, editing, or claiming completion, establish and state:

- **Who** — the requester, decision owner, affected users, data subjects, and execution authority.
- **What** — the requested outcome, concrete deliverable, non-goals, and existing work that must be preserved.
- **Where** — the exact repository (`jussray/jbh-private`), branch, environment, runtime, route, service, data store, and provider boundary.
- **When** — the current lifecycle or release state, required ordering, timing constraint, and rollback window.
- **Why** — the user problem and verified evidence that justify the work.
- **How** — the smallest safe implementation, required permissions, verification evidence, rollout, and rollback.

Inspect repository and runtime truth for unknowns. Ask only when a missing answer materially changes the safe solution or authority. Re-run 5W1H after red-team/OODA findings change the plan.

## Repository Identity

**Repository:** `jussray/jbh-private`
**Role:** Private backup and owner/admin repository containing vendor sourcing, admin code, brand strategy, and non-public business material.
**Runtime:** Loopback-only owner/admin surface + local vault + isolated API-only Cloudflare payment Worker.

This is a reviewed orientation, not permanent truth. Re-read the current README, branch, recent commits, workflows, and runtime evidence before acting.

## Non-Negotiable Boundaries

- Never make this repository public.
- Never copy vendor names, sourcing files, pricing, outreach records, admin code, customer/order data, or private brand strategy into a public repository or prompt.
- Run the admin panel locally only; do not expose it through the public storefront.
- The payment Worker is API-only — no owner UI assets may be bundled into it.
- Minimize tool output so private business data and credentials do not enter logs or reports.

## Skills to Load

- `.agents/skills/jbh-private-operator/SKILL.md` — 5W1H, identity, proof, rollback
- `.agents/skills/sales/SKILL.md` — offer, sourcing, margin, conversion
- `.agents/skills/devil/SKILL.md` — premise and selected-plan attacks
- `.agents/skills/figma-build-implement/SKILL.md` — for any Figma or design task

## Required Loop

1. Observe exact branch, changed files, existing implementation, data boundaries, and available evidence.
2. Complete 5W1H and identify any authority or safety gap.
3. Red-team the premise, privacy, security, misuse, failure modes, and rollback.
4. Choose the smallest reversible action that preserves existing work.
5. Implement only within the confirmed repository role.
6. Run proportionate checks on the exact head.
7. Report what is proven, what is inferred, what remains blocked, and who owns the next action.

## Approval Gates

Require explicit founder approval before: merging, deploying, changing pricing or billing, rotating secrets, destructive database operations, or sending external communications.

## Output Format

Return: completed 5W1H · exact repo/branch/SHA · files and boundaries touched · executed checks and evidence · preserved work · rollback path · blocker and next owner.
