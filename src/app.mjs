import { availableQuantity, checkoutItem, createBackup, createItem, editItem, emptyState, itemStatus, normalizeImportedState, returnItem, setArchived } from "./domain.mjs";
import { loadState, saveState } from "./storage.mjs";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const elements = {
  list: $("#inventory-list"), empty: $("#inventory-empty"), activity: $("#activity-list"), activityEmpty: $("#activity-empty"),
  search: $("#search"), category: $("#filter-category"), location: $("#filter-location"), status: $("#filter-status"), operator: $("#operator"),
  itemDialog: $("#item-dialog"), itemForm: $("#item-form"), checkoutDialog: $("#checkout-dialog"), checkoutForm: $("#checkout-form"), returnDialog: $("#return-dialog"), returnForm: $("#return-form"), toast: $("#toast")
};

let state = emptyState();
let toastTimer;

function node(tag, options = {}, children = []) {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) if (value !== undefined && value !== null) element.setAttribute(name, String(value));
  for (const child of children) element.append(child);
  return element;
}

const safeDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
};

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 3600);
}

const operator = () => elements.operator.value.trim() || "Local operator";

async function commit(nextState, message) {
  state = nextState;
  state.settings.operator = elements.operator.value.trim().slice(0, 80);
  await saveState(state);
  render();
  if (message) showToast(message);
}

function renderSummary() {
  const active = state.items.filter(item => !item.archivedAt);
  $("#metric-items").textContent = active.length;
  $("#metric-units").textContent = active.reduce((sum, item) => sum + item.quantity, 0);
  $("#metric-out").textContent = active.reduce((sum, item) => sum + item.checkedOut, 0);
  $("#metric-low").textContent = active.filter(item => ["low", "out"].includes(itemStatus(item))).length;
}

function refreshFilterOptions() {
  const previousCategory = elements.category.value;
  const previousLocation = elements.location.value;
  const setOptions = (select, values, placeholder, previous) => {
    select.replaceChildren(node("option", { text: placeholder, attrs: { value: "" } }));
    [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)).forEach(value => select.append(node("option", { text: value, attrs: { value } })));
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
  };
  const active = state.items.filter(item => !item.archivedAt);
  setOptions(elements.category, active.map(item => item.category), "All categories", previousCategory);
  setOptions(elements.location, active.map(item => item.location), "All locations", previousLocation);
}

function actionButton(label, action, item, extraClass = "") {
  return node("button", { className: `button compact ${extraClass}`.trim(), text: label, attrs: { type: "button", "data-action": action, "data-id": item.id } });
}

function renderInventory() {
  refreshFilterOptions();
  const query = elements.search.value.trim().toLowerCase();
  const category = elements.category.value;
  const location = elements.location.value;
  const status = elements.status.value;
  const rows = state.items.filter(item => {
    const haystack = [item.name, item.sku, item.category, item.location, item.notes].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (!category || item.category === category) && (!location || item.location === location) && (!status || itemStatus(item) === status);
  }).sort((a, b) => Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt)) || a.name.localeCompare(b.name));

  elements.list.replaceChildren();
  for (const item of rows) {
    const statusValue = itemStatus(item);
    const initials = item.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "I";
    const title = node("div", { className: "item-title" }, [
      node("span", { className: "item-avatar", text: initials, attrs: { "aria-hidden": "true" } }),
      node("span", {}, [node("strong", { text: item.name }), node("small", { text: [item.sku, item.category].filter(Boolean).join(" · ") || "Uncategorized" })])
    ]);
    const availability = node("div", { className: "quantity" }, [node("strong", { text: `${availableQuantity(item)} / ${item.quantity}` }), node("small", { className: "muted", text: `${item.checkedOut} checked out` })]);
    const actions = node("div", { className: "actions" });
    if (!item.archivedAt) {
      const checkout = actionButton("Check out", "checkout", item, "primary");
      checkout.disabled = availableQuantity(item) === 0;
      const returnButton = actionButton("Return", "return", item);
      returnButton.disabled = item.checkedOut === 0;
      actions.append(checkout, returnButton, actionButton("Edit", "edit", item), actionButton("Archive", "archive", item, "danger"));
    } else {
      actions.append(actionButton("Restore", "restore", item), actionButton("Edit", "edit", item));
    }
    const statusLabel = statusValue === "low" ? "Low" : statusValue === "out" ? "Checked out" : statusValue[0].toUpperCase() + statusValue.slice(1);
    elements.list.append(node("tr", {}, [
      node("td", {}, [title]), node("td", {}, [availability]), node("td", { text: item.location || "—" }),
      node("td", {}, [node("span", { className: `badge ${statusValue}`, text: statusLabel })]), node("td", {}, [actions])
    ]));
  }
  elements.empty.hidden = rows.length > 0;
}

const typeLabel = type => ({ create: "Created", edit: "Updated", checkout: "Checked out", return: "Returned", archive: "Archived", restore: "Restored" }[type] ?? type);

function renderActivity() {
  elements.activity.replaceChildren();
  for (const entry of state.transactions.slice(0, 500)) {
    const detail = [];
    if (entry.quantity) detail.push(`${entry.quantity} unit${entry.quantity === 1 ? "" : "s"}`);
    if (entry.counterparty) detail.push(`to ${entry.counterparty}`);
    if (entry.dueDate) detail.push(`due ${entry.dueDate}`);
    if (entry.note) detail.push(entry.note);
    elements.activity.append(node("article", { className: "activity-entry" }, [
      node("time", { text: safeDate(entry.at), attrs: { datetime: entry.at } }),
      node("div", {}, [node("strong", { text: typeLabel(entry.type) }), node("small", { text: entry.actor || "Local operator" })]),
      node("div", {}, [node("strong", { text: entry.itemName || "Inventory item" }), node("small", { text: detail.join(" · ") || "Record changed" })]),
      node("span", { className: "badge", text: entry.type })
    ]));
  }
  elements.activityEmpty.hidden = state.transactions.length > 0;
}

function render() { renderSummary(); renderInventory(); renderActivity(); }

function showView(view) {
  $$(".view").forEach(section => { section.hidden = section.id !== `view-${view}`; });
  $$(".nav-tab").forEach(button => button.classList.toggle("is-active", button.dataset.view === view));
}

function itemById(itemId) {
  const item = state.items.find(entry => entry.id === itemId);
  if (!item) throw new Error("Item not found.");
  return item;
}

function openItemDialog(item = null) {
  $("#item-dialog-title").textContent = item ? "Edit item" : "Add item";
  $("#item-id").value = item?.id ?? "";
  $("#item-name").value = item?.name ?? "";
  $("#item-sku").value = item?.sku ?? "";
  $("#item-category").value = item?.category ?? "";
  $("#item-location").value = item?.location ?? "";
  $("#item-quantity").value = item?.quantity ?? 1;
  $("#item-reorder").value = item?.reorderPoint ?? 0;
  $("#item-notes").value = item?.notes ?? "";
  $("#item-form-error").hidden = true;
  elements.itemDialog.showModal();
  $("#item-name").focus();
}

function openCheckout(item) {
  $("#checkout-item-id").value = item.id;
  $("#checkout-item-label").textContent = `${item.name} · ${availableQuantity(item)} of ${item.quantity} available`;
  $("#checkout-quantity").value = 1;
  $("#checkout-quantity").max = availableQuantity(item);
  $("#checkout-borrower").value = "";
  $("#checkout-due").value = "";
  $("#checkout-note").value = "";
  $("#checkout-form-error").hidden = true;
  elements.checkoutDialog.showModal();
  $("#checkout-borrower").focus();
}

function openReturn(item) {
  $("#return-item-id").value = item.id;
  $("#return-item-label").textContent = `${item.name} · ${item.checkedOut} unit(s) currently checked out`;
  $("#return-quantity").value = 1;
  $("#return-quantity").max = item.checkedOut;
  $("#return-note").value = "";
  $("#return-form-error").hidden = true;
  elements.returnDialog.showModal();
  $("#return-quantity").focus();
}

function formError(selector, error) {
  const target = $(selector);
  target.textContent = error instanceof Error ? error.message : String(error);
  target.hidden = false;
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = node("a", { attrs: { href: url, download: filename } });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  let content = String(value ?? "");
  if (/^[=+\-@]/.test(content)) content = `'${content}`;
  return `"${content.replaceAll('"', '""')}"`;
}

function exportCsv() {
  const header = ["Name", "SKU", "Category", "Location", "Total quantity", "Checked out", "Available", "Low-stock threshold", "Status", "Notes"];
  const rows = state.items.map(item => [item.name, item.sku, item.category, item.location, item.quantity, item.checkedOut, availableQuantity(item), item.reorderPoint, itemStatus(item), item.notes]);
  download(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows].map(row => row.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
}

async function loadSample() {
  const sample = [
    { name: "Sony FX3", sku: "CAM-001", category: "Camera", location: "Production cage", quantity: 2, reorderPoint: 0, notes: "Full-frame cinema camera" },
    { name: "Rode Wireless PRO", sku: "AUD-014", category: "Audio", location: "Production cage", quantity: 4, reorderPoint: 1, notes: "Two-channel wireless microphone kit" },
    { name: "Cargo e-bike", sku: "BIKE-003", category: "Transport", location: "Garage", quantity: 1, reorderPoint: 0, notes: "Battery stored with vehicle" },
    { name: "Meeting Room Atlas", sku: "ROOM-ATLAS", category: "Room", location: "Floor 2", quantity: 1, reorderPoint: 0, notes: "8 seats, display and video conferencing" },
    { name: "MacBook Pro 14", sku: "IT-021", category: "Computer", location: "IT cabinet", quantity: 3, reorderPoint: 1, notes: "Shared loaner pool" }
  ];
  const existingSkus = new Set(state.items.map(item => item.sku));
  let next = state;
  let added = 0;
  for (const input of sample) {
    if (existingSkus.has(input.sku)) continue;
    next = createItem(next, input, operator());
    added += 1;
  }
  if (!added) return showToast("Sample items are already present.");
  await commit(next, `Added ${added} sample item${added === 1 ? "" : "s"}.`);
}

$("#add-item").addEventListener("click", () => openItemDialog());
$$(".nav-tab").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
$$('[data-close]').forEach(button => button.addEventListener("click", () => document.getElementById(button.dataset.close).close()));
[elements.search, elements.category, elements.location, elements.status].forEach(control => control.addEventListener("input", renderInventory));

elements.list.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const item = itemById(button.dataset.id);
  try {
    if (button.dataset.action === "edit") openItemDialog(item);
    if (button.dataset.action === "checkout") openCheckout(item);
    if (button.dataset.action === "return") openReturn(item);
    if (button.dataset.action === "archive" && confirm(`Archive ${item.name}? Its history will be preserved.`)) await commit(setArchived(state, item.id, true, operator()), "Item archived.");
    if (button.dataset.action === "restore") await commit(setArchived(state, item.id, false, operator()), "Item restored.");
  } catch (error) { showToast(error.message); }
});

elements.itemForm.addEventListener("submit", async event => {
  event.preventDefault();
  const input = { name: $("#item-name").value, sku: $("#item-sku").value, category: $("#item-category").value, location: $("#item-location").value, quantity: $("#item-quantity").value, reorderPoint: $("#item-reorder").value, notes: $("#item-notes").value };
  try {
    const itemId = $("#item-id").value;
    await commit(itemId ? editItem(state, itemId, input, operator()) : createItem(state, input, operator()), itemId ? "Item updated." : "Item added.");
    elements.itemDialog.close();
  } catch (error) { formError("#item-form-error", error); }
});

elements.checkoutForm.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const itemId = $("#checkout-item-id").value;
    const next = checkoutItem(state, itemId, { quantity: $("#checkout-quantity").value, borrower: $("#checkout-borrower").value, dueDate: $("#checkout-due").value, note: $("#checkout-note").value }, operator());
    await commit(next, "Checkout recorded.");
    elements.checkoutDialog.close();
  } catch (error) { formError("#checkout-form-error", error); }
});

elements.returnForm.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const itemId = $("#return-item-id").value;
    await commit(returnItem(state, itemId, { quantity: $("#return-quantity").value, note: $("#return-note").value }, operator()), "Return recorded.");
    elements.returnDialog.close();
  } catch (error) { formError("#return-form-error", error); }
});

elements.operator.addEventListener("change", async () => {
  state.settings.operator = elements.operator.value.trim().slice(0, 80);
  await saveState(state);
  showToast("Operator label saved locally.");
});

$("#export-json").addEventListener("click", () => download(`inventory-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(createBackup(state), null, 2), "application/json"));
$("#export-csv").addEventListener("click", exportCsv);
$("#load-sample").addEventListener("click", loadSample);
$("#import-json").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error("Backup is larger than the 5 MB import limit.");
    const imported = normalizeImportedState(JSON.parse(await file.text()));
    if (!confirm(`Replace local data with ${imported.items.length} imported item(s)? Export a backup first if needed.`)) return;
    elements.operator.value = imported.settings.operator;
    await commit(imported, "Backup restored.");
  } catch (error) { showToast(`Import failed: ${error.message}`); }
});

async function bootstrap() {
  try {
    const stored = await loadState();
    if (stored) state = normalizeImportedState(stored);
    else {
      const legacyName = (() => { try { return localStorage.getItem("userName") ?? ""; } catch { return ""; } })();
      state = emptyState(legacyName);
      await saveState(state);
    }
    elements.operator.value = state.settings.operator;
    render();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(error => console.warn("Service worker registration failed.", error));
  } catch (error) {
    console.error(error);
    showToast(`Inventory could not start: ${error.message}`);
    state = emptyState();
    render();
  }
}

bootstrap();
