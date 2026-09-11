export const SCHEMA_VERSION = 2;
export const BACKUP_FORMAT = "xtreemze-inventory";

const text = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const integer = value => Number.parseInt(value, 10);
const isoNow = () => new Date().toISOString();
const makeId = prefix => `${prefix}${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

export function emptyState(operator = "") {
  return { schemaVersion: SCHEMA_VERSION, items: [], transactions: [], settings: { operator: text(operator, 80) } };
}

export function availableQuantity(item) {
  return Math.max(0, item.quantity - item.checkedOut);
}

export function itemStatus(item) {
  if (item.archivedAt) return "archived";
  const available = availableQuantity(item);
  if (available === 0 && item.quantity > 0) return "out";
  if (available <= item.reorderPoint) return "low";
  return "available";
}

export function validateItemInput(input, checkedOut = 0) {
  const candidate = {
    name: text(input.name, 120),
    sku: text(input.sku, 80),
    category: text(input.category, 80),
    location: text(input.location, 120),
    quantity: integer(input.quantity),
    reorderPoint: integer(input.reorderPoint),
    notes: text(input.notes, 1000)
  };
  const errors = [];
  if (!candidate.name) errors.push("Name is required.");
  if (!Number.isInteger(candidate.quantity) || candidate.quantity < 0) errors.push("Quantity must be a whole number of zero or more.");
  if (!Number.isInteger(candidate.reorderPoint) || candidate.reorderPoint < 0) errors.push("Low-stock threshold must be a whole number of zero or more.");
  if (Number.isInteger(candidate.quantity) && candidate.quantity < checkedOut) errors.push(`Quantity cannot be lower than the ${checkedOut} unit(s) currently checked out.`);
  if (errors.length) throw new Error(errors.join(" "));
  return candidate;
}

function transaction({ type, item, quantity = 0, actor = "", counterparty = "", dueDate = "", note = "", at = isoNow(), idFactory = makeId }) {
  return {
    id: idFactory("txn-"), itemId: item.id, itemName: item.name, type, quantity,
    actor: text(actor, 80) || "Local operator",
    counterparty: text(counterparty, 120), dueDate: text(dueDate, 32), note: text(note, 500), at
  };
}

export function createItem(state, input, actor = "", at = isoNow(), idFactory = makeId) {
  const data = validateItemInput(input, 0);
  const item = { id: idFactory("item-"), ...data, checkedOut: 0, createdAt: at, updatedAt: at, archivedAt: null };
  return { ...state, items: [item, ...state.items], transactions: [transaction({ type: "create", item, actor, at, idFactory }), ...state.transactions] };
}

export function editItem(state, itemId, input, actor = "", at = isoNow(), idFactory = makeId) {
  const current = state.items.find(item => item.id === itemId);
  if (!current) throw new Error("Item not found.");
  const item = { ...current, ...validateItemInput(input, current.checkedOut), updatedAt: at };
  return { ...state, items: state.items.map(entry => entry.id === itemId ? item : entry), transactions: [transaction({ type: "edit", item, actor, note: "Inventory record updated", at, idFactory }), ...state.transactions] };
}

export function checkoutItem(state, itemId, input, actor = "", at = isoNow(), idFactory = makeId) {
  const current = state.items.find(item => item.id === itemId);
  if (!current || current.archivedAt) throw new Error("This item is not available for checkout.");
  const quantity = integer(input.quantity);
  const borrower = text(input.borrower, 120);
  if (!borrower) throw new Error("Borrower or destination is required.");
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Checkout quantity must be at least one.");
  if (quantity > availableQuantity(current)) throw new Error(`Only ${availableQuantity(current)} unit(s) are available.`);
  const item = { ...current, checkedOut: current.checkedOut + quantity, updatedAt: at };
  return { ...state, items: state.items.map(entry => entry.id === itemId ? item : entry), transactions: [transaction({ type: "checkout", item, quantity, actor, counterparty: borrower, dueDate: input.dueDate, note: input.note, at, idFactory }), ...state.transactions] };
}

export function returnItem(state, itemId, input, actor = "", at = isoNow(), idFactory = makeId) {
  const current = state.items.find(item => item.id === itemId);
  if (!current) throw new Error("Item not found.");
  const quantity = integer(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Return quantity must be at least one.");
  if (quantity > current.checkedOut) throw new Error(`Only ${current.checkedOut} unit(s) are currently checked out.`);
  const item = { ...current, checkedOut: current.checkedOut - quantity, updatedAt: at };
  return { ...state, items: state.items.map(entry => entry.id === itemId ? item : entry), transactions: [transaction({ type: "return", item, quantity, actor, note: input.note, at, idFactory }), ...state.transactions] };
}

export function setArchived(state, itemId, archived, actor = "", at = isoNow(), idFactory = makeId) {
  const current = state.items.find(item => item.id === itemId);
  if (!current) throw new Error("Item not found.");
  if (archived && current.checkedOut > 0) throw new Error("Return all checked-out units before archiving this item.");
  const item = { ...current, archivedAt: archived ? at : null, updatedAt: at };
  return { ...state, items: state.items.map(entry => entry.id === itemId ? item : entry), transactions: [transaction({ type: archived ? "archive" : "restore", item, actor, at, idFactory }), ...state.transactions] };
}

export function normalizeImportedState(input) {
  const raw = input?.format === BACKUP_FORMAT ? input.state : input;
  if (!raw || typeof raw !== "object") throw new Error("Backup must contain an inventory state object.");
  if (raw.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported schema version. Expected ${SCHEMA_VERSION}.`);
  if (!Array.isArray(raw.items) || !Array.isArray(raw.transactions)) throw new Error("Backup is missing inventory arrays.");

  const seen = new Set();
  const items = raw.items.map(source => {
    const itemId = text(source.id, 160);
    if (!itemId || seen.has(itemId)) throw new Error("Backup contains a missing or duplicate item id.");
    seen.add(itemId);
    const checkedOut = integer(source.checkedOut);
    if (!Number.isInteger(checkedOut) || checkedOut < 0) throw new Error(`Invalid checked-out quantity for ${source.name ?? itemId}.`);
    const data = validateItemInput(source, checkedOut);
    return { id: itemId, ...data, checkedOut, createdAt: text(source.createdAt, 40) || isoNow(), updatedAt: text(source.updatedAt, 40) || isoNow(), archivedAt: source.archivedAt ? text(source.archivedAt, 40) : null };
  });

  const transactions = raw.transactions.slice(0, 10000).map(source => ({
    id: text(source.id, 160) || makeId("txn-"), itemId: text(source.itemId, 160), itemName: text(source.itemName, 120), type: text(source.type, 32),
    quantity: Math.max(0, integer(source.quantity) || 0), actor: text(source.actor, 80), counterparty: text(source.counterparty, 120), dueDate: text(source.dueDate, 32), note: text(source.note, 500), at: text(source.at, 40) || isoNow()
  }));

  return { schemaVersion: SCHEMA_VERSION, items, transactions, settings: { operator: text(raw.settings?.operator, 80) } };
}

export function createBackup(state, exportedAt = isoNow()) {
  return { format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt, state };
}
