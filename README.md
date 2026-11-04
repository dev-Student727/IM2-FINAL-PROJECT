# MRB-POS

MRB-POS is a browser-based point-of-sale and inventory application. The Flask
API uses the existing XAMPP MariaDB/MySQL database as the source of truth for
products, stock, sales, customer debts, payment history, reports, and settings.

## Database setup

1. Start Apache and MySQL in the XAMPP Control Panel.
2. Open phpMyAdmin at `http://127.0.0.1/phpmyadmin/` and select the existing
   `pos` database.
3. Back up the database before changing its structure or data: open the
   database's **Export** tab, choose **Quick** and **SQL**, then click **Export**
   and save the downloaded `.sql` file somewhere safe.
4. Open the **Import** tab for the `pos` database. Choose
   [`src/database/pos_feature_migration.sql`](src/database/pos_feature_migration.sql)
   from this project, keep the format set to **SQL**, and click **Import** or
   **Go**. The script starts with `USE \`pos\`;`, so confirm the selected database
   is the intended one before running it.
5. Wait for phpMyAdmin's success message. On the database's **Structure** tab,
   verify the new columns and support tables are present. The migration is
   intended for MariaDB (the XAMPP version tested here is 10.4.32); it adds
   feature columns/tables and changes amount columns to store cents. It does
   not drop tables, but it does update existing payment-status data.
6. If phpMyAdmin displays an error, do not guess at edits or switch databases.
   Copy the complete error and the SQL statement shown as failing so the
   migration can be diagnosed safely.

## Run the backend

Use Python 3.10 or later. Install the backend packages from the repository root:

```powershell
py -3.10 -m pip install -r src\backend\requirements.txt
```

The local `src/backend/.env` file contains the XAMPP connection settings and is
ignored by Git. Update it if your MySQL user, password, database, or port differs.
Flask creates a local, ignored secret-key file on its first start if
`FLASK_SECRET_KEY` is not set; that stable key keeps remembered sessions valid
across backend restarts. If you set `FLASK_SECRET_KEY` yourself, reuse the same
value each time you start Flask.

```powershell
py -3.10 src\backend\app.py
```

The VS Code workspace task starts the backend automatically when the project
opens. It waits for XAMPP MariaDB, verifies the database connection, then starts
Flask. Approve automatic tasks when VS Code prompts the first time. You can also
run `src\backend\start-local.ps1` manually from PowerShell. The API listens on
`http://127.0.0.1:5000`. Check
`http://127.0.0.1:5000/api/health` for the process status. Database-backed
requests also require the migration and a reachable XAMPP database.

## Deploying the frontend to Vercel and backend to Render

1. In Vercel, set **Root Directory** to `src/frontend` and the framework
   preset to **Other**. The frontend is static HTML/CSS/JavaScript and needs no
   Vercel environment variables. `src/frontend/js/api-config.js` routes local
   development to Flask on port 5000 and deployed sites to the Render API.
2. In Render's backend service environment, set:
   - `FLASK_SECRET_KEY`: a persistent random secret. Generate it locally with
     `py -c "import secrets; print(secrets.token_urlsafe(48))"` and keep it
     private and unchanged across deployments.
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`: credentials
     for a hosted MySQL-compatible database. Local XAMPP at `127.0.0.1` is not
     reachable by Render.
   - `CORS_ALLOWED_ORIGINS`: the exact Vercel site origin, with no path or
     trailing slash. Add production/custom domains as comma-separated origins.
   - `SESSION_COOKIE_SAMESITE=None` and `SESSION_COOKIE_SECURE=true` so browser
     login sessions can be sent from the Vercel site to the Render API.
3. Back up the hosted database and apply `src/database/pos_feature_migration.sql`
   to it. Never put database credentials or `FLASK_SECRET_KEY` in Vercel's
   frontend variables or in GitHub.
4. Verify the backend at `/api/health`, then redeploy the Vercel frontend after
   committing and pushing frontend changes.

## Run the frontend

Open the frontend with VS Code Live Server using port `5500` and visit
`src/frontend/index.html`. The API allows requests from `localhost:5500` and
`127.0.0.1:5500`. Keep the Flask terminal and XAMPP MySQL service running while
using the application.

The welcome page checks for accounts in MySQL. Signup stores passwords as
Werkzeug hashes and signs the new account in; login verifies the stored hash
and uses an HTTP-only session cookie. The API requires a signed-in session for
POS, product, debt, report, and settings requests. Keep the frontend and API on
the same loopback hostname (`localhost` or `127.0.0.1`) so the session cookie
can be sent with API requests. “Remember Me” keeps the signed-in session for up
to 30 days; without it, the session cookie expires when the browser session
ends. When “Remember login on this device” is checked, the login page can save
and retrieve the credentials through the browser's password manager. Credentials
are not stored by the application in localStorage, sessionStorage, or MySQL.
Leaving it unchecked clears the login fields and does not request credential
storage. Use the main-system Log out button to clear the server session.

## POS workflows

- Products and stock are loaded from MySQL. Product changes and archive actions
  are sent to Flask; archived products are hidden from the catalog but remain
  available to historical transactions.
- POS checkout locks inventory rows and writes the transaction, line items,
  stock reduction, and any debt record in one database transaction.
- Repeated debts for the same customer identity (contact number when entered,
  otherwise normalized customer name) update the existing balance and retain
  each sale grouped by its transaction date.
- Partial/full debt payments are recorded in payment history. Fully paid debts
  no longer show the payment action. Debt deletion is a soft archive; sales and
  payment history are retained.
- Dashboard, sales report, and history filters read from the database.
- Settings can be saved and all product, transaction, and debt data can be
  exported as JSON or CSV. Import is not offered.

The POS records operator transactions under a generated `POS-SYSTEM` user row
when that configured user ID does not already exist. Set `POS_USER_ID` before
starting Flask to use a different operator ID.

## Current limitations

The API is intended for local development and does not provide HTTPS,
multi-factor authentication, account recovery, or production deployment
hardening. Do not expose the development server or database to the public
internet.

Products that existed only in browser `localStorage` are not copied to MySQL
automatically. They remain in that browser's site data, but the revised POS no
longer reads them; add the products to the MySQL-backed catalog before checkout.
