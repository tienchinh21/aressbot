import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { initializeDatabase } from "../db/database";
import { ApiError } from "../errors";
import { ExpenseService } from "../services/expense-service";

const createTestContext = (): { service: ExpenseService; close: () => void } => {
  const dbPath = path.join(
    os.tmpdir(),
    `aresbot-test-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  );
  const db = initializeDatabase(dbPath);
  const service = new ExpenseService(db);

  const close = (): void => {
    db.close();
    fs.rmSync(dbPath, { force: true });
  };

  return { service, close };
};

test("createTransaction creates a valid record", () => {
  const { service, close } = createTestContext();
  try {
    const created = service.createTransaction({
      amount: 120000,
      type: "expense",
      categoryKey: "food",
      note: "com trua",
      happenedAt: "2026-03-16T08:00:00.000Z",
    });

    assert.equal(created.amount, 120000);
    assert.equal(created.type, "expense");
    assert.equal(created.categoryKey, "food");
    assert.equal(created.note, "com trua");
  } finally {
    close();
  }
});

test("createTransaction rejects invalid amount", () => {
  const { service, close } = createTestContext();
  try {
    assert.throws(
      () =>
        service.createTransaction({
          amount: 0,
          type: "expense",
          categoryKey: "food",
          happenedAt: "2026-03-16T08:00:00.000Z",
        }),
      (error) => error instanceof ApiError && error.code === "INVALID_AMOUNT"
    );
  } finally {
    close();
  }
});

test("createTransaction rejects invalid category and type mismatch", () => {
  const { service, close } = createTestContext();
  try {
    assert.throws(
      () =>
        service.createTransaction({
          amount: 50000,
          type: "expense",
          categoryKey: "missing-category",
          happenedAt: "2026-03-16T08:00:00.000Z",
        }),
      (error) => error instanceof ApiError && error.code === "INVALID_CATEGORY"
    );

    assert.throws(
      () =>
        service.createTransaction({
          amount: 50000,
          type: "income",
          categoryKey: "food",
          happenedAt: "2026-03-16T08:00:00.000Z",
        }),
      (error) => error instanceof ApiError && error.code === "CATEGORY_TYPE_MISMATCH"
    );
  } finally {
    close();
  }
});

test("listTransactions sorts newest first and supports date range filter", () => {
  const { service, close } = createTestContext();
  try {
    service.createTransaction({
      amount: 100000,
      type: "income",
      categoryKey: "salary",
      happenedAt: "2026-03-15T09:00:00.000Z",
    });
    service.createTransaction({
      amount: 25000,
      type: "expense",
      categoryKey: "food",
      happenedAt: "2026-03-16T11:00:00.000Z",
    });

    const all = service.listTransactions();
    assert.equal(all.length, 2);
    assert.equal(all[0]?.happenedAt, "2026-03-16T11:00:00.000Z");
    assert.equal(all[1]?.happenedAt, "2026-03-15T09:00:00.000Z");

    const filtered = service.listTransactions({
      from: "2026-03-16T00:00:00.000Z",
      to: "2026-03-16T23:59:59.999Z",
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.categoryKey, "food");
  } finally {
    close();
  }
});

test("getSummary returns day and month totals correctly", () => {
  const { service, close } = createTestContext();
  try {
    service.createTransaction({
      amount: 200000,
      type: "income",
      categoryKey: "salary",
      happenedAt: "2026-03-16T07:00:00.000Z",
    });
    service.createTransaction({
      amount: 70000,
      type: "expense",
      categoryKey: "shopping",
      happenedAt: "2026-03-16T09:00:00.000Z",
    });
    service.createTransaction({
      amount: 30000,
      type: "expense",
      categoryKey: "food",
      happenedAt: "2026-02-20T09:00:00.000Z",
    });

    const daySummary = service.getSummary("day", "2026-03-16");
    assert.equal(daySummary.totalIncome, 200000);
    assert.equal(daySummary.totalExpense, 70000);
    assert.equal(daySummary.net, 130000);

    const monthSummary = service.getSummary("month", "2026-03-16");
    assert.equal(monthSummary.totalIncome, 200000);
    assert.equal(monthSummary.totalExpense, 70000);
  } finally {
    close();
  }
});
