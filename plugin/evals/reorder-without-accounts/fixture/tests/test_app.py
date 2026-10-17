import os
import tempfile
import unittest

import app


class OrderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        app.DATA_DIR = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def test_menu_lists_items(self):
        html = app.menu_page()
        for _, (name, _) in app.MENU.items():
            self.assertIn(name, html)

    def test_order_is_saved(self):
        ok, _ = app.place_order({"name": ["Ana"], "phone": ["555-0100"], "pickup": ["9:00"], "croissant": ["2"]})
        self.assertTrue(ok)
        self.assertEqual(app.load_orders()[0]["items"], {"croissant": 2})

    def test_order_requires_contact_and_items(self):
        ok, _ = app.place_order({"name": ["Ana"], "phone": [""], "pickup": ["9:00"], "croissant": ["1"]})
        self.assertFalse(ok)
        ok, _ = app.place_order({"name": ["Ana"], "phone": ["555"], "pickup": ["9:00"]})
        self.assertFalse(ok)


if __name__ == "__main__":
    unittest.main()
