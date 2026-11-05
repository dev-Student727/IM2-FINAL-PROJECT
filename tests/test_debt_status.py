import unittest
from decimal import Decimal
import os
from unittest.mock import patch

from src.backend.app import app, connect_to_database, debt_status, load_secret_key


class DebtStatusTests(unittest.TestCase):
    def test_zero_or_negative_balance_is_paid(self):
        self.assertEqual(debt_status(Decimal("0.00"), Decimal("25.00")), "Paid")
        self.assertEqual(debt_status(Decimal("-0.01"), Decimal("25.00")), "Paid")

    def test_positive_balance_is_partial_or_unpaid(self):
        self.assertEqual(debt_status(Decimal("5.00"), Decimal("20.00")), "Partial")
        self.assertEqual(debt_status(Decimal("20.00"), Decimal("0.00")), "Unpaid")

    def test_vercel_uses_configured_secret_without_filesystem(self):
        with patch.dict("os.environ", {"VERCEL": "1", "FLASK_SECRET_KEY": "persistent-secret"}):
            self.assertEqual(load_secret_key(), "persistent-secret")

    def test_vercel_requires_configured_secret(self):
        with patch.dict("os.environ", {"VERCEL": "1"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "FLASK_SECRET_KEY must be set"):
                load_secret_key()

    def test_api_root_has_service_status(self):
        response = app.test_client().get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["health"], "/api/health")

    def test_configured_frontend_origin_receives_cors_headers(self):
        with patch.dict(os.environ, {"CORS_ALLOWED_ORIGINS": "https://pos.example.com"}):
            response = app.test_client().get(
                "/api/health",
                headers={"Origin": "https://pos.example.com"},
            )
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], "https://pos.example.com")
        self.assertEqual(response.headers["Access-Control-Allow-Credentials"], "true")

    def test_database_ca_enables_verified_tls(self):
        database_settings = {
            "DB_USER": "app-user",
            "DB_NAME": "pos",
            "DB_SSL_CA": "/etc/secrets/mysql-ca.pem",
        }
        with patch.dict(os.environ, database_settings), patch(
            "src.backend.app.pymysql.connect"
        ) as connect:
            connect_to_database()

        self.assertEqual(
            connect.call_args.kwargs["ssl_ca"],
            "/etc/secrets/mysql-ca.pem",
        )
        self.assertTrue(connect.call_args.kwargs["ssl_verify_cert"])
        self.assertTrue(connect.call_args.kwargs["ssl_verify_identity"])


if __name__ == "__main__":
    unittest.main()
