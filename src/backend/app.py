import os
import secrets
import hmac
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from urllib.parse import urlsplit

import pymysql
from flask import Flask, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash


def load_secret_key():
    configured_key = os.getenv("FLASK_SECRET_KEY")
    if configured_key:
        return configured_key

    if os.getenv("VERCEL"):
        raise RuntimeError(
            "FLASK_SECRET_KEY must be set in the Vercel project environment variables."
        )

    key_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".flask_secret_key")
    try:
        with open(key_path, "r", encoding="utf-8") as key_file:
            stored_key = key_file.read().strip()
            if stored_key:
                return stored_key
    except FileNotFoundError:
        pass

    key = secrets.token_urlsafe(48)
    try:
        descriptor = os.open(key_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        with open(key_path, "r", encoding="utf-8") as key_file:
            stored_key = key_file.read().strip()
        if stored_key:
            return stored_key
        with open(key_path, "w", encoding="utf-8") as key_file:
            key_file.write(key)
        return key
    with os.fdopen(descriptor, "w", encoding="utf-8") as key_file:
        key_file.write(key)
    return key


app = Flask(__name__)
app.config.update(
    SECRET_KEY=load_secret_key(),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=False,
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
)
CENT = Decimal("0.01")


def is_allowed_local_origin(origin):
    if not origin:
        return False
    try:
        parsed = urlsplit(origin)
        return (
            parsed.scheme == "http"
            and parsed.hostname in {"localhost", "127.0.0.1"}
            and parsed.port is not None
        )
    except ValueError:
        return False


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    if is_allowed_local_origin(origin) and request.path.startswith("/api/"):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


@app.before_request
def require_authenticated_user():
    if not request.path.startswith("/api/") or request.method == "OPTIONS":
        return None
    public_endpoints = {
        "health_check",
        "account_exists",
        "login_user_ids",
        "register_account",
        "login_account",
        "logout_account",
        "current_account",
    }
    if request.endpoint in public_endpoints or session.get("user_id"):
        return None
    return json_error("Please log in to continue.", 401)


def connect_to_database():
    required = ("DB_USER", "DB_NAME")
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise RuntimeError(f"Missing database settings: {', '.join(missing)}")
    return pymysql.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.environ["DB_USER"],
        password=os.getenv("DB_PASSWORD", ""),
        database=os.environ["DB_NAME"],
        charset="utf8mb4",
        connect_timeout=5,
        autocommit=False,
    )


def money(value):
    try:
        amount = Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("Enter a valid monetary amount.")
    if not amount.is_finite() or amount < 0:
        raise ValueError("Amount must be a non-negative number.")
    return amount


def amount_text(value):
    return format(Decimal(value or 0).quantize(CENT), ".2f")


def debt_status(balance, paid):
    remaining = Decimal(balance or 0)
    if remaining <= 0:
        return "Paid"
    return "Partial" if Decimal(paid or 0) > 0 else "Unpaid"


def json_error(message, status):
    return jsonify({"error": message}), status


def transaction_row(cursor, transaction_id):
    cursor.execute(
        """
        SELECT Transactiod_Id AS id, Date AS created_at, Total_Amount AS total,
               Paid_Amount AS paid, Payment_Status AS status,
               Payment_Type AS payment_type, Payment_Method AS payment_method,
               Customer_Name AS customer
        FROM transactions
        WHERE Transactiod_Id = %s
        """,
        (transaction_id,),
    )
    row = cursor.fetchone()
    if row:
        row["id"] = int(row["id"])
        row["total"] = amount_text(row["total"])
        row["paid"] = amount_text(row["paid"])
        row["balance"] = amount_text(Decimal(row["total"]) - Decimal(row["paid"]))
        row["receipt"] = f"R-{row['id']}"
        row["created_at"] = row["created_at"].isoformat(sep=" ", timespec="seconds")
    return row


def ensure_pos_operator(cursor):
    operator_id = os.getenv("POS_USER_ID", "POS-SYSTEM").strip()
    cursor.execute("SELECT user_id FROM `user` WHERE user_id = %s", (operator_id,))
    if cursor.fetchone():
        return operator_id

    cursor.execute(
        """
        INSERT INTO `user`
            (user_id, Name, `Contact Number`, `Email Address`, Password)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (
            operator_id,
            "POS System",
            "N/A",
            f"{operator_id.lower()}@localhost",
            generate_password_hash(secrets.token_urlsafe(48)),
        ),
    )
    return operator_id


def next_id(cursor, sequence_name):
    cursor.execute(
        "SELECT last_id FROM pos_id_sequence WHERE sequence_name = %s FOR UPDATE",
        (sequence_name,),
    )
    row = cursor.fetchone()
    if row is None:
        raise RuntimeError(f"Missing ID sequence: {sequence_name}")
    next_value = int(row["last_id"]) + 1 if isinstance(row, dict) else int(row[0]) + 1
    cursor.execute(
        "UPDATE pos_id_sequence SET last_id = %s WHERE sequence_name = %s",
        (next_value, sequence_name),
    )
    return next_value


def valid_account_password(password):
    return (
        len(password) >= 8
        and any(char.isupper() for char in password)
        and any(char.isdigit() for char in password)
        and any(char in "#!&%_-" for char in password)
    )


@app.get("/api/health")
def health_check():
    return jsonify({"status": "ok", "database_configured": bool(
        os.getenv("DB_USER") and os.getenv("DB_NAME")
    )})


@app.get("/api/auth/account-exists")
def account_exists():
    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT EXISTS(SELECT 1 FROM `user` WHERE user_id <> %s)",
                (os.getenv("POS_USER_ID", "POS-SYSTEM"),),
            )
            result = cursor.fetchone()
        return jsonify({"exists": bool(result[0])})
    except (pymysql.MySQLError, RuntimeError, ValueError):
        app.logger.exception("Could not check whether an account exists")
        return json_error(
            "Could not check accounts. Confirm Flask is running, database settings are set, "
            "and the XAMPP `pos` database is available.",
            503,
        )
    finally:
        if connection:
            connection.close()


@app.get("/api/auth/user-ids")
def login_user_ids():
    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT user_id FROM `user` WHERE user_id <> %s ORDER BY user_id",
                (os.getenv("POS_USER_ID", "POS-SYSTEM"),),
            )
            user_ids = [row[0] for row in cursor.fetchall()]
        return jsonify({"user_ids": user_ids})
    except (pymysql.MySQLError, RuntimeError, ValueError):
        app.logger.exception("Could not retrieve account IDs for login")
        return json_error(
            "Could not load account IDs. Confirm the Flask and XAMPP database settings.",
            503,
        )
    finally:
        if connection:
            connection.close()


@app.post("/api/auth/register")
def register_account():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return json_error("Account details are required.", 400)
    user_id = str(data.get("user_id", "")).strip()
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    contact = str(data.get("contact_number", "")).strip()
    password = data.get("password")
    if not isinstance(password, str):
        return json_error("Enter a valid password.", 400)
    if len(user_id) < 5 or len(user_id) > 100 or any(char.isspace() for char in user_id):
        return json_error("User ID must be 5–100 characters with no spaces.", 400)
    if not name or len(name) > 255 or not contact or len(contact) > 100:
        return json_error("Enter a name and a valid contact number.", 400)
    if not email or len(email) > 255 or "@" not in email:
        return json_error("Enter a valid email address.", 400)
    if not valid_account_password(password):
        return json_error(
            "Password must be at least 8 characters and include an uppercase letter, "
            "a number, and one of # ! & % _ -.",
            400,
        )
    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT user_id FROM `user` WHERE user_id = %s OR `Email Address` = %s LIMIT 1",
                (user_id, email),
            )
            existing = cursor.fetchone()
            if existing:
                connection.rollback()
                return json_error("That user ID or email address is already registered.", 409)
            cursor.execute(
                """
                INSERT INTO `user`
                    (user_id, Name, `Contact Number`, `Email Address`, Password)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (user_id, name, contact, email, generate_password_hash(password)),
            )
        connection.commit()
        session.clear()
        session["user_id"] = user_id
        session["user_name"] = name
        return jsonify({
            "message": "Account created and signed in.",
            "user": {"user_id": user_id, "name": name, "email": email},
        }), 201
    except pymysql.err.IntegrityError:
        if connection:
            connection.rollback()
        return json_error("That user ID or email address is already registered.", 409)
    except (pymysql.MySQLError, RuntimeError, ValueError):
        if connection:
            connection.rollback()
        app.logger.exception("Could not create account")
        return json_error("Could not create account. Check the Flask and database configuration.", 503)
    finally:
        if connection:
            connection.close()


@app.post("/api/auth/login")
def login_account():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return json_error("Enter your user ID and password.", 400)
    user_id = str(data.get("user_id", "")).strip()
    password = data.get("password")
    if not user_id or not isinstance(password, str) or not password:
        return json_error("Enter your user ID and password.", 400)

    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT user_id, Name, Password FROM `user` WHERE user_id = %s",
                (user_id,),
            )
            user = cursor.fetchone()
            if user is None:
                return json_error("User ID or password is incorrect.", 401)
            stored_password = user[2] or ""
            try:
                password_matches = check_password_hash(stored_password, password)
            except (ValueError, TypeError):
                password_matches = False
            legacy_password_matches = (
                not password_matches
                and not stored_password.startswith(("pbkdf2:", "scrypt:"))
                and hmac.compare_digest(stored_password, password)
            )
            if not password_matches and not legacy_password_matches:
                return json_error("User ID or password is incorrect.", 401)
            if legacy_password_matches:
                cursor.execute(
                    "UPDATE `user` SET Password = %s WHERE user_id = %s",
                    (generate_password_hash(password), user_id),
                )
        if legacy_password_matches:
            connection.commit()
        session.clear()
        session["user_id"] = user[0]
        session["user_name"] = user[1]
        session.permanent = bool(data.get("remember"))
        return jsonify({
            "message": "Login successful.",
            "user": {"user_id": user[0], "name": user[1]},
        })
    except (pymysql.MySQLError, RuntimeError, ValueError):
        if connection:
            connection.rollback()
        app.logger.exception("Could not authenticate account")
        return json_error("Could not log in. Check the Flask and database configuration.", 503)
    finally:
        if connection:
            connection.close()


@app.post("/api/auth/logout")
def logout_account():
    session.clear()
    return jsonify({"message": "Logged out."})


@app.get("/api/auth/me")
def current_account():
    if not session.get("user_id"):
        return jsonify({"user": None})
    return jsonify({
        "user": {
            "user_id": session["user_id"],
            "name": session.get("user_name", ""),
        }
    })


@app.get("/api/products")
def get_products():
    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute(
                """
                SELECT Product_id AS id, Product_Code AS sku, Name AS name,
                       Category AS category, Price AS price, Quantity AS stock,
                       Low_Stock_Threshold AS threshold
                FROM products
                WHERE Is_Active = 1
                ORDER BY Name
                """
            )
            products = cursor.fetchall()
        return jsonify({"products": [{
            **product,
            "price": amount_text(product["price"]),
            "stock": int(product["stock"]),
            "threshold": int(product["threshold"]),
        } for product in products]})
    except (pymysql.MySQLError, RuntimeError, ValueError):
        app.logger.exception("Could not retrieve products")
        return json_error("Could not retrieve products.", 503)
    finally:
        if connection:
            connection.close()


@app.post("/api/products")
def create_product():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return json_error("A JSON product is required.", 400)
    try:
        name = str(data.get("name", "")).strip()
        sku = str(data.get("sku", "")).strip()
        category = str(data.get("category", "")).strip()
        price = money(data.get("price"))
        stock = int(data.get("stock"))
        threshold = int(data.get("threshold", 5))
        if not name or not sku or not category or stock < 0 or threshold < 0:
            raise ValueError("Enter a name, SKU, category, and valid stock values.")
    except (ValueError, TypeError):
        return json_error("Enter valid product details.", 400)

    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT Product_id FROM products WHERE Product_Code = %s",
                (sku,),
            )
            if cursor.fetchone():
                return json_error("A product with this SKU already exists.", 409)
            cursor.execute(
                """
                INSERT INTO products
                    (Product_id, Product_Code, Name, Category, Price, Quantity,
                     Low_Stock_Threshold, Is_Active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 1)
                """,
                (sku, sku, name, category, price, stock, threshold),
            )
        connection.commit()
        return jsonify({"message": "Product created.", "id": sku}), 201
    except pymysql.err.IntegrityError:
        if connection:
            connection.rollback()
        return json_error("A product with this SKU already exists.", 409)
    except (pymysql.MySQLError, RuntimeError, ValueError):
        if connection:
            connection.rollback()
        app.logger.exception("Could not create product")
        return json_error("Could not create product.", 503)
    finally:
        if connection:
            connection.close()


@app.put("/api/products/<path:product_id>")
def update_product(product_id):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return json_error("A JSON product is required.", 400)
    try:
        name = str(data.get("name", "")).strip()
        sku = str(data.get("sku", "")).strip()
        category = str(data.get("category", "")).strip()
        price = money(data.get("price"))
        stock = int(data.get("stock"))
        threshold = int(data.get("threshold", 5))
        if not name or not sku or not category or stock < 0 or threshold < 0:
            raise ValueError
    except (ValueError, TypeError):
        return json_error("Enter valid product details.", 400)

    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT Product_id FROM products WHERE Product_Code = %s AND Product_id <> %s",
                (sku, product_id),
            )
            if cursor.fetchone():
                return json_error("That SKU is already in use.", 409)
            cursor.execute(
                """
                UPDATE products
                SET Product_Code = %s, Name = %s, Category = %s,
                    Price = %s, Quantity = %s, Low_Stock_Threshold = %s
                WHERE Product_id = %s AND Is_Active = 1
                """,
                (sku, name, category, price, stock, threshold, product_id),
            )
            if cursor.rowcount == 0:
                cursor.execute(
                    "SELECT Product_id FROM products WHERE Product_id = %s AND Is_Active = 1",
                    (product_id,),
                )
                if cursor.fetchone() is None:
                    connection.rollback()
                    return json_error("Product not found.", 404)
        connection.commit()
        return jsonify({"message": "Product updated."})
    except pymysql.err.IntegrityError:
        if connection:
            connection.rollback()
        return json_error("That SKU is already in use.", 409)
    except (pymysql.MySQLError, RuntimeError):
        if connection:
            connection.rollback()
        app.logger.exception("Could not update product")
        return json_error("Could not update product.", 503)
    finally:
        if connection:
            connection.close()


@app.delete("/api/products/<path:product_id>")
def archive_product(product_id):
    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE products SET Is_Active = 0 WHERE Product_id = %s AND Is_Active = 1",
                (product_id,),
            )
            if cursor.rowcount == 0:
                connection.rollback()
                return json_error("Product not found.", 404)
        connection.commit()
        return jsonify({"message": "Product archived."})
    except (pymysql.MySQLError, RuntimeError):
        if connection:
            connection.rollback()
        app.logger.exception("Could not archive product")
        return json_error("Could not archive product.", 503)
    finally:
        if connection:
            connection.close()


@app.post("/api/transactions")
def create_transaction():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("items"), list) or not data["items"]:
        return json_error("A transaction must contain items.", 400)

    payment_type = data.get("payment_type")
    if payment_type not in {"full", "partial", "utang"}:
        return json_error("Select a valid payment type.", 400)
    customer_name = str(data.get("customer_name", "")).strip()
    contact = str(data.get("customer_contact", "")).strip()
    if payment_type != "full" and not customer_name:
        return json_error("Customer name is required for debt or partial sales.", 400)

    try:
        requested = {}
        for item in data["items"]:
            product_id = str(item.get("product_id", "")).strip()
            quantity = int(item.get("quantity"))
            if not product_id or quantity <= 0:
                raise ValueError
            requested[product_id] = requested.get(product_id, 0) + quantity
        if len(requested) != len(data["items"]):
            return json_error("Each product may only appear once in the order.", 400)
    except (ValueError, TypeError, AttributeError):
        return json_error("Transaction items are invalid.", 400)

    try:
        payment_method = str(data.get("payment_method", "Cash")).strip() or "Cash"
        cash_received = money(data.get("cash_received", 0))
        partial_paid = money(data.get("paid_amount", 0))
    except ValueError as error:
        return json_error(str(error), 400)

    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor(pymysql.cursors.DictCursor) as cursor:
            placeholders = ",".join(["%s"] * len(requested))
            cursor.execute(
                f"""
                SELECT Product_id AS id, Product_Code AS sku, Name AS name,
                       Price AS price, Quantity AS stock
                FROM products
                WHERE Is_Active = 1 AND Product_id IN ({placeholders})
                FOR UPDATE
                """,
                tuple(requested),
            )
            rows = cursor.fetchall()
            inventory = {row["id"]: row for row in rows}
            if len(inventory) != len(requested):
                raise ValueError("A product in this order is no longer available.")

            total = Decimal("0.00")
            for product_id, quantity in requested.items():
                product = inventory[product_id]
                if Decimal(product["price"]) < 0:
                    raise ValueError(f"{product['name']} has an invalid price.")
                if int(product["stock"]) < quantity:
                    raise ValueError(f"Not enough stock for {product['name']}.")
                total += Decimal(product["price"]) * quantity
            total = total.quantize(CENT, rounding=ROUND_HALF_UP)

            if payment_type == "full":
                paid = total
                if payment_method.lower() == "cash" and cash_received < total:
                    raise ValueError("Cash received must be at least the total due.")
            elif payment_type == "partial":
                paid = partial_paid
                if paid <= 0 or paid >= total:
                    raise ValueError("Partial payment must be greater than zero and less than the total.")
            else:
                paid = Decimal("0.00")
            balance = total - paid
            operator_id = ensure_pos_operator(cursor)
            status = "Paid" if balance == 0 else ("Partial" if paid > 0 else "Unpaid")
            payment_method_value = payment_method if payment_type == "full" else ""
            customer_id = (contact or customer_name).strip().casefold()[:100] if customer_name else ""
            now = datetime.now()
            transaction_id = next_id(cursor, "transaction")

            cursor.execute(
                """
                INSERT INTO transactions
                    (Transactiod_Id, User_Id, Date, Total_Amount, Payment_Status, Paid_Amount,
                     Payment_Type, Payment_Method, Customer_Name)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    transaction_id, operator_id, now, total, status, paid, payment_type,
                    payment_method_value, customer_name or None,
                ),
            )

            for product_id, quantity in requested.items():
                product = inventory[product_id]
                unit_price = Decimal(product["price"]).quantize(CENT)
                cursor.execute(
                    """
                    INSERT INTO transactionsitems
                        (Transactiod_Id, Product_Id, Quantity, PricePerItem, Sub_Total)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (transaction_id, product_id, quantity, unit_price, unit_price * quantity),
                )
                cursor.execute(
                    "UPDATE products SET Quantity = Quantity - %s WHERE Product_id = %s",
                    (quantity, product_id),
                )

            debt_id = None
            if balance > 0:
                cursor.execute(
                    """
                    SELECT Debt_Id, Total_Amount, Payment, Dabts_Balance, Items_on_Debt
                    FROM debts
                    WHERE Customer_Id = %s AND Is_Archived = 0
                    ORDER BY Debt_Id DESC
                    LIMIT 1
                    FOR UPDATE
                    """,
                    (customer_id,),
                )
                debt = cursor.fetchone()
                if debt:
                    debt_id = int(debt["Debt_Id"])
                    cursor.execute(
                        """
                        UPDATE debts
                        SET Name = %s, Total_Amount = Total_Amount + %s,
                            Payment = Payment + %s, Dabts_Balance = Dabts_Balance + %s,
                            Items_on_Debt = Items_on_Debt + %s,
                            Debts_Status = %s, Transaction_Id = %s
                        WHERE Debt_Id = %s
                        """,
                        (
                            customer_name, total, paid, balance, sum(requested.values()),
                            status, transaction_id, debt_id,
                        ),
                    )
                else:
                    debt_id = next_id(cursor, "debt")
                    cursor.execute(
                        """
                        INSERT INTO debts
                            (Debt_Id, Transaction_Id, Customer_Id, Name, Items_on_Debt,
                             Total_Amount, Payment, Dabts_Balance, Debts_Status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            debt_id, transaction_id, customer_id, customer_name,
                            sum(requested.values()),
                            total, paid, balance, status,
                        ),
                    )

                cursor.execute(
                    """
                    INSERT INTO debt_transactions (Debt_Id, Transactiod_Id, Linked_At)
                    VALUES (%s, %s, %s)
                    """,
                    (debt_id, transaction_id, now),
                )
                if paid > 0:
                    cursor.execute(
                        """
                        INSERT INTO debt_payments (Debt_Id, Transactiod_Id, Amount, Paid_At)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (debt_id, transaction_id, paid, now),
                    )

            connection.commit()
        return jsonify({
            "transaction": {
                "id": transaction_id,
                "receipt": f"R-{transaction_id}",
                "created_at": now.isoformat(sep=" ", timespec="seconds"),
                "total": amount_text(total),
                "paid": amount_text(paid),
                "balance": amount_text(balance),
                "status": status,
                "payment_type": payment_type,
                "payment_method": payment_method_value,
                "customer": customer_name or None,
                "change": amount_text(max(cash_received - total, Decimal("0.00")))
                    if payment_type == "full" and payment_method.lower() == "cash"
                    else "0.00",
                "debt_id": debt_id,
                "items": [{
                    "product_id": product_id,
                    "name": inventory[product_id]["name"],
                    "quantity": quantity,
                    "unit_price": amount_text(inventory[product_id]["price"]),
                } for product_id, quantity in requested.items()],
            }
        }), 201
    except ValueError as error:
        if connection:
            connection.rollback()
        return json_error(str(error), 400)
    except (pymysql.MySQLError, RuntimeError, ValueError):
        if connection:
            connection.rollback()
        app.logger.exception("Could not complete POS transaction")
        return json_error("Could not complete the transaction. No sale was recorded.", 503)
    finally:
        if connection:
            connection.close()


def transaction_query(search="", date_from=None, date_to=None, status=None):
    where = []
    params = []
    if search:
        like = f"%{search}%"
        where.append(
            "(CAST(t.Transactiod_Id AS CHAR) LIKE %s OR t.Customer_Name LIKE %s "
            "OR EXISTS (SELECT 1 FROM transactionsitems ti JOIN products p "
            "ON p.Product_id = ti.Product_Id WHERE ti.Transactiod_Id = t.Transactiod_Id "
            "AND (p.Name LIKE %s OR p.Product_Code LIKE %s)))"
        )
        params.extend([like, like, like, like])
    if date_from:
        where.append("t.Date >= %s")
        params.append(date_from)
    if date_to:
        where.append("t.Date < %s")
        params.append(date_to)
    if status:
        where.append("t.Payment_Status = %s")
        params.append(status)
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    return clause, params


def fetch_transactions(cursor, where="", params=(), limit=1000, offset=0):
    cursor.execute(
        f"""
        SELECT t.Transactiod_Id AS id, t.Date AS created_at,
               t.Total_Amount AS total, t.Paid_Amount AS paid,
               t.Payment_Status AS status, t.Payment_Type AS payment_type,
               t.Payment_Method AS payment_method, t.Customer_Name AS customer
        FROM transactions t
        {where}
        ORDER BY t.Date DESC, t.Transactiod_Id DESC
        LIMIT %s OFFSET %s
        """,
        (*params, limit, offset),
    )
    rows = cursor.fetchall()
    for row in rows:
        total = Decimal(row["total"] or 0)
        paid = Decimal(row["paid"] or 0)
        row.update({
            "id": int(row["id"]),
            "receipt": f"R-{row['id']}",
            "total": amount_text(total),
            "paid": amount_text(paid),
            "balance": amount_text(max(total - paid, Decimal("0.00"))),
            "created_at": row["created_at"].isoformat(sep=" ", timespec="seconds"),
            "type": "Debt" if paid < total else "Sale",
        })
    return rows


@app.get("/api/transactions")
def list_transactions():
    search = request.args.get("search", "").strip()
    status = request.args.get("status", "").strip() or None
    date_value = request.args.get("date", "").strip()
    date_from = date_to = None
    if date_value:
        try:
            selected = date.fromisoformat(date_value)
        except ValueError:
            return json_error("Invalid transaction date.", 400)
        date_from = datetime.combine(selected, time.min)
        date_to = date_from + timedelta(days=1)
    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor(pymysql.cursors.DictCursor) as cursor:
            where, params = transaction_query(search, date_from, date_to, status)
            rows = fetch_transactions(cursor, where, params, 1000)
        return jsonify({"transactions": rows})
    except (pymysql.MySQLError, RuntimeError, ValueError):
        app.logger.exception("Could not retrieve transactions")
        return json_error("Could not retrieve transactions.", 503)
    finally:
        if connection:
            connection.close()


@app.get("/api/transactions/<int:transaction_id>")
def get_transaction(transaction_id):
    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor(pymysql.cursors.DictCursor) as cursor:
            transaction = transaction_row(cursor, transaction_id)
            if not transaction:
                return json_error("Transaction not found.", 404)
            cursor.execute(
                """
                SELECT p.Name AS name, ti.Quantity AS quantity,
                       ti.PricePerItem AS unit_price, ti.Sub_Total AS subtotal
                FROM transactionsitems ti
                JOIN products p ON p.Product_id = ti.Product_Id
                WHERE ti.Transactiod_Id = %s
                ORDER BY p.Name
                """,
                (transaction_id,),
            )
            transaction["items"] = [{
                **item,
                "quantity": int(item["quantity"]),
                "unit_price": amount_text(item["unit_price"]),
                "subtotal": amount_text(item["subtotal"]),
            } for item in cursor.fetchall()]
        return jsonify({"transaction": transaction})
    except (pymysql.MySQLError, RuntimeError, ValueError):
        app.logger.exception("Could not retrieve transaction")
        return json_error("Could not retrieve transaction.", 503)
    finally:
        if connection:
            connection.close()


@app.get("/api/debts")
def list_debts():
    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute(
                """
                SELECT d.Debt_Id AS id, d.Customer_Id AS customer_id, d.Name AS name,
                       d.Items_on_Debt AS item_count, d.Total_Amount AS total,
                       d.Payment AS paid, d.Dabts_Balance AS balance,
                       d.Debts_Status AS status,
                       GREATEST(
                           COALESCE(MAX(t.Date), '1000-01-01'),
                           COALESCE(MAX(dp.Paid_At), '1000-01-01')
                       ) AS updated_at
                FROM debts d
                LEFT JOIN debt_transactions dt ON dt.Debt_Id = d.Debt_Id
                LEFT JOIN transactions t ON t.Transactiod_Id = dt.Transactiod_Id
                LEFT JOIN debt_payments dp ON dp.Debt_Id = d.Debt_Id
                WHERE d.Is_Archived = 0
                GROUP BY d.Debt_Id, d.Customer_Id, d.Name, d.Items_on_Debt,
                         d.Total_Amount, d.Payment, d.Dabts_Balance, d.Debts_Status
                ORDER BY updated_at DESC, d.Debt_Id DESC
                """
            )
            debts = []
            for row in cursor.fetchall():
                updated_at = row["updated_at"]
                debts.append({
                    "id": int(row["id"]),
                    "customer_id": row["customer_id"],
                    "name": row["name"],
                    "item_count": int(row["item_count"]),
                    "total": amount_text(row["total"]),
                    "paid": amount_text(row["paid"]),
                    "balance": amount_text(row["balance"]),
                    "status": debt_status(row["balance"], row["paid"]),
                    "updated_at": updated_at.isoformat(sep=" ", timespec="seconds")
                        if isinstance(updated_at, datetime) else "",
                })
        return jsonify({"debts": debts})
    except (pymysql.MySQLError, RuntimeError, ValueError):
        app.logger.exception("Could not retrieve debts")
        return json_error("Could not retrieve debts.", 503)
    finally:
        if connection:
            connection.close()


@app.get("/api/debts/<int:debt_id>")
def get_debt(debt_id):
    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute(
                """
                SELECT Debt_Id AS id, Customer_Id AS customer_id, Name AS name,
                       Total_Amount AS total, Payment AS paid,
                       Dabts_Balance AS balance, Debts_Status AS status
                FROM debts WHERE Debt_Id = %s
                """,
                (debt_id,),
            )
            debt = cursor.fetchone()
            if debt is None:
                return json_error("Debt record not found.", 404)
            cursor.execute(
                """
                SELECT t.Transactiod_Id AS transaction_id, t.Date AS sale_date,
                       p.Name AS item_name, ti.Quantity AS quantity,
                       ti.PricePerItem AS unit_price, ti.Sub_Total AS subtotal
                FROM debt_transactions dt
                JOIN transactions t ON t.Transactiod_Id = dt.Transactiod_Id
                JOIN transactionsitems ti ON ti.Transactiod_Id = t.Transactiod_Id
                JOIN products p ON p.Product_id = ti.Product_Id
                WHERE dt.Debt_Id = %s
                ORDER BY t.Date, t.Transactiod_Id, p.Name
                """,
                (debt_id,),
            )
            items = [{
                "transaction_id": int(row["transaction_id"]),
                "receipt": f"R-{row['transaction_id']}",
                "sale_date": row["sale_date"].isoformat(sep=" ", timespec="seconds"),
                "name": row["item_name"],
                "quantity": int(row["quantity"]),
                "unit_price": amount_text(row["unit_price"]),
                "subtotal": amount_text(row["subtotal"]),
            } for row in cursor.fetchall()]
            cursor.execute(
                """
                SELECT Amount AS amount, Paid_At AS paid_at, Transactiod_Id AS transaction_id
                FROM debt_payments
                WHERE Debt_Id = %s
                ORDER BY Paid_At
                """,
                (debt_id,),
            )
            payments = [{
                "amount": amount_text(row["amount"]),
                "paid_at": row["paid_at"].isoformat(sep=" ", timespec="seconds"),
                "transaction_id": int(row["transaction_id"]) if row["transaction_id"] else None,
            } for row in cursor.fetchall()]
            debt = {
                "id": int(debt["id"]),
                "name": debt["name"],
                "total": amount_text(debt["total"]),
                "paid": amount_text(debt["paid"]),
                "balance": amount_text(debt["balance"]),
                "status": debt_status(debt["balance"], debt["paid"]),
                "items": items,
                "payments": payments,
            }
        return jsonify({"debt": debt})
    except (pymysql.MySQLError, RuntimeError, ValueError):
        app.logger.exception("Could not retrieve debt details")
        return json_error("Could not retrieve debt details.", 503)
    finally:
        if connection:
            connection.close()


@app.post("/api/debts/<int:debt_id>/payments")
def make_debt_payment(debt_id):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return json_error("A payment amount is required.", 400)
    try:
        payment = money(data.get("amount"))
        if payment <= 0:
            return json_error("Payment must be greater than zero.", 400)
    except ValueError as error:
        return json_error(str(error), 400)

    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute(
                """
                SELECT Dabts_Balance AS balance
                FROM debts WHERE Debt_Id = %s FOR UPDATE
                """,
                (debt_id,),
            )
            debt = cursor.fetchone()
            if debt is None:
                connection.rollback()
                return json_error("Debt record not found.", 404)
            balance = Decimal(debt["balance"])
            if payment > balance:
                connection.rollback()
                return json_error("Payment cannot exceed the outstanding balance.", 400)

            cursor.execute(
                """
                INSERT INTO debt_payments (Debt_Id, Transactiod_Id, Amount, Paid_At)
                VALUES (%s, NULL, %s, %s)
                """,
                (debt_id, payment, datetime.now()),
            )
            cursor.execute(
                """
                UPDATE debts
                SET Debts_Status = CASE
                        WHEN Dabts_Balance <= %s THEN 'Paid'
                        ELSE 'Partial'
                    END,
                    Payment = Payment + %s,
                    Dabts_Balance = GREATEST(Dabts_Balance - %s, 0)
                WHERE Debt_Id = %s
                """,
                (payment, payment, payment, debt_id),
            )

            remaining = payment
            cursor.execute(
                """
                SELECT t.Transactiod_Id AS id, t.Total_Amount AS total,
                       t.Paid_Amount AS paid
                FROM debt_transactions dt
                JOIN transactions t ON t.Transactiod_Id = dt.Transactiod_Id
                WHERE dt.Debt_Id = %s
                ORDER BY t.Date, t.Transactiod_Id
                FOR UPDATE
                """,
                (debt_id,),
            )
            for sale in cursor.fetchall():
                due = Decimal(sale["total"]) - Decimal(sale["paid"])
                applied = min(remaining, due)
                if applied > 0:
                    new_paid = Decimal(sale["paid"]) + applied
                    new_status = "Paid" if new_paid >= Decimal(sale["total"]) else "Partial"
                    cursor.execute(
                        """
                        UPDATE transactions
                        SET Paid_Amount = %s, Payment_Status = %s
                        WHERE Transactiod_Id = %s
                        """,
                        (new_paid, new_status, sale["id"]),
                    )
                    remaining -= applied
                if remaining <= 0:
                    break
        connection.commit()
        return jsonify({"message": "Payment recorded.", "balance": amount_text(balance - payment)})
    except (pymysql.MySQLError, RuntimeError):
        if connection:
            connection.rollback()
        app.logger.exception("Could not record debt payment")
        return json_error("Could not record payment.", 503)
    finally:
        if connection:
            connection.close()


@app.delete("/api/debts/<int:debt_id>")
def delete_paid_debt(debt_id):
    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT Debt_Id FROM debts WHERE Debt_Id = %s AND Is_Archived = 0 FOR UPDATE",
                (debt_id,),
            )
            row = cursor.fetchone()
            if row is None:
                connection.rollback()
                return json_error("Debt record not found.", 404)
            cursor.execute(
                "UPDATE debts SET Is_Archived = 1 WHERE Debt_Id = %s",
                (debt_id,),
            )
        connection.commit()
        return jsonify({"message": "Debt record archived. Sales and payment history were retained."})
    except (pymysql.MySQLError, RuntimeError):
        if connection:
            connection.rollback()
        app.logger.exception("Could not delete debt record")
        return json_error("Could not delete debt record.", 503)
    finally:
        if connection:
            connection.close()


@app.get("/api/dashboard")
def dashboard_data():
    connection = None
    try:
        connection = connect_to_database()
        today = date.today()
        start = datetime.combine(today, time.min)
        end = start + timedelta(days=1)
        with connection.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute(
                """
                SELECT COALESCE(SUM(Total_Amount), 0) AS gross,
                       COALESCE(SUM(Paid_Amount), 0) AS paid,
                       COUNT(*) AS count
                FROM transactions WHERE Date >= %s AND Date < %s
                """,
                (start, end),
            )
            today_totals = cursor.fetchone()
            cursor.execute(
                "SELECT COALESCE(SUM(Dabts_Balance), 0) AS balance "
                "FROM debts WHERE Is_Archived = 0"
            )
            outstanding = cursor.fetchone()["balance"]
            cursor.execute(
                """
                SELECT COUNT(*) AS count FROM products
                WHERE Is_Active = 1 AND Quantity <= Low_Stock_Threshold
                """
            )
            low_stock_count = cursor.fetchone()["count"]
            cursor.execute(
                """
                SELECT Product_id AS id, Name AS name, Quantity AS stock,
                       Low_Stock_Threshold AS threshold
                FROM products WHERE Is_Active = 1 AND Quantity <= Low_Stock_Threshold
                ORDER BY Quantity, Name LIMIT 8
                """
            )
            low_stock = cursor.fetchall()
            recent = fetch_transactions(cursor, limit=8)
        return jsonify({
            "sales_today": amount_text(today_totals["gross"]),
            "paid_today": amount_text(today_totals["paid"]),
            "transactions_today": int(today_totals["count"]),
            "outstanding_debts": amount_text(outstanding),
            "low_stock_count": int(low_stock_count),
            "low_stock": low_stock,
            "recent_transactions": recent,
        })
    except (pymysql.MySQLError, RuntimeError, ValueError):
        app.logger.exception("Could not load dashboard data")
        return json_error("Could not load dashboard data.", 503)
    finally:
        if connection:
            connection.close()


@app.get("/api/reports/sales")
def sales_report():
    period = request.args.get("period", "today")
    if period not in {"today", "7days", "30days", "all"}:
        return json_error("Invalid sales period.", 400)
    search = request.args.get("search", "").strip()
    now = datetime.now()
    start = None
    if period == "today":
        start = datetime.combine(now.date(), time.min)
    elif period == "7days":
        start = datetime.combine((now - timedelta(days=6)).date(), time.min)
    elif period == "30days":
        start = datetime.combine((now - timedelta(days=29)).date(), time.min)
    where, params = transaction_query(search, start, now + timedelta(seconds=1))
    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor(pymysql.cursors.DictCursor) as cursor:
            transactions = fetch_transactions(cursor, where, params, 1000)
            cursor.execute(
                f"""
                SELECT COALESCE(SUM(t.Total_Amount), 0) AS gross,
                       COALESCE(SUM(t.Paid_Amount), 0) AS collected,
                       COALESCE(SUM(t.Total_Amount - t.Paid_Amount), 0) AS receivables,
                       COUNT(*) AS count
                FROM transactions t {where}
                """,
                tuple(params),
            )
            totals = cursor.fetchone()
            cursor.execute(
                f"""
                SELECT p.Name AS name, SUM(ti.Quantity) AS units,
                       SUM(ti.Sub_Total) AS gross
                FROM transactions t
                JOIN transactionsitems ti ON ti.Transactiod_Id = t.Transactiod_Id
                JOIN products p ON p.Product_id = ti.Product_Id
                {where}
                GROUP BY p.Product_id, p.Name
                ORDER BY units DESC, gross DESC LIMIT 10
                """,
                tuple(params),
            )
            best_sellers = cursor.fetchall()
        count = int(totals["count"])
        return jsonify({
            "gross_sales": amount_text(totals["gross"]),
            "cash_collected": amount_text(totals["collected"]),
            "receivables": amount_text(totals["receivables"]),
            "average_sale": amount_text(
                Decimal(totals["gross"]) / count if count else Decimal("0")
            ),
            "best_sellers": [{
                "name": row["name"],
                "units": int(row["units"]),
                "gross": amount_text(row["gross"]),
            } for row in best_sellers],
            "transactions": transactions,
        })
    except (pymysql.MySQLError, RuntimeError, ValueError):
        app.logger.exception("Could not load sales report")
        return json_error("Could not load sales report.", 503)
    finally:
        if connection:
            connection.close()


@app.get("/api/settings")
def get_settings():
    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor() as cursor:
            cursor.execute("SELECT Setting_Key, Setting_Value FROM pos_settings")
            values = dict(cursor.fetchall())
        return jsonify({
            "store_name": values.get("store_name", "MRB-POS"),
            "currency_symbol": values.get("currency_symbol", "₱"),
        })
    except pymysql.err.ProgrammingError as error:
        if error.args and error.args[0] == 1146:
            return jsonify({
                "store_name": "MRB-POS",
                "currency_symbol": "₱",
                "configured": False,
                "notice": (
                    "Using default preferences. Run "
                    "src/database/pos_feature_migration.sql to save custom settings."
                ),
            })
        app.logger.exception("Could not load settings")
        return json_error("Could not load settings from MySQL.", 503)
    except (pymysql.MySQLError, RuntimeError):
        app.logger.exception("Could not load settings")
        return json_error("Could not load settings from MySQL.", 503)
    finally:
        if connection:
            connection.close()


@app.put("/api/settings")
def update_settings():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return json_error("Settings are required.", 400)
    store_name = str(data.get("store_name", "")).strip()
    currency_symbol = str(data.get("currency_symbol", "")).strip()
    if not store_name or len(store_name) > 100 or not currency_symbol or len(currency_symbol) > 5:
        return json_error("Enter a store name and currency symbol.", 400)
    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO pos_settings (Setting_Key, Setting_Value)
                VALUES (%s, %s)
                ON DUPLICATE KEY UPDATE Setting_Value = VALUES(Setting_Value)
                """,
                (("store_name", store_name), ("currency_symbol", currency_symbol)),
            )
        connection.commit()
        return jsonify({"message": "Settings saved."})
    except (pymysql.MySQLError, RuntimeError):
        if connection:
            connection.rollback()
        app.logger.exception("Could not save settings")
        return json_error("Could not save settings.", 503)
    finally:
        if connection:
            connection.close()


@app.get("/api/export")
def export_data():
    connection = None
    try:
        connection = connect_to_database()
        with connection.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SHOW COLUMNS FROM `products`")
            product_columns = {row["Field"] for row in cursor.fetchall()}
            threshold_column = (
                "Low_Stock_Threshold"
                if "Low_Stock_Threshold" in product_columns
                else "5"
            )
            active_column = "Is_Active" if "Is_Active" in product_columns else "1"
            cursor.execute(
                f"""
                SELECT Product_id AS id, Product_Code AS sku, Name AS name,
                       Category AS category, Price AS price, Quantity AS stock,
                       {threshold_column} AS threshold, {active_column} AS active
                FROM products ORDER BY Name
                """
            )
            products = [{
                **row, "price": amount_text(row["price"]), "stock": int(row["stock"]),
                "threshold": int(row["threshold"]), "active": bool(row["active"]),
            } for row in cursor.fetchall()]
            cursor.execute("SHOW COLUMNS FROM `transactions`")
            transaction_columns = {row["Field"] for row in cursor.fetchall()}
            paid_column = (
                "Paid_Amount"
                if "Paid_Amount" in transaction_columns
                else "CASE WHEN LOWER(Payment_Status) = 'paid' "
                     "THEN Total_Amount ELSE 0 END"
            )
            payment_type_column = (
                "Payment_Type" if "Payment_Type" in transaction_columns else "'full'"
            )
            payment_method_column = (
                "Payment_Method" if "Payment_Method" in transaction_columns else "''"
            )
            customer_column = (
                "Customer_Name" if "Customer_Name" in transaction_columns else "''"
            )
            cursor.execute(
                f"""
                SELECT Transactiod_Id AS id, Date AS created_at,
                       Total_Amount AS total, {paid_column} AS paid,
                       Payment_Status AS status, {payment_type_column} AS payment_type,
                       {payment_method_column} AS payment_method,
                       {customer_column} AS customer
                FROM transactions
                ORDER BY Date DESC, Transactiod_Id DESC
                LIMIT 10000
                """
            )
            transactions = []
            for row in cursor.fetchall():
                total = Decimal(row["total"] or 0)
                paid = Decimal(row["paid"] or 0)
                row.update({
                    "id": int(row["id"]),
                    "receipt": f"R-{row['id']}",
                    "total": amount_text(total),
                    "paid": amount_text(paid),
                    "balance": amount_text(max(total - paid, Decimal("0.00"))),
                    "created_at": row["created_at"].isoformat(sep=" ", timespec="seconds"),
                    "type": "Debt" if paid < total else "Sale",
                })
                transactions.append(row)
            cursor.execute(
                """
                SELECT Debt_Id AS id, Customer_Id AS customer_id, Name AS name,
                       Total_Amount AS total, Payment AS paid,
                       Dabts_Balance AS balance, Debts_Status AS status
                FROM debts ORDER BY Debt_Id
                """
            )
            debts = [{
                **row, "id": int(row["id"]), "total": amount_text(row["total"]),
                "paid": amount_text(row["paid"]), "balance": amount_text(row["balance"]),
            } for row in cursor.fetchall()]
        return jsonify({
            "exported_at": datetime.now().isoformat(timespec="seconds"),
            "products": products,
            "transactions": transactions,
            "debts": debts,
        })
    except (pymysql.MySQLError, RuntimeError, ValueError):
        app.logger.exception("Could not export data")
        return json_error("Could not export data.", 503)
    finally:
        if connection:
            connection.close()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
