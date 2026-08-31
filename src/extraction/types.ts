export interface BillExtraction {
  isBill: boolean;
  confidence: number; // 0..1
  vendorName: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null; // YYYY-MM-DD
  issueDate: string | null; // YYYY-MM-DD
  invoiceNumber: string | null;
  suggestedExpenseCategory: string | null;
  memo: string | null;
}
