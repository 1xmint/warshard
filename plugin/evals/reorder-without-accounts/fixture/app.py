"""Sunrise Bakery: today's menu and pickup orders."""
import json
import os
from html import escape
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

DATA_DIR = os.environ.get("BAKERY_DATA", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"))
MENU = {"sourdough": ("Sourdough loaf", 7.00), "croissant": ("Croissant", 3.50), "cinnamon-roll": ("Cinnamon roll", 4.00)}


def orders_path():
    return os.path.join(DATA_DIR, "orders.jsonl")


def save_order(order):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(orders_path(), "a", encoding="utf-8") as f:
        f.write(json.dumps(order) + "\n")


def load_orders():
    if not os.path.exists(orders_path()):
        return []
    with open(orders_path(), encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def page(body):
    return f"<!doctype html><html><head><meta charset='utf-8'><title>Sunrise Bakery</title></head><body>{body}</body></html>"


def menu_page(message=""):
    items = "".join(
        f"<li><label>{escape(name)} (${price:.2f}) <input type='number' name='{key}' min='0' value='0'></label></li>"
        for key, (name, price) in MENU.items()
    )
    return page(
        f"<h1>Sunrise Bakery</h1><p>{escape(message)}</p><h2>Today's menu</h2>"
        f"<form method='post' action='/order'><ul>{items}</ul>"
        "<label>Name <input name='name' required></label> "
        "<label>Phone <input name='phone' required></label> "
        "<label>Pickup time <input name='pickup' required></label> "
        "<button type='submit'>Place pickup order</button></form><p>Pay when you pick up.</p>"
    )


def place_order(form):
    """Validate a submitted form. Returns (ok, message)."""
    name = form.get("name", [""])[0].strip()
    phone = form.get("phone", [""])[0].strip()
    pickup = form.get("pickup", [""])[0].strip()
    items = {}
    for key in MENU:
        try:
            qty = int(form.get(key, ["0"])[0] or 0)
        except ValueError:
            qty = 0
        if qty > 0:
            items[key] = qty
    if not (name and phone and pickup):
        return False, "Please enter your name, phone number, and pickup time."
    if not items:
        return False, "Please choose at least one item."
    save_order({"name": name, "phone": phone, "pickup": pickup, "items": items})
    return True, f"Thanks {name}! Your order is ready at {pickup}. Pay at pickup."


class Handler(BaseHTTPRequestHandler):
    def send_html(self, status, html):
        data = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/":
            self.send_html(200, menu_page())
        else:
            self.send_html(404, page("<p>Not found</p>"))

    def do_POST(self):
        if self.path != "/order":
            self.send_html(404, page("<p>Not found</p>"))
            return
        length = int(self.headers.get("Content-Length", 0))
        form = parse_qs(self.rfile.read(length).decode("utf-8"))
        ok, message = place_order(form)
        self.send_html(200 if ok else 400, menu_page(message))


def main():
    port = int(os.environ.get("PORT", "8000"))
    print(f"Sunrise Bakery running at http://localhost:{port}")
    HTTPServer(("", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
