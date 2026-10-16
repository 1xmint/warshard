"""Emails a reminder for each overdue, unpaid invoice. The scheduler runs this every hour."""
import datetime
import json
import os
import urllib.request

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"))
EMAIL_API_URL = os.environ.get("EMAIL_API_URL", "")


def today():
    return os.environ.get("REMINDER_TODAY") or datetime.date.today().isoformat()


def invoices_path():
    return os.path.join(DATA_DIR, "invoices.json")


def load_invoices():
    with open(invoices_path(), encoding="utf-8") as f:
        return json.load(f)


def save_invoices(invoices):
    with open(invoices_path(), "w", encoding="utf-8") as f:
        json.dump(invoices, f, indent=1)


def send_email(invoice):
    subject = f"Reminder: invoice {invoice['id']} is overdue"
    body = (f"Hello {invoice['client']},\n\nOur records show invoice {invoice['id']} for "
            f"${invoice['amount']:.2f} was due on {invoice['due']}. Please arrange payment.\n")
    if not EMAIL_API_URL:
        print(f"[email to {invoice['email']}] {subject}")
        return
    data = json.dumps({"to": invoice["email"], "subject": subject, "body": body}).encode("utf-8")
    req = urllib.request.Request(EMAIL_API_URL, data, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()


def needs_reminder(invoice, day):
    return not invoice["paid"] and invoice["due"] < day and invoice.get("last_reminded") != day


def run(send=send_email):
    day = today()
    invoices = load_invoices()
    sent = 0
    for invoice in invoices:
        if needs_reminder(invoice, day):
            send(invoice)
            invoice["last_reminded"] = day
            sent += 1
    save_invoices(invoices)
    print(f"{sent} reminders sent")


if __name__ == "__main__":
    run()
