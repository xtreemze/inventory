import test from "node:test";
import assert from "node:assert/strict";
import { availableQuantity, checkoutItem, createBackup, createItem, editItem, emptyState, itemStatus, normalizeImportedState, returnItem, setArchived } from "../src/domain.mjs";

function ids() {
  let sequence = 0;
  return prefix => `${prefix}${++sequence}`;
}

const input = { name: "Camera", sku: "CAM-1", category: "Production", location: "Cage", quantity: 2, reorderPoint: 1, notes: "" };

test("creates inventory and records an audit event", () => {
  const state = createItem(emptyState("Carlos"), input, "Carlos", "2026-09-11T00:00:00.000Z", ids());
  assert.equal(state.items.length, 1);
  assert.equal(state.transactions[0].type, "create");
  assert.equal(availableQuantity(state.items[0]), 2);
  assert.equal(itemStatus(state.items[0]), "available");
});

test("checkout and return enforce stock bounds", () => {
  const idFactory = ids();
  let state = createItem(emptyState(), input, "Operator", "2026-09-11T00:00:00.000Z", idFactory);
  const itemId = state.items[0].id;
  state = checkoutItem(state, itemId, { quantity: 1, borrower: "Studio A", dueDate: "2026-09-20", note: "Shoot" }, "Operator", "2026-09-11T01:00:00.000Z", idFactory);
  assert.equal(state.items[0].checkedOut, 1);
  assert.equal(availableQuantity(state.items[0]), 1);
  assert.equal(itemStatus(state.items[0]), "low");
  assert.throws(() => checkoutItem(state, itemId, { quantity: 2, borrower: "Studio B" }, "Operator", undefined, idFactory), /Only 1 unit/);
  state = returnItem(state, itemId, { quantity: 1, note: "Returned clean" }, "Operator", "2026-09-12T01:00:00.000Z", idFactory);
  assert.equal(state.items[0].checkedOut, 0);
  assert.throws(() => returnItem(state, itemId, { quantity: 1 }, "Operator", undefined, idFactory), /Only 0 unit/);
});

test("cannot shrink or archive inventory below outstanding checkouts", () => {
  const idFactory = ids();
  let state = createItem(emptyState(), input, "Operator", undefined, idFactory);
  const itemId = state.items[0].id;
  state = checkoutItem(state, itemId, { quantity: 2, borrower: "Field team" }, "Operator", undefined, idFactory);
  assert.throws(() => editItem(state, itemId, { ...input, quantity: 1 }, "Operator", undefined, idFactory), /cannot be lower/);
  assert.throws(() => setArchived(state, itemId, true, "Operator", undefined, idFactory), /Return all checked-out/);
});

test("backup round-trip validates and preserves state", () => {
  const state = createItem(emptyState("Operator"), input, "Operator", "2026-09-11T00:00:00.000Z", ids());
  const backup = createBackup(state, "2026-09-11T02:00:00.000Z");
  assert.deepEqual(normalizeImportedState(backup), state);
});

test("rejects malformed or unsupported backups", () => {
  assert.throws(() => normalizeImportedState({ schemaVersion: 1, items: [], transactions: [] }), /Unsupported schema version/);
  assert.throws(() => normalizeImportedState({ schemaVersion: 2, items: [{ ...input, id: "x", checkedOut: 3 }], transactions: [] }), /cannot be lower/);
});
