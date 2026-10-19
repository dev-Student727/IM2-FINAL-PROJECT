# IM2-FINAL-PROJECT

Micro Retail Business Point of Sales (web-based, mobile/desktop).

## Run the web app with XAMPP MySQL

1. Start **MySQL** from the XAMPP Control Panel. Apache is not required for this Flask setup.
2. Open phpMyAdmin, import [`src/database/schema.sql`](./src/database/schema.sql), and confirm it creates the `micro_retail_pos` database and its tables.
3. Copy `src/backend/.env.example` to `src/backend/.env`. Set `SECRET_KEY` to a private random value and enter your local MySQL settings. XAMPP commonly uses `127.0.0.1:3306`; configure `DB_USER` and `DB_PASSWORD` to match your MySQL account.
4. Configure the SMTP settings in the same `.env` file to enable password-reset codes. Use an email provider's SMTP/app password, not your normal email password. Reset requests stay disabled with a clear message until SMTP is configured.
5. From the repository root, install dependencies and start Flask:

   ```powershell
   py -m pip install -r src/backend/requirements.txt
   py src/backend/app.py
   ```

6. Open `http://127.0.0.1:5000/`. Register an account, then log in. The dashboard route requires a valid session.

Passwords are stored as salted PBKDF2 hashes. SQL values are parameterized through PyMySQL. The reset email code is single-use, expires after 10 minutes, and is limited to five attempts. The app uses a cookie session; enable `SESSION_COOKIE_SECURE=true` only when serving it over HTTPS.

This starter keeps public registration enabled to support the existing signup page. Before using it for a real POS deployment, restrict account creation to an administrator or an invitation flow, use a dedicated MySQL user with only the needed database permissions, and run behind HTTPS.
