-- Run this once in phpMyAdmin against the existing `pos` database.
-- This migration is additive: it preserves existing rows and does not drop tables.

USE `pos`;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS Low_Stock_Threshold INT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS Is_Active TINYINT(1) NOT NULL DEFAULT 1,
    MODIFY COLUMN Price DECIMAL(65,2) NOT NULL;

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS Paid_Amount DECIMAL(65,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS Payment_Type VARCHAR(20) NOT NULL DEFAULT 'full',
    ADD COLUMN IF NOT EXISTS Payment_Method VARCHAR(50) NULL,
    ADD COLUMN IF NOT EXISTS Customer_Name VARCHAR(150) NULL,
    MODIFY COLUMN Total_Amount DECIMAL(65,2) NOT NULL;

UPDATE transactions
SET Paid_Amount = Total_Amount
WHERE LOWER(Payment_Status) IN ('paid', 'full', 'completed') AND Paid_Amount = 0.00;

UPDATE transactions t
JOIN debts d ON d.Transaction_Id = t.Transactiod_Id
SET t.Paid_Amount = LEAST(t.Total_Amount, d.Payment)
WHERE t.Paid_Amount = 0.00 AND d.Payment > 0.00;

UPDATE transactions
SET Payment_Status = CASE
    WHEN Paid_Amount >= Total_Amount THEN 'Paid'
    WHEN Paid_Amount > 0.00 THEN 'Partial'
    ELSE 'Unpaid'
END;

ALTER TABLE transactionsitems
    MODIFY COLUMN PricePerItem DECIMAL(65,2) NOT NULL,
    MODIFY COLUMN Sub_Total DECIMAL(65,2) NOT NULL;

ALTER TABLE debts
    ADD COLUMN IF NOT EXISTS Is_Archived TINYINT(1) NOT NULL DEFAULT 0,
    MODIFY COLUMN Total_Amount DECIMAL(65,2) NOT NULL,
    MODIFY COLUMN Payment DECIMAL(65,2) NOT NULL DEFAULT 0.00,
    MODIFY COLUMN Dabts_Balance DECIMAL(65,2) NOT NULL DEFAULT 0.00;

UPDATE debts
SET Debts_Status = CASE
    WHEN Dabts_Balance <= 0.00 THEN 'Paid'
    WHEN Payment > 0.00 THEN 'Partial'
    ELSE 'Unpaid'
END;

CREATE TABLE IF NOT EXISTS pos_id_sequence (
    sequence_name VARCHAR(32) NOT NULL PRIMARY KEY,
    last_id BIGINT NOT NULL
) ENGINE=InnoDB;

INSERT INTO pos_id_sequence (sequence_name, last_id)
SELECT 'transaction', COALESCE(MAX(Transactiod_Id), 0) FROM transactions
ON DUPLICATE KEY UPDATE last_id = GREATEST(last_id, VALUES(last_id));

INSERT INTO pos_id_sequence (sequence_name, last_id)
SELECT 'debt', COALESCE(MAX(Debt_Id), 0) FROM debts
ON DUPLICATE KEY UPDATE last_id = GREATEST(last_id, VALUES(last_id));

CREATE TABLE IF NOT EXISTS debt_transactions (
    Debt_Id BIGINT NOT NULL,
    Transactiod_Id BIGINT NOT NULL,
    Linked_At DATETIME NOT NULL,
    PRIMARY KEY (Debt_Id, Transactiod_Id),
    INDEX idx_debt_transactions_transaction (Transactiod_Id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS debt_payments (
    Payment_Id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    Debt_Id BIGINT NOT NULL,
    Transactiod_Id BIGINT NULL,
    Amount DECIMAL(65,2) NOT NULL,
    Paid_At DATETIME NOT NULL,
    INDEX idx_debt_payments_debt_date (Debt_Id, Paid_At)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pos_settings (
    Setting_Key VARCHAR(100) NOT NULL PRIMARY KEY,
    Setting_Value VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO debt_transactions (Debt_Id, Transactiod_Id, Linked_At)
SELECT d.Debt_Id, d.Transaction_Id, COALESCE(t.Date, CURRENT_TIMESTAMP)
FROM debts d
LEFT JOIN transactions t ON t.Transactiod_Id = d.Transaction_Id
WHERE d.Transaction_Id IS NOT NULL;

INSERT INTO debt_payments (Debt_Id, Transactiod_Id, Amount, Paid_At)
SELECT d.Debt_Id, d.Transaction_Id, d.Payment, COALESCE(t.Date, CURRENT_TIMESTAMP)
FROM debts d
LEFT JOIN transactions t ON t.Transactiod_Id = d.Transaction_Id
WHERE d.Payment > 0
  AND NOT EXISTS (
      SELECT 1 FROM debt_payments p WHERE p.Debt_Id = d.Debt_Id
  );
