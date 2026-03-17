export type TransactionType = "income" | "expense";
export type SummaryPeriod = "day" | "month";

export interface Category {
  id: number;
  key: string;
  name: string;
  type: TransactionType;
  isDefault: boolean;
}

export interface CreateTransactionInput {
  amount: number;
  type: TransactionType;
  categoryKey: string;
  note?: string;
  happenedAt: string;
}

export interface TransactionRecord {
  id: number;
  amount: number;
  type: TransactionType;
  categoryKey: string;
  categoryName: string;
  note: string;
  happenedAt: string;
  createdAt: string;
}

export interface TransactionFilters {
  from?: string;
  to?: string;
}

export interface SummaryRecord {
  period: SummaryPeriod;
  anchorDate: string;
  from: string;
  to: string;
  totalIncome: number;
  totalExpense: number;
  net: number;
}
