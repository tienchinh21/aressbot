import { DatabaseSync } from "node:sqlite";

import { badRequest } from "../errors";
import type {
  Category,
  CreateTransactionInput,
  SummaryPeriod,
  SummaryRecord,
  TransactionFilters,
  TransactionRecord,
  TransactionType,
} from "../types";

type CategoryRow = {
  id: number;
  key: string;
  name: string;
  type: TransactionType;
  is_default: number;
};

type TransactionRow = {
  id: number;
  amount: number;
  type: TransactionType;
  category_key: string;
  category_name: string;
  note: string;
  happened_at: string;
  created_at: string;
};

type SummaryRow = {
  total_income: number | null;
  total_expense: number | null;
};

const VALID_TYPES: TransactionType[] = ["income", "expense"];

const isTransactionType = (value: unknown): value is TransactionType =>
  typeof value === "string" && VALID_TYPES.includes(value as TransactionType);

const parseDateTime = (value: string, field: string): Date => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw badRequest("INVALID_DATE", `${field} must be a valid ISO datetime.`);
  }
  return parsed;
};

const parseAnchorDate = (value: string): Date => {
  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyPattern.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  return parseDateTime(value, "anchorDate");
};

const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

const getPeriodRange = (period: SummaryPeriod, anchor: Date): { from: Date; to: Date } => {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const day = anchor.getUTCDate();

  if (period === "day") {
    const from = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    const to = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    return { from, to };
  }

  const from = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  return { from, to };
};

const normalizeAmount = (value: unknown): number => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw badRequest("INVALID_AMOUNT", "amount must be a positive number.");
  }
  return amount;
};

const mapCategory = (row: CategoryRow): Category => ({
  id: row.id,
  key: row.key,
  name: row.name,
  type: row.type,
  isDefault: row.is_default === 1,
});

const mapTransaction = (row: TransactionRow): TransactionRecord => ({
  id: row.id,
  amount: row.amount,
  type: row.type,
  categoryKey: row.category_key,
  categoryName: row.category_name,
  note: row.note,
  happenedAt: row.happened_at,
  createdAt: row.created_at,
});

export class ExpenseService {
  constructor(private readonly db: DatabaseSync) {}

  getDefaultCategories(): Category[] {
    const rows = this.db
      .prepare(
        `
          SELECT id, key, name, type, is_default
          FROM categories
          WHERE is_default = 1
          ORDER BY type ASC, key ASC;
        `
      )
      .all() as CategoryRow[];

    return rows.map(mapCategory);
  }

  createTransaction(input: CreateTransactionInput): TransactionRecord {
    if (!isTransactionType(input.type)) {
      throw badRequest("INVALID_TYPE", "type must be either income or expense.");
    }

    const categoryKey = String(input.categoryKey ?? "").trim();
    if (!categoryKey) {
      throw badRequest("INVALID_CATEGORY", "categoryKey is required.");
    }

    const category = this.db
      .prepare("SELECT id, key, name, type, is_default FROM categories WHERE key = ?;")
      .get(categoryKey) as CategoryRow | undefined;

    if (!category) {
      throw badRequest("INVALID_CATEGORY", "categoryKey does not exist.");
    }

    if (category.type !== input.type) {
      throw badRequest(
        "CATEGORY_TYPE_MISMATCH",
        `category ${categoryKey} only supports type ${category.type}.`
      );
    }

    const amount = normalizeAmount(input.amount);
    const note = typeof input.note === "string" ? input.note.trim() : "";
    if (note.length > 500) {
      throw badRequest("NOTE_TOO_LONG", "note must be <= 500 characters.");
    }

    const happenedAt = parseDateTime(input.happenedAt, "happenedAt").toISOString();
    const createdAt = new Date().toISOString();

    const insert = this.db.prepare(`
      INSERT INTO transactions (amount, type, category_id, note, happened_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?);
    `);
    const result = insert.run(amount, input.type, category.id, note, happenedAt, createdAt);
    const transactionId = Number(result.lastInsertRowid);

    const row = this.db
      .prepare(
        `
          SELECT
            t.id,
            t.amount,
            t.type,
            c.key AS category_key,
            c.name AS category_name,
            t.note,
            t.happened_at,
            t.created_at
          FROM transactions t
          JOIN categories c ON c.id = t.category_id
          WHERE t.id = ?;
        `
      )
      .get(transactionId) as TransactionRow | undefined;

    if (!row) {
      throw new Error("Inserted transaction could not be retrieved.");
    }

    return mapTransaction(row);
  }

  listTransactions(filters: TransactionFilters = {}): TransactionRecord[] {
    const where: string[] = [];
    const params: string[] = [];

    if (filters.from) {
      const from = parseDateTime(filters.from, "from");
      where.push("t.happened_at >= ?");
      params.push(from.toISOString());
    }

    if (filters.to) {
      const to = parseDateTime(filters.to, "to");
      where.push("t.happened_at <= ?");
      params.push(to.toISOString());
    }

    if (filters.from && filters.to) {
      const fromDate = parseDateTime(filters.from, "from");
      const toDate = parseDateTime(filters.to, "to");
      if (fromDate.getTime() > toDate.getTime()) {
        throw badRequest("INVALID_RANGE", "from must be earlier than or equal to to.");
      }
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const rows = this.db
      .prepare(
        `
          SELECT
            t.id,
            t.amount,
            t.type,
            c.key AS category_key,
            c.name AS category_name,
            t.note,
            t.happened_at,
            t.created_at
          FROM transactions t
          JOIN categories c ON c.id = t.category_id
          ${whereClause}
          ORDER BY t.happened_at DESC, t.id DESC;
        `
      )
      .all(...params) as TransactionRow[];

    return rows.map(mapTransaction);
  }

  getSummary(period: SummaryPeriod, anchorDate?: string): SummaryRecord {
    if (period !== "day" && period !== "month") {
      throw badRequest("INVALID_PERIOD", "period must be day or month.");
    }

    const anchor = anchorDate ? parseAnchorDate(anchorDate) : new Date();
    const { from, to } = getPeriodRange(period, anchor);

    const summary = this.db
      .prepare(
        `
          SELECT
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS total_expense
          FROM transactions
          WHERE happened_at >= ? AND happened_at <= ?;
        `
      )
      .get(from.toISOString(), to.toISOString()) as SummaryRow;

    const totalIncome = Number(summary.total_income ?? 0);
    const totalExpense = Number(summary.total_expense ?? 0);

    return {
      period,
      anchorDate: toDateOnly(anchor),
      from: from.toISOString(),
      to: to.toISOString(),
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
    };
  }
}
