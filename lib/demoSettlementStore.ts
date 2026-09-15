import type {
  SettlementArchiveRecord,
  SettlementInvoiceRecord,
} from "@/lib/settlementRecords";

declare global {
  // eslint-disable-next-line no-var
  var __dealfinderSettlements:
    | { invoices: SettlementInvoiceRecord[]; archives: SettlementArchiveRecord[] }
    | undefined;
}

function store() {
  if (!globalThis.__dealfinderSettlements) {
    globalThis.__dealfinderSettlements = { invoices: [], archives: [] };
  }
  return globalThis.__dealfinderSettlements;
}

export function demoSettlementInvoices() {
  return store().invoices;
}

export function demoSettlementArchives() {
  return store().archives;
}

export function upsertDemoInvoice(row: SettlementInvoiceRecord) {
  const invoices = store().invoices;
  const index = invoices.findIndex((item) => item.invoice === row.invoice);
  if (index >= 0) invoices[index] = row;
  else invoices.push(row);
  return row;
}

export function upsertDemoArchive(row: SettlementArchiveRecord) {
  const archives = store().archives;
  const index = archives.findIndex((item) => item.eventId === row.eventId);
  if (index >= 0) archives[index] = row;
  else archives.unshift(row);
  return row;
}
