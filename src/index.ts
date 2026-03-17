import { Bot, InlineKeyboard, Keyboard, type Context } from "grammy";
import { createServer } from "node:http";
import "dotenv/config";

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error("BOT_TOKEN is missing");
}

const bot = new Bot(token);

type Reminder = {
  id: number;
  chatId: number;
  userId: number;
  message: string;
  when: Date;
  timeout: NodeJS.Timeout;
};

const remindersByUser = new Map<number, Reminder[]>();
let reminderId = 1;

const addReminder = (reminder: Reminder) => {
  const list = remindersByUser.get(reminder.userId) ?? [];
  list.push(reminder);
  remindersByUser.set(reminder.userId, list);
};

const removeReminder = (userId: number, id: number) => {
  const list = remindersByUser.get(userId) ?? [];
  const index = list.findIndex((item) => item.id === id);
  if (index === -1) return false;
  const [removed] = list.splice(index, 1);
  clearTimeout(removed.timeout);
  remindersByUser.set(userId, list);
  return true;
};

type TransactionType = "income" | "expense";
type Period = "day" | "month";

type Category = {
  id: string;
  name: string;
  type: TransactionType | "all";
};

type CreateTransactionPayload = {
  amount: number;
  type: TransactionType;
  category: string;
  categoryId?: string;
  note?: string;
  happenedAt: string;
};

type HistoryItem = {
  id: string;
  type: TransactionType;
  amount: number;
  category: string;
  note: string;
  happenedAt: string;
};

type Stats = {
  totalIncome: number;
  totalExpense: number;
  balance: number;
};

type TransactionDraftStep =
  | "choose_type"
  | "input_amount"
  | "choose_category"
  | "input_note"
  | "choose_time";

type TransactionDraft = {
  step: TransactionDraftStep;
  type?: TransactionType;
  amount?: number;
  categories: Category[];
  category?: Category;
  note?: string;
  happenedAt?: string;
};

const transactionDraftsByUser = new Map<number, TransactionDraft>();

const DEFAULT_EXPENSE_CATEGORIES: Category[] = [
  { id: "food", name: "Ăn uống", type: "expense" },
  { id: "move", name: "Di chuyển", type: "expense" },
  { id: "home", name: "Nhà ở", type: "expense" },
  { id: "shopping", name: "Mua sắm", type: "expense" },
  { id: "health", name: "Sức khỏe", type: "expense" },
  { id: "other_expense", name: "Khác", type: "expense" },
];

const DEFAULT_INCOME_CATEGORIES: Category[] = [
  { id: "salary", name: "Lương", type: "income" },
  { id: "bonus", name: "Thưởng", type: "income" },
  { id: "sale", name: "Bán hàng", type: "income" },
  { id: "gift", name: "Quà tặng", type: "income" },
  { id: "other_income", name: "Khác", type: "income" },
];

const HOME_MENU = new Keyboard()
  .text("➕ Ghi giao dịch")
  .row()
  .text("📜 Lịch sử hôm nay")
  .text("📜 Lịch sử tháng")
  .row()
  .text("📊 Thống kê hôm nay")
  .text("📊 Thống kê tháng")
  .resized();

const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const valueAsString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const valueAsNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeType = (value: unknown): TransactionType => {
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "income" || lower === "thu") return "income";
    if (lower === "expense" || lower === "chi") return "expense";
  }
  return "expense";
};

const formatType = (type: TransactionType): string => (type === "expense" ? "Chi" : "Thu");
const formatAmount = (value: number): string => currencyFormatter.format(Math.round(value));

const formatDateTime = (input: string): string => {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleString("vi-VN");
};

const pad = (num: number): string => String(num).padStart(2, "0");

const toOffsetIsoString = (date: Date): string => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHour = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const offsetMinute = pad(Math.abs(offsetMinutes) % 60);
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHour}:${offsetMinute}`;
};

const parseAmount = (raw: string): number | null => {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const amount = Number(digits);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
};

const parseDateTimeInput = (raw: string): Date | null => {
  const input = raw.trim();
  const datetimeMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (datetimeMatch) {
    const [, y, m, d, hh, mm] = datetimeMatch;
    const date = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      0,
      0
    );
    if (Number.isNaN(date.getTime())) return null;
    if (
      date.getFullYear() !== Number(y) ||
      date.getMonth() !== Number(m) - 1 ||
      date.getDate() !== Number(d) ||
      date.getHours() !== Number(hh) ||
      date.getMinutes() !== Number(mm)
    ) {
      return null;
    }
    return date;
  }

  const dateOnlyMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
    if (Number.isNaN(date.getTime())) return null;
    if (
      date.getFullYear() !== Number(y) ||
      date.getMonth() !== Number(m) - 1 ||
      date.getDate() !== Number(d)
    ) {
      return null;
    }
    return date;
  }

  return null;
};

const parseDay = (raw?: string): Date | null => {
  if (!raw) return new Date();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(m) - 1 ||
    date.getDate() !== Number(d)
  ) {
    return null;
  }
  return date;
};

const parseMonth = (raw?: string): Date | null => {
  if (!raw) return new Date();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const [, y, m] = match;
  const date = new Date(Number(y), Number(m) - 1, 1, 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1) {
    return null;
  }
  return date;
};

const resolveRange = (
  period: Period,
  rawDate?: string
): { from: string; to: string; label: string } | null => {
  if (period === "day") {
    const date = parseDay(rawDate);
    if (!date) return null;
    const from = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const to = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
    return {
      from: toOffsetIsoString(from),
      to: toOffsetIsoString(to),
      label: from.toLocaleDateString("vi-VN"),
    };
  }

  const date = parseMonth(rawDate);
  if (!date) return null;
  const from = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return {
    from: toOffsetIsoString(from),
    to: toOffsetIsoString(to),
    label: `${pad(from.getMonth() + 1)}/${from.getFullYear()}`,
  };
};

const parsePeriodArgs = (args: string[]): { period: Period; rawDate?: string } | null => {
  if (args.length === 0) {
    return { period: "month" };
  }

  const first = args[0].toLowerCase();
  if (first === "day" || first === "month") {
    return { period: first, rawDate: args[1] };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(first)) {
    return { period: "day", rawDate: first };
  }

  if (/^\d{4}-\d{2}$/.test(first)) {
    return { period: "month", rawDate: first };
  }

  return null;
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Lỗi không xác định";
};

class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

class ExpenseApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private ensureConfigured() {
    if (!this.baseUrl) {
      throw new ApiError(
        "Chưa cấu hình EXPENSE_API_BASE_URL. Cần set biến môi trường để tích hợp API."
      );
    }
  }

  private async request<T>(method: string, pathWithQuery: string, body?: unknown): Promise<T> {
    this.ensureConfigured();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${this.baseUrl}${pathWithQuery}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(process.env.EXPENSE_API_TOKEN
            ? { Authorization: `Bearer ${process.env.EXPENSE_API_TOKEN}` }
            : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const rawText = await response.text();
      let parsed: unknown = null;
      if (rawText) {
        try {
          parsed = JSON.parse(rawText) as unknown;
        } catch {
          parsed = rawText;
        }
      }

      if (!response.ok) {
        const detail =
          (isRecord(parsed) && valueAsString(parsed.message)) ||
          (isRecord(parsed) && valueAsString(parsed.error)) ||
          rawText ||
          response.statusText ||
          "Request failed";
        throw new ApiError(detail, response.status);
      }

      return parsed as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ApiError("API timeout sau 10 giây.");
      }
      throw new ApiError(`Không gọi được API: ${errorMessage(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestWithFallback<T>(
    method: string,
    paths: string[],
    body?: unknown
  ): Promise<T> {
    let lastError: ApiError | null = null;
    for (const path of paths) {
      try {
        return await this.request<T>(method, path, body);
      } catch (error) {
        const apiError =
          error instanceof ApiError ? error : new ApiError(`API error: ${errorMessage(error)}`);
        if (apiError.status !== 404 && apiError.status !== 405) {
          throw apiError;
        }
        lastError = apiError;
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new ApiError("Không tìm thấy endpoint phù hợp.");
  }

  private normalizeCategory(item: unknown): Category | null {
    if (typeof item === "string" && item.trim().length > 0) {
      const name = item.trim();
      return { id: name.toLowerCase().replace(/\s+/g, "_"), name, type: "all" };
    }

    if (!isRecord(item)) return null;
    const id = valueAsString(item.id) ?? valueAsString(item.code);
    const name =
      valueAsString(item.name) ?? valueAsString(item.label) ?? valueAsString(item.title);
    if (!name) return null;
    const normalizedType =
      item.type !== undefined
        ? normalizeType(item.type)
        : item.isIncome === true
          ? "income"
          : item.isExpense === true
            ? "expense"
            : "all";
    return { id: id ?? name.toLowerCase().replace(/\s+/g, "_"), name, type: normalizedType };
  }

  private normalizeHistoryItem(item: unknown): HistoryItem | null {
    if (!isRecord(item)) return null;
    const id = valueAsString(item.id) ?? valueAsString(item.transactionId) ?? "n/a";
    const type = normalizeType(item.type);
    const amount =
      valueAsNumber(item.amount) ??
      valueAsNumber(item.value) ??
      valueAsNumber(item.total) ??
      valueAsNumber(item.money);
    if (!amount || amount <= 0) return null;
    const category =
      valueAsString(item.category) ??
      valueAsString(item.categoryName) ??
      valueAsString(item.categoryId) ??
      "Khác";
    const note = valueAsString(item.note) ?? valueAsString(item.description) ?? "";
    const happenedAt =
      valueAsString(item.happenedAt) ??
      valueAsString(item.createdAt) ??
      valueAsString(item.date) ??
      new Date().toISOString();
    return { id, type, amount, category, note, happenedAt };
  }

  async getDefaultCategories(type: TransactionType): Promise<Category[]> {
    const data = await this.requestWithFallback<unknown>("GET", [
      "/api/v1/categories/default",
      "/api/categories/default",
      "/categories/default",
    ]);

    let rawList: unknown[] = [];
    if (Array.isArray(data)) {
      rawList = data;
    } else if (isRecord(data) && Array.isArray(data.items)) {
      rawList = data.items;
    } else if (isRecord(data) && Array.isArray(data.data)) {
      rawList = data.data;
    } else if (isRecord(data) && Array.isArray(data.categories)) {
      rawList = data.categories;
    } else if (isRecord(data) && type === "expense" && Array.isArray(data.expenseCategories)) {
      rawList = data.expenseCategories;
    } else if (isRecord(data) && type === "income" && Array.isArray(data.incomeCategories)) {
      rawList = data.incomeCategories;
    }

    const normalized = rawList
      .map((item) => this.normalizeCategory(item))
      .filter((item): item is Category => Boolean(item))
      .filter((item) => item.type === "all" || item.type === type);

    if (normalized.length > 0) return normalized;
    return type === "expense" ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES;
  }

  async createTransaction(payload: CreateTransactionPayload): Promise<void> {
    await this.requestWithFallback<unknown>(
      "POST",
      ["/api/v1/transactions", "/api/transactions", "/transactions"],
      payload
    );
  }

  async getHistory(from: string, to: string, limit = 20): Promise<HistoryItem[]> {
    const params = new URLSearchParams({
      from,
      to,
      limit: String(limit),
      sort: "desc",
    });

    const data = await this.requestWithFallback<unknown>("GET", [
      `/api/v1/transactions?${params.toString()}`,
      `/api/transactions?${params.toString()}`,
      `/transactions?${params.toString()}`,
    ]);

    const rawList = Array.isArray(data)
      ? data
      : isRecord(data) && Array.isArray(data.items)
        ? data.items
        : isRecord(data) && Array.isArray(data.data)
          ? data.data
          : [];

    return rawList
      .map((item) => this.normalizeHistoryItem(item))
      .filter((item): item is HistoryItem => Boolean(item))
      .sort((a, b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime());
  }

  async getStats(period: Period, from: string, to: string): Promise<Stats> {
    const params = new URLSearchParams({ period, from, to });
    const data = await this.requestWithFallback<unknown>("GET", [
      `/api/v1/transactions/stats?${params.toString()}`,
      `/api/transactions/stats?${params.toString()}`,
      `/api/stats/summary?${params.toString()}`,
      `/stats/summary?${params.toString()}`,
    ]);

    const obj = isRecord(data) ? data : {};
    const totalIncome =
      valueAsNumber(obj.totalIncome) ?? valueAsNumber(obj.income) ?? valueAsNumber(obj.totalIn) ?? 0;
    const totalExpense =
      valueAsNumber(obj.totalExpense) ??
      valueAsNumber(obj.expense) ??
      valueAsNumber(obj.totalOut) ??
      0;
    const balance =
      valueAsNumber(obj.balance) ??
      valueAsNumber(obj.net) ??
      valueAsNumber(obj.diff) ??
      totalIncome - totalExpense;

    return { totalIncome, totalExpense, balance };
  }
}

const expenseApi = new ExpenseApiClient(process.env.EXPENSE_API_BASE_URL?.trim() ?? "");

const getArgs = (ctx: Context): string[] => {
  const text = ctx.message?.text;
  if (!text) return [];
  return text.trim().split(/\s+/).slice(1);
};

const transactionTypeKeyboard = new InlineKeyboard()
  .text("➖ Chi", "tx:type:expense")
  .text("➕ Thu", "tx:type:income")
  .row()
  .text("Huỷ", "tx:cancel");

const createCategoryKeyboard = (categories: Category[]): InlineKeyboard => {
  const keyboard = new InlineKeyboard();
  categories.forEach((category, index) => {
    keyboard.text(category.name, `tx:category:${index}`);
    if (index % 2 === 1 || index === categories.length - 1) {
      keyboard.row();
    }
  });
  keyboard.text("Huỷ", "tx:cancel");
  return keyboard;
};

const createTimeKeyboard = new InlineKeyboard()
  .text("Dùng thời điểm hiện tại", "tx:time:now")
  .row()
  .text("Huỷ", "tx:cancel");

const clearDraft = (userId: number) => {
  transactionDraftsByUser.delete(userId);
};

const startTransactionFlow = async (ctx: Context) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  transactionDraftsByUser.set(userId, { step: "choose_type", categories: [] });
  await ctx.reply("Bắt đầu ghi giao dịch mới. Chọn loại giao dịch:", {
    reply_markup: transactionTypeKeyboard,
  });
};

const loadCategoriesWithFallback = async (
  type: TransactionType
): Promise<{ categories: Category[]; warning?: string }> => {
  try {
    const categories = await expenseApi.getDefaultCategories(type);
    return { categories };
  } catch (error) {
    return {
      categories: type === "expense" ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES,
      warning: `Không tải được danh mục từ API, dùng danh mục mặc định local. (${errorMessage(error)})`,
    };
  }
};

const submitTransactionDraft = async (ctx: Context, userId: number, draft: TransactionDraft) => {
  if (!draft.type || !draft.amount || !draft.category || !draft.happenedAt) {
    await ctx.reply("Thiếu dữ liệu giao dịch, vui lòng /transaction để nhập lại.");
    clearDraft(userId);
    return;
  }

  const payload: CreateTransactionPayload = {
    type: draft.type,
    amount: draft.amount,
    category: draft.category.name,
    happenedAt: draft.happenedAt,
    note: draft.note,
  };

  if (draft.category.id && draft.category.id !== draft.category.name) {
    payload.categoryId = draft.category.id;
  }

  await ctx.reply("Đang lưu giao dịch...");
  try {
    await expenseApi.createTransaction(payload);
    clearDraft(userId);
    await ctx.reply(
      [
        "Đã lưu giao dịch thành công.",
        `- Loại: ${formatType(payload.type)}`,
        `- Số tiền: ${formatAmount(payload.amount)}`,
        `- Danh mục: ${payload.category}`,
        `- Ghi chú: ${payload.note || "(trống)"}`,
        `- Thời gian: ${formatDateTime(payload.happenedAt)}`,
      ].join("\n"),
      { reply_markup: HOME_MENU }
    );
  } catch (error) {
    await ctx.reply(`Lưu giao dịch thất bại: ${errorMessage(error)}`);
  }
};

const sendHistory = async (ctx: Context, period: Period, rawDate?: string) => {
  const range = resolveRange(period, rawDate);
  if (!range) {
    await ctx.reply(
      "Tham số thời gian không hợp lệ. Dùng:\n/history day YYYY-MM-DD\n/history month YYYY-MM"
    );
    return;
  }

  await ctx.reply(`Đang tải lịch sử giao dịch (${period} - ${range.label})...`);
  try {
    const items = await expenseApi.getHistory(range.from, range.to, 20);
    if (items.length === 0) {
      await ctx.reply(`Không có giao dịch cho ${period} ${range.label}.`);
      return;
    }

    const lines = items.slice(0, 10).map((item) => {
      const sign = item.type === "expense" ? "-" : "+";
      const notePart = item.note ? ` | ${item.note}` : "";
      return `${sign} ${formatAmount(item.amount)} | ${item.category} | ${formatDateTime(item.happenedAt)}${notePart}`;
    });

    await ctx.reply(
      [`Lịch sử ${period} ${range.label} (${items.length} giao dịch):`, ...lines].join("\n")
    );
  } catch (error) {
    await ctx.reply(`Không tải được lịch sử giao dịch: ${errorMessage(error)}`);
  }
};

const sendStats = async (ctx: Context, period: Period, rawDate?: string) => {
  const range = resolveRange(period, rawDate);
  if (!range) {
    await ctx.reply(
      "Tham số thời gian không hợp lệ. Dùng:\n/stats day YYYY-MM-DD\n/stats month YYYY-MM"
    );
    return;
  }

  await ctx.reply(`Đang tải thống kê (${period} - ${range.label})...`);
  try {
    const stats = await expenseApi.getStats(period, range.from, range.to);
    await ctx.reply(
      [
        `Thống kê ${period} ${range.label}:`,
        `- Tổng thu: ${formatAmount(stats.totalIncome)}`,
        `- Tổng chi: ${formatAmount(stats.totalExpense)}`,
        `- Chênh lệch: ${formatAmount(stats.balance)}`,
      ].join("\n")
    );
  } catch (error) {
    await ctx.reply(`Không tải được thống kê: ${errorMessage(error)}`);
  }
};

bot.command("start", (ctx) =>
  ctx.reply("AresBot - MVP quản lý chi tiêu.\nChọn thao tác nhanh bên dưới hoặc gõ /help.", {
    reply_markup: HOME_MENU,
  })
);

bot.command("menu", (ctx) => ctx.reply("Menu thao tác:", { reply_markup: HOME_MENU }));

bot.command("help", (ctx) =>
  ctx.reply(
    [
      "/start - Bắt đầu",
      "/menu - Mở menu nhanh",
      "/transaction - Bắt đầu ghi giao dịch",
      "/cancel_tx - Hủy luồng nhập giao dịch",
      "/history [day|month] [YYYY-MM-DD|YYYY-MM] - Xem lịch sử",
      "/stats [day|month] [YYYY-MM-DD|YYYY-MM] - Xem thống kê",
      "/ping - Kiểm tra bot",
      "/remind <phút> <nội dung> - Nhắc việc",
      "/reminders - Danh sách nhắc việc",
      "/cancel <id> - Hủy nhắc việc",
    ].join("\n")
  )
);

bot.command("ping", (ctx) => ctx.reply("pong"));
bot.command("transaction", (ctx) => startTransactionFlow(ctx));

bot.command("cancel_tx", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  clearDraft(userId);
  await ctx.reply("Đã huỷ luồng nhập giao dịch.", { reply_markup: HOME_MENU });
});

bot.command("history", async (ctx) => {
  const parsed = parsePeriodArgs(getArgs(ctx));
  if (!parsed) {
    await ctx.reply("Dùng: /history day YYYY-MM-DD hoặc /history month YYYY-MM");
    return;
  }
  await sendHistory(ctx, parsed.period, parsed.rawDate);
});

bot.command("stats", async (ctx) => {
  const parsed = parsePeriodArgs(getArgs(ctx));
  if (!parsed) {
    await ctx.reply("Dùng: /stats day YYYY-MM-DD hoặc /stats month YYYY-MM");
    return;
  }
  await sendStats(ctx, parsed.period, parsed.rawDate);
});

bot.hears("➕ Ghi giao dịch", (ctx) => startTransactionFlow(ctx));
bot.hears("📜 Lịch sử hôm nay", (ctx) => sendHistory(ctx, "day"));
bot.hears("📜 Lịch sử tháng", (ctx) => sendHistory(ctx, "month"));
bot.hears("📊 Thống kê hôm nay", (ctx) => sendStats(ctx, "day"));
bot.hears("📊 Thống kê tháng", (ctx) => sendStats(ctx, "month"));

bot.callbackQuery("tx:cancel", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  clearDraft(userId);
  await ctx.answerCallbackQuery({ text: "Đã hủy" });
  await ctx.reply("Đã huỷ luồng nhập giao dịch.", { reply_markup: HOME_MENU });
});

bot.callbackQuery(/^tx:type:(income|expense)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  const selectedType = ctx.match[1] as TransactionType;
  const draft = transactionDraftsByUser.get(userId);
  if (!draft) {
    await ctx.answerCallbackQuery({ text: "Luồng đã hết hạn, gõ /transaction để bắt đầu lại." });
    return;
  }
  draft.type = selectedType;
  draft.step = "input_amount";
  transactionDraftsByUser.set(userId, draft);

  await ctx.answerCallbackQuery({ text: `Đã chọn ${formatType(selectedType)}` });
  await ctx.reply(`Nhập số tiền cho giao dịch ${formatType(selectedType)} (VND):`);
});

bot.callbackQuery(/^tx:category:(\d+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  const draft = transactionDraftsByUser.get(userId);
  if (!draft || draft.step !== "choose_category") {
    await ctx.answerCallbackQuery({ text: "Luồng không hợp lệ, gõ /transaction để bắt đầu lại." });
    return;
  }

  const index = Number(ctx.match[1]);
  const category = draft.categories[index];
  if (!category) {
    await ctx.answerCallbackQuery({ text: "Danh mục không hợp lệ." });
    return;
  }

  draft.category = category;
  draft.step = "input_note";
  transactionDraftsByUser.set(userId, draft);

  await ctx.answerCallbackQuery({ text: `Đã chọn ${category.name}` });
  await ctx.reply("Nhập ghi chú (hoặc gửi dấu - để bỏ qua):");
});

bot.callbackQuery("tx:time:now", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  const draft = transactionDraftsByUser.get(userId);
  if (!draft || draft.step !== "choose_time") {
    await ctx.answerCallbackQuery({ text: "Luồng không hợp lệ, gõ /transaction để bắt đầu lại." });
    return;
  }
  draft.happenedAt = toOffsetIsoString(new Date());
  transactionDraftsByUser.set(userId, draft);
  await ctx.answerCallbackQuery({ text: "Đã chọn thời điểm hiện tại" });
  await submitTransactionDraft(ctx, userId, draft);
});

bot.on("message:text", async (ctx) => {
  const userId = ctx.from?.id;
  const text = ctx.message.text.trim();
  if (!userId) return;
  if (text.startsWith("/")) return;

  const ignoredQuickActions = new Set([
    "➕ Ghi giao dịch",
    "📜 Lịch sử hôm nay",
    "📜 Lịch sử tháng",
    "📊 Thống kê hôm nay",
    "📊 Thống kê tháng",
  ]);
  if (ignoredQuickActions.has(text)) return;

  const draft = transactionDraftsByUser.get(userId);
  if (!draft) return;

  if (draft.step === "input_amount") {
    const amount = parseAmount(text);
    if (!amount) {
      await ctx.reply("Số tiền không hợp lệ. Vui lòng nhập số dương, ví dụ: 150000");
      return;
    }

    if (!draft.type) {
      await ctx.reply("Luồng thiếu loại giao dịch, vui lòng /transaction để nhập lại.");
      clearDraft(userId);
      return;
    }

    draft.amount = amount;
    const categoryResult = await loadCategoriesWithFallback(draft.type);
    draft.categories = categoryResult.categories;
    draft.step = "choose_category";
    transactionDraftsByUser.set(userId, draft);

    if (categoryResult.warning) {
      await ctx.reply(categoryResult.warning);
    }

    await ctx.reply("Chọn danh mục:", {
      reply_markup: createCategoryKeyboard(draft.categories),
    });
    return;
  }

  if (draft.step === "input_note") {
    draft.note = text === "-" ? "" : text;
    draft.step = "choose_time";
    transactionDraftsByUser.set(userId, draft);
    await ctx.reply(
      "Chọn thời gian giao dịch.\n- Bấm nút để dùng hiện tại\n- Hoặc nhập `YYYY-MM-DD HH:mm`",
      {
        reply_markup: createTimeKeyboard,
      }
    );
    return;
  }

  if (draft.step === "choose_time") {
    const date = text === "-" ? new Date() : parseDateTimeInput(text);
    if (!date) {
      await ctx.reply("Thời gian không hợp lệ. Dùng định dạng YYYY-MM-DD HH:mm hoặc gửi -");
      return;
    }

    draft.happenedAt = toOffsetIsoString(date);
    transactionDraftsByUser.set(userId, draft);
    await submitTransactionDraft(ctx, userId, draft);
  }
});

bot.command("remind", (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!userId || !chatId) return;

  const args = getArgs(ctx);
  if (args.length < 2) {
    return ctx.reply("Dùng: /remind <phút> <nội dung>");
  }

  const minutes = Number(args[0]);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return ctx.reply("Số phút phải là số dương.");
  }

  const message = args.slice(1).join(" ").trim();
  if (!message) {
    return ctx.reply("Nội dung nhắc việc không được trống.");
  }

  const when = new Date(Date.now() + minutes * 60 * 1000);
  const id = reminderId++;
  const timeout = setTimeout(() => {
    bot.api.sendMessage(chatId, `⏰ Nhắc việc: ${message}`);
    removeReminder(userId, id);
  }, minutes * 60 * 1000);

  addReminder({ id, chatId, userId, message, when, timeout });

  return ctx.reply(`Đã đặt nhắc việc #${id} lúc ${when.toLocaleTimeString()}.`);
});

bot.command("reminders", (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const list = remindersByUser.get(userId) ?? [];
  if (list.length === 0) {
    return ctx.reply("Chưa có nhắc việc nào.");
  }

  const lines = list
    .sort((a, b) => a.when.getTime() - b.when.getTime())
    .map((item) => `#${item.id} - ${item.when.toLocaleTimeString()} - ${item.message}`);

  return ctx.reply(lines.join("\n"));
});

bot.command("cancel", (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const args = getArgs(ctx);
  const id = Number(args[0]);
  if (!Number.isFinite(id)) {
    return ctx.reply("Dùng: /cancel <id>");
  }

  const ok = removeReminder(userId, id);
  return ctx.reply(ok ? `Đã hủy #${id}.` : `Không tìm thấy #${id}.`);
});

const startHealthServerForRender = (): void => {
  const rawPort = process.env.PORT?.trim();
  if (!rawPort) return;

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0) {
    console.warn(`[health] Invalid PORT value: ${rawPort}`);
    return;
  }

  const healthServer = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/" || url === "/health" || url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "NOT_FOUND" }));
  });

  healthServer.listen(port, "0.0.0.0", () => {
    console.log(`[health] Listening on 0.0.0.0:${port}`);
  });
};

startHealthServerForRender();
bot.start();
