import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { ApiError } from "../errors";
import { ExpenseService } from "../services/expense-service";
import type { CreateTransactionInput, SummaryPeriod } from "../types";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

const sendJson = (res: ServerResponse, status: number, payload: unknown): void => {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(payload));
};

const readJsonBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  let totalLength = 0;

  for await (const chunk of req) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalLength += bufferChunk.length;

    if (totalLength > 1024 * 1024) {
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body exceeds 1MB.");
    }

    chunks.push(bufferChunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ApiError(400, "INVALID_BODY", "Request body must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
};

const toErrorPayload = (error: ApiError) => ({
  error: {
    code: error.code,
    message: error.message,
    details: error.details ?? null,
  },
});

const handleError = (res: ServerResponse, error: unknown): void => {
  if (error instanceof ApiError) {
    sendJson(res, error.status, toErrorPayload(error));
    return;
  }

  sendJson(res, 500, {
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error.",
      details: null,
    },
  });
};

export const createApiServer = (expenseService: ExpenseService) =>
  createServer(async (req, res) => {
    try {
      const method = req.method ?? "GET";
      const url = new URL(req.url ?? "/", "http://localhost");

      if (method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, {
          data: {
            status: "ok",
          },
        });
        return;
      }

      if (method === "GET" && url.pathname === "/api/categories/default") {
        sendJson(res, 200, {
          data: expenseService.getDefaultCategories(),
        });
        return;
      }

      if (method === "POST" && url.pathname === "/api/transactions") {
        const body = await readJsonBody(req);

        const payload: CreateTransactionInput = {
          amount: Number(body.amount),
          type: String(body.type) as CreateTransactionInput["type"],
          categoryKey: String(body.categoryKey ?? ""),
          note: body.note === undefined ? undefined : String(body.note),
          happenedAt: String(body.happenedAt ?? ""),
        };

        const created = expenseService.createTransaction(payload);
        sendJson(res, 201, { data: created });
        return;
      }

      if (method === "GET" && url.pathname === "/api/transactions") {
        const from = url.searchParams.get("from") ?? undefined;
        const to = url.searchParams.get("to") ?? undefined;
        const records = expenseService.listTransactions({ from, to });

        sendJson(res, 200, { data: records });
        return;
      }

      if (method === "GET" && url.pathname === "/api/stats/summary") {
        const period = (url.searchParams.get("period") ?? "month") as SummaryPeriod;
        const anchorDate = url.searchParams.get("anchorDate") ?? undefined;
        const summary = expenseService.getSummary(period, anchorDate);

        sendJson(res, 200, { data: summary });
        return;
      }

      sendJson(res, 404, {
        error: {
          code: "NOT_FOUND",
          message: "Route not found.",
          details: null,
        },
      });
    } catch (error) {
      handleError(res, error);
    }
  });
