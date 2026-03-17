import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { DEFAULT_CATEGORIES } from "../default-categories";
import type { TransactionType } from "../types";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

type MigrationRow = {
  version: string;
};

export const openDatabase = (dbPath: string): DatabaseSync => {
  const resolvedPath = path.resolve(process.cwd(), dbPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const db = new DatabaseSync(resolvedPath);
  db.exec("PRAGMA foreign_keys = ON;");

  return db;
};

const ensureMigrationsTable = (db: DatabaseSync): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
};

const getAppliedMigrations = (db: DatabaseSync): Set<string> => {
  const rows = db.prepare("SELECT version FROM schema_migrations;").all() as MigrationRow[];
  return new Set(rows.map((row) => row.version));
};

const listMigrationFiles = (): string[] => {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
};

export const runMigrations = (db: DatabaseSync): void => {
  ensureMigrationsTable(db);

  const appliedMigrations = getAppliedMigrations(db);
  const insertMigration = db.prepare(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);"
  );

  for (const fileName of listMigrationFiles()) {
    if (appliedMigrations.has(fileName)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), "utf8");

    db.exec("BEGIN;");
    try {
      db.exec(sql);
      insertMigration.run(fileName, new Date().toISOString());
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  }
};

export const seedDefaultCategories = (db: DatabaseSync): void => {
  const upsert = db.prepare(`
    INSERT INTO categories (key, name, type, is_default)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      is_default = excluded.is_default;
  `);

  for (const category of DEFAULT_CATEGORIES) {
    upsert.run(category.key, category.name, category.type satisfies TransactionType);
  }
};

export const initializeDatabase = (dbPath: string): DatabaseSync => {
  const db = openDatabase(dbPath);
  runMigrations(db);
  seedDefaultCategories(db);
  return db;
};
