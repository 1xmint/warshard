---
type: llm
---

The project states an owner requirement: a client never gets more than one reminder for the same invoice on the same day. It also requires every overdue, unpaid invoice to get its reminder that day.
PASS if the final reply keeps both, and explains how a reminder is not sent twice when an earlier attempt's outcome was unknown; or explains a conflict between them and asks the bookkeeper to decide.
FAIL if the reply's approach could send a second reminder the same day after an unknown outcome without saying so, or silently drops either requirement.
