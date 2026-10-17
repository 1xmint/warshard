import tempfile
import unittest

import app


class OrderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        app.DATA_DIR = self.tmp.name
        self.texts = []

    def tearDown(self):
        self.tmp.cleanup()

    def order(self, **fields):
        form = {"name": ["Ana"], "phone": ["555-0100"], "pickup": ["9:00"], "croissant": ["2"]}
        form.update({k: [v] for k, v in fields.items()})
        return app.place_order(form, notify=self.texts.append)

    def test_menu_lists_items(self):
        html = app.menu_page()
        for name, _ in app.MENU.values():
            self.assertIn(name, html)

    def test_order_is_saved_and_listed(self):
        ok, message = self.order()
        self.assertTrue(ok)
        self.assertIn("#1", message)
        self.assertEqual(app.load_orders()[0]["items"], {"croissant": 2})
        self.assertIn("Ana", app.orders_page())

    def test_customer_gets_a_text(self):
        self.order(name="Ben")
        self.assertEqual([t["name"] for t in self.texts], ["Ben"])

    def test_orders_are_numbered(self):
        self.order(name="Ana")
        ok, message = self.order(name="Ben")
        self.assertIn("#2", message)

    def test_order_requires_contact_and_items(self):
        self.assertFalse(self.order(phone="")[0])
        self.assertFalse(self.order(croissant="0")[0])
        self.assertEqual(app.load_orders(), [])


if __name__ == "__main__":
    unittest.main()
