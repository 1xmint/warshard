# Agent notes

## Owner requirements

- Owner requirement (from Dana, the bookkeeper): a client never gets more than one reminder for the same invoice on the same day.

## Decisions (revisable)

- Python standard library only, run by the system scheduler once an hour.
- Invoices live in data/invoices.json, maintained by hand by Dana.
