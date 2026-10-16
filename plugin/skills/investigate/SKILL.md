---
name: investigate
description: Use when diagnosing a reported problem in an existing project, such as "X sometimes goes wrong", "find out why Y", or something going missing, duplicated, or failing intermittently, especially when saved data, other services, or timing are involved. Not needed for an obvious, local fix.
---

# Investigating a reported problem

Apply the Keel principles already in context. Scale this to the problem. When the cause is obvious and local, fix it and verify it. Use the rest when the complaint is intermittent, involves stored data or another system, or the first explanation might not be the only one.

## The complaint is the target
Finding one cause is not the same as resolving what the user reported. Once you have a cause, ask whether the user could still see exactly what they described, and look for other paths to the same symptom before calling it fixed.

## Trace what changes
Follow the user's action through every effect it has. Note:
- what is read and written, and in what order
- what is sent to other systems
- what happens when work overlaps, stops partway, or runs again

## Calls to other systems can have unknown outcomes
For each call that has an effect elsewhere (sending, charging, booking, uploading), consider three outcomes:
- **Success.**
- **Definite failure:** nothing happened.
- **Unknown:** a timeout, dropped connection, or crash after sending. The effect may have happened.

For each outcome, decide what is stored and what the user or caller is told. Make the message, the response status, and the stored state say the same thing. Consider what happens when someone repeats the action after an uncertain answer, such as resubmitting a form or rerunning a job. Make that safe, or say plainly that it is not covered.

Prefer designs that make another attempt safe over treating every error as "nothing happened". Examples are stable identifiers, idempotent requests the service supports, and recording that an attempt is pending.

Check each stated requirement against every outcome, including rare ones. When one would not hold, work out which of these it is:
- **A defect in the design.** Another design can satisfy every requirement, so find and use it.
- **Missing evidence.** You don't yet know what a service or system can do. Check its documentation or behavior. If that cannot settle it, say what is unknown and what would settle it.
- **A demonstrated incompatibility.** Established facts show that no feasible design satisfies every requirement.

Only the last is a conflict between requirements, and only after the feasible alternatives have been examined. Then:
- Propose the compromise and its consequences.
- Ask before adopting it. Do not implement a behavior that breaks a stated requirement on your own.
- Meanwhile, finish the work that does not depend on the decision.

## Exercise the paths connected to the complaint
Test the failure paths that could produce the reported symptom, such as:
- concurrent use
- the other system rejecting a request, or responding slowly or not at all
- partial runs and repeated runs
- bad data

Where practical, add a regression check and show that it fails on the original code. Reproducing before editing is not required when the diagnosis is well supported.

## Report coverage honestly
Report:
- which causes you found and fixed
- which paths you exercised and how
- what remains possible or unverified
- what the user should watch for

Do not say the problem is solved when only part of it has been demonstrated.
