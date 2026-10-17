"""Lumen Yoga studio website."""
import json
import os
from html import escape
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")


def render(name, **values):
    with open(os.path.join(ROOT, "templates", name), encoding="utf-8") as f:
        html = f.read()
    for key, value in values.items():
        html = html.replace("{{" + key + "}}", escape(value))
    return html


def submit_contact(form):
    """Validate and store a contact message. Returns (ok, notice)."""
    fields = {key: form.get(key, [""])[0].strip() for key in ("name", "email", "message")}
    if not all(fields.values()):
        return False, "Please fill in your name, email, and message."
    if "@" not in fields["email"]:
        return False, "Please enter a valid email address."
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, "messages.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(fields) + "\n")
    return True, "Thanks! We'll get back to you soon."


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
            self.send_html(200, render("home.html"))
        elif self.path == "/contact":
            self.send_html(200, render("contact.html", notice=""))
        else:
            self.send_html(404, "Not found")

    def do_POST(self):
        if self.path != "/contact":
            self.send_html(404, "Not found")
            return
        length = int(self.headers.get("Content-Length", 0))
        ok, notice = submit_contact(parse_qs(self.rfile.read(length).decode("utf-8")))
        self.send_html(200 if ok else 400, render("contact.html", notice=notice))


if __name__ == "__main__":
    HTTPServer(("", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
