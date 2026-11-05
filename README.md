# MRB-POS

MRB-POS is a browser-based point-of-sale and inventory application. The current
frontend stores accounts, products, sales, debts, and settings in the browser's
local storage. Each browser/device has a separate data copy; data is not shared
or synchronized between devices. The Flask/XAMPP API documented below is an
optional legacy server mode and is not used by the current frontend.

## Browser-only mode

Open the frontend over HTTPS (for example, GitHub Pages) or localhost. Create
an account separately in each browser that will use the POS. Its data stays in
that browser even if the device is offline, but clearing browser site data can
delete it. Browser storage is not encrypted and is not appropriate for
sensitive production records.

In **Settings → Data backup**, use **Export JSON backup** regularly. To move or
restore POS records on another browser, choose that JSON file under **Restore
browser backup**, then click **Restore backup**. Restoring replaces that
browser's products, transactions, debts, and preferences; it does not transfer
accounts or login. The CSV export is for viewing/reporting, not restoration.

The browser JSON backup is not a MySQL SQL dump and cannot be imported directly
through phpMyAdmin. XAMPP is separate and is not updated by browser changes;
continue to back it up independently if you keep using it.

## XAMPP database (optional legacy backend)

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

## Run the frontend locally

From the repository root, serve the frontend:

```powershell
py -m http.server 5503 --bind 127.0.0.1 --directory src\frontend
```

Open `http://127.0.0.1:5503/`. No Flask server or XAMPP connection is required
for browser-only mode. On GitHub Pages, the same browser-only behavior works
over HTTPS, but each device/browser still has its own separate local data.

## Run the legacy backend

Use Python 3.10 or later. Install the backend packages from the repository root:

```powershell
py -3.10 -m pip install -r src\backend\requirements.txt
```

Set the connection settings in the same PowerShell window where Flask is
started. Replace the user/password values with the credentials for your local
XAMPP installation. Flask creates a local, ignored secret-key file on its first
start if `FLASK_SECRET_KEY` is not set; that stable key keeps remembered sessions
valid across backend restarts. If you set `FLASK_SECRET_KEY` yourself, reuse the
same value each time you start Flask.

```powershell
$env:DB_HOST = "127.0.0.1"
$env:DB_PORT = "3306"
$env:DB_USER = "root"
$env:DB_PASSWORD = ""
$env:DB_NAME = "pos"
py -3.10 src\backend\app.py
```

The API listens on `http://127.0.0.1:5000`. Check
`http://127.0.0.1:5000/api/health` for the process status. Database-backed
requests also require the migration and a reachable XAMPP database.

The Flask API remains available for an alternative server-backed setup, but
the current browser-only frontend does not call it. If deploying the backend
separately, it needs a remotely reachable MySQL-compatible database; XAMPP at
`127.0.0.1` on your PC cannot be reached by a cloud service. Keep database
credentials and `FLASK_SECRET_KEY` out of Git and frontend code.

## POS workflows

- Products, stock, sales, debts, and settings are stored in the current
  browser's local storage. Archived products remain in historical transaction
  details.
- POS checkout updates local inventory and records the sale and any debt in the
  browser.
- Repeated debts for the same customer identity (contact number when entered,
  otherwise normalized customer name) update the existing balance and retain
  each sale grouped by its transaction date.
- Partial/full debt payments are recorded in payment history. Fully paid debts
  no longer show the payment action. Debt deletion is a soft archive; sales and
  payment history are retained.
- Dashboard, sales report, and history filters use the browser's local data.
- Settings can be saved. POS records can be exported as a restorable JSON
  backup or a CSV report.

## Current limitations

Browser storage is device- and browser-specific, can be cleared by the user,
and is not encrypted. It does not provide shared multi-device data, secure
server-side authentication, or automatic synchronization to XAMPP. Keep
separate, regular backups and do not use this mode as the sole record store for
sensitive production transactions.
