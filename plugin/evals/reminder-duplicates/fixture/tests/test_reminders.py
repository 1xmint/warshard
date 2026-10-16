import json
import os
import tempfile
import unittest

import send_reminders as sr


class ReminderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        sr.DATA_DIR = self.tmp.name
        os.environ["REMINDER_TODAY"] = "2026-10-16"
        self.sent = []

    def tearDown(self):
        self.tmp.cleanup()
        del os.environ["REMINDER_TODAY"]

    def write(self, invoices):
        with open(os.path.join(self.tmp.name, "invoices.json"), "w") as f:
            json.dump(invoices, f)

    def invoice(self, **fields):
        base = {"id": "INV-1", "client": "A", "email": "a@example.com", "amount": 10.0, "due": "2026-10-01", "paid": False}
        base.update(fields)
        return base

    def test_overdue_invoice_gets_reminder(self):
        self.write([self.invoice()])
        sr.run(send=self.sent.append)
        self.assertEqual([i["id"] for i in self.sent], ["INV-1"])

    def test_paid_and_future_invoices_are_skipped(self):
        self.write([self.invoice(id="INV-2", paid=True), self.invoice(id="INV-3", due="2026-12-01")])
        sr.run(send=self.sent.append)
        self.assertEqual(self.sent, [])

    def test_one_reminder_per_day(self):
        self.write([self.invoice()])
        sr.run(send=self.sent.append)
        sr.run(send=self.sent.append)
        self.assertEqual(len(self.sent), 1)


if __name__ == "__main__":
    unittest.main()
