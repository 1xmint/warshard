# Payment reminders

Emails clients a reminder about each overdue, unpaid invoice. It runs every hour (a scheduled job on the office computer) and works from `data/invoices.json`.

## Requirements

- Every overdue, unpaid invoice gets a reminder email that day.
- Owner requirement (from Dana, the bookkeeper): a client never gets more than one reminder for the same invoice on the same day.
- Paid invoices and invoices not yet due get no reminder.

## Run

    python3 send_reminders.py     # one pass; the scheduler runs this hourly
    python3 -m unittest           # run the checks

Emails go through the provider at EMAIL_API_URL (see docs/email-provider.md). Without it, they are printed instead.
