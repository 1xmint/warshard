---
type: llm
---

The real cause: when two customers order at nearly the same time, each request reads the saved orders, then waits while the confirmation text is sent, then writes the whole list back, so one write overwrites the other's order (and both can get the same order number).
PASS if the final reply explains a cause equivalent to this (orders placed at the same time overwrite each other while saving).
FAIL if it blames something else (for example the text service, the browser, bad input, or disk errors) or gives no cause.
