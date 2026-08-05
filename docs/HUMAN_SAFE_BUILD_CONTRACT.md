# Human-Safe Build Contract

This repository serves the human operating Juss Beautiful Hair. Owner-only software must be as clear under failure as it is under success.

## Core rule

A user-facing admin screen, order workflow, route gate, fulfillment step, or control surface must not resolve to silence when the system knows enough to show a state.

Do not use `return null` for loading, error, empty, denied, offline, unavailable, recovery, or transitional states that can block understanding or action.

## Required operator states

Every owner-facing flow must provide the applicable state with clear language and an honest next action:

- loading or checking;
- success;
- empty;
- denied or permission-limited;
- offline or degraded;
- error;
- recovery, retry, back, support, or safe exit.

Never imply that an order, payment, vendor handoff, fulfillment action, or customer record is complete when evidence is missing.

## Where `null` remains valid

`null` may remain in data, parser, service, storage, cache, webhook, and optional-value contracts when it explicitly means `not found`, `not configured`, or `not applicable`.

That contract must be typed or tested. A human-facing caller must translate it into a visible state whenever the absence affects comprehension, trust, privacy, money, fulfillment, or the next action.

Optional decorative elements may render nothing only when their absence cannot hide progress, failure, denial, important data, or a required action.

## Safe implementation loop

### Observe

Inspect the active route, component, caller, exact branch head, existing tests, and rendered behavior. Distinguish a valid data sentinel from a blank-screen defect.

### Orient

Red-team missing configuration, denied access, stale sessions, empty orders, malformed webhooks, duplicate payments, vendor failures, network loss, and mobile layouts.

### Decide

Choose the smallest proven repair. Prefer platform primitives and existing components. Do not add a dependency when plain React, browser, Worker, database, or server behavior is sufficient.

### Act

Render the missing state, preserve customer privacy and owner-only boundaries, add a focused regression test, and run the exact applicable proof gates.

## Proof requirements

- Unit or source-contract proof for the state decision.
- Type and build proof where applicable.
- Playwright proof for changed admin behavior.
- Exact-head CI evidence before merge.

A screenshot, design mock, or green unrelated workflow is not runtime proof.

## Red-team constraints

Never replace `null` mechanically across a repository. Blind replacement can expose customer data, weaken denied states, invent false order status, or break optional contracts.

Never hide an error merely to avoid a blank screen. Show the truthful state and the safest available next action.

## Definition of done

The change is complete when the operator can tell:

1. what the system is doing;
2. what happened;
3. whether customer data, money, and fulfillment are safe;
4. what action is available next;
5. how to recover when recovery is possible.

Build the smallest safe thing, prove it at the exact head, and leave no human staring into an empty frame.
