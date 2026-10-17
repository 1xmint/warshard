import json
import os
import tempfile
import unittest

import app


class ContactTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        app.DATA_DIR = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def stored(self):
        with open(os.path.join(self.tmp.name, "messages.jsonl"), encoding="utf-8") as f:
            return [json.loads(line) for line in f]

    def test_valid_message_is_stored(self):
        ok, _ = app.submit_contact({"name": ["Kai"], "email": ["kai@example.com"], "message": ["Hello"]})
        self.assertTrue(ok)
        self.assertEqual(self.stored()[0]["name"], "Kai")

    def test_missing_fields_rejected(self):
        ok, _ = app.submit_contact({"name": ["Kai"], "email": [""], "message": ["Hello"]})
        self.assertFalse(ok)

    def test_contact_page_has_form(self):
        self.assertIn("<form", app.render("contact.html", notice=""))


if __name__ == "__main__":
    unittest.main()
