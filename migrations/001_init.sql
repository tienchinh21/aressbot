CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  is_default INTEGER NOT NULL DEFAULT 1 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount REAL NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  note TEXT NOT NULL DEFAULT '',
  happened_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_happened_at ON transactions (happened_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type_happened_at ON transactions (type, happened_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_transactions_validate_category_type
BEFORE INSERT ON transactions
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN (SELECT type FROM categories WHERE id = NEW.category_id) IS NULL
      THEN RAISE(ABORT, 'INVALID_CATEGORY')
    WHEN (SELECT type FROM categories WHERE id = NEW.category_id) <> NEW.type
      THEN RAISE(ABORT, 'CATEGORY_TYPE_MISMATCH')
  END;
END;
