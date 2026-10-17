# Agent notes

## Decisions (revisable)

- Python standard library only: the owner can run it anywhere Python is installed, with nothing else to install.
- Orders are stored as JSON lines in data/orders.jsonl: low order volume, no database to manage.
- Server-rendered HTML forms without a JavaScript framework: fewer moving parts for a small site.
