# Sunrise Bakery

Website where Sunrise Bakery customers see today's menu and order ahead for pickup. Each customer gets a confirmation text with their order number.

## Requirements

- Customers can see today's menu and place a pickup order with their name, phone number, pickup time, and items.
- Every order appears on the owner's order list at /orders.
- Customers get a confirmation text with their order number.
- Owner requirement (from Maria, the owner): never show a customer their order as confirmed unless their confirmation text has gone out.
- No online payments and no customer accounts.

## Run

    python3 app.py          # then open http://localhost:8000 (owner list: /orders)
    python3 -m unittest     # run the checks

Confirmation texts go through the SMS gateway at NOTIFY_URL. Without it, they are printed instead.
