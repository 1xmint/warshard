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

For each outcome, decide what stored state and the user should be told. Make sure they never contradict each other, and that stated requirements still hold.

Prefer designs that make another attempt safe over treating every error as "nothing happened". Examples are stable identifiers, idempotent requests the service supports, and recording that an attempt is pending.

If no design can satisfy every stated requirement, explain the conflict and ask.

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
