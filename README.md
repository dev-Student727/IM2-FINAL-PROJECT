# MRB-POS

MRB-POS is a web-based point-of-sale and inventory interface for a micro retail
business. It is designed to help a cashier prepare a customer order, calculate
the amount due, record a payment type, and provide a receipt. The frontend is
intended for desktop and mobile screens.

## What the system is for

The system's intended use is to support everyday small-store sales workflows:

- View products and their displayed prices and stock.
- Add products to an order and adjust or remove quantities.
- Calculate the order subtotal and total.
- Complete a full payment, record a sale as customer debt (Utang), or enter a
  partial down payment.
- Show change or remaining balance where applicable.
- Display, print, or download a custom PDF receipt after checkout.

## Current functionality

The Point of Sales page at `src/frontend/pages/funnel/pos.html` is the current
interactive workflow:

- Product cards are currently hard-coded in the HTML.
- Selecting a card adds that product to the in-memory order. Quantity controls
  enforce the displayed stock limit.
- Checkout validates required customer and payment values and calculates totals,
  change, and remaining balance.
- Completing checkout clears the current order, updates the displayed stock for
  the current page session, and opens a receipt.
- The receipt uses the MRB-POS name from the page branding. It can be closed,
  printed, or downloaded as a PDF.

Other pages include the dashboard, product, sales, debts, login, and signup
interfaces. Some of these are currently presentation or in-progress screens;
their presence does not mean the corresponding data workflows are connected.

## Development status and limitations

Frontend-to-backend and backend-to-database integrations are disconnected while
the backend is being revised.

- Product data and stock are static/demo values. Cart and stock changes exist
  only in page memory and reset when the page is reloaded.
- Completed sales, customer debts, and receipts are not saved to a database.
  The generated PDF can be downloaded, but the application does not retain
  sales history.
- Login and signup are UI-only and do not authenticate users or save accounts.
- Product search and category controls are displayed but are not currently
  connected to filtering behavior.
- `src/backend/app.py` is an empty Flask shell with no API routes or database
  connection.
- The existing XAMPP database, schema, and records have not been changed.
- The npm `test` script is a placeholder and does not run an application test
  suite.

Do not use the current demo checkout as a production payment or inventory
system. Reliable sales, debt, and stock records require backend persistence and
appropriate transaction handling.

## Run the frontend

Open `src/frontend/index.html` using a static development server such as the
VS Code Live Server extension. Navigate to the Point of Sales page to try the
current cart and checkout flow.

The frontend does not require an npm install for its current behavior. Some
fonts and icons are loaded from external CDNs and may require an internet
connection.

## Backend shell

From the repository root, the currently empty Flask shell can be started with:

```powershell
py -3.10 src\backend\app.py
```

It intentionally exposes no application API endpoints; starting it does not
connect the frontend to a database.
