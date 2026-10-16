# Agent notes

## Decisions (revisable)

- Python standard library only: the owner can run it anywhere Python is installed.
- Orders are kept in data/orders.json: low order volume, no database to manage.
- The SMS gateway is called during the order request, so the customer's page only confirms once the text has been handed off.
