import type { TransactionType } from "./types";

export interface DefaultCategorySeed {
  key: string;
  name: string;
  type: TransactionType;
}

export const DEFAULT_CATEGORIES: DefaultCategorySeed[] = [
  { key: "salary", name: "Luong", type: "income" },
  { key: "bonus", name: "Thuong", type: "income" },
  { key: "refund", name: "Hoan tien", type: "income" },
  { key: "other_income", name: "Thu khac", type: "income" },
  { key: "food", name: "An uong", type: "expense" },
  { key: "transport", name: "Di chuyen", type: "expense" },
  { key: "shopping", name: "Mua sam", type: "expense" },
  { key: "housing", name: "Nha o", type: "expense" },
  { key: "health", name: "Suc khoe", type: "expense" },
  { key: "education", name: "Giao duc", type: "expense" },
  { key: "entertainment", name: "Giai tri", type: "expense" },
  { key: "other_expense", name: "Chi khac", type: "expense" },
];
