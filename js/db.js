/* ============================================================
   mhzaly — shop database (cloud-synced with local cache)
   ============================================================ */

import { scheduleSync } from './api.js';

const LEGACY_KEY = 'mart_manager_db_v1';
const CACHE_PREFIX = 'mhzaly_db_';
const SCHEMA_VERSION = 2;

let storageKey = LEGACY_KEY;
let syncEnabled = false;

/* Shop categories offered at signup. Products are seeded by the API. */
export const SHOP_TYPES = [
  { id: 'mart', label: 'Mart / Kiryana', hint: 'Grocery, household items, drinks aur daily-use products.' },
  { id: 'mobile', label: 'Mobile Shop', hint: 'Chargers, cables, covers, earbuds aur mobile accessories.' },
  { id: 'electronics', label: 'Electronics', hint: 'Bulbs, fans, kettles, wires aur electrical items.' },
  { id: 'medical', label: 'Medical Store / Pharmacy', hint: 'Medicines, first aid, hygiene aur health products.' },
  { id: 'clothing', label: 'Clothing / Garments', hint: 'Shirts, kurtis, jeans, kids wear aur accessories.' },
  { id: 'cosmetics', label: 'Cosmetics / Beauty', hint: 'Makeup, skincare, haircare aur perfumes.' },
  { id: 'stationery', label: 'Stationery', hint: 'Pens, notebooks, school aur office items.' },
  { id: 'hardware', label: 'Hardware', hint: 'Tools, paint, locks, wires aur plumbing items.' },
  { id: 'bakery', label: 'Bakery / Food', hint: 'Bread, cakes, cookies, patties aur bakery items.' },
  { id: 'general', label: 'General Store', hint: 'Mixed daily-use products — grocery style starter list.' },
  { id: 'other', label: 'Other', hint: 'Koi aur type ki shop — starter products khali rahenge.' },
];

export function shopTypeLabel(id) {
  return SHOP_TYPES.find((type) => type.id === id)?.label || SHOP_TYPES[0].label;
}

/* Common grocery items every new shop starts with. */
export const COMMON_PRODUCTS = [
  { name: 'Daal Chana (500g)', category: 'Grocery', unit: 'pack', cost: 145, price: 180, lowStock: 10, sku: '1001' },
  { name: 'Basmati Rice 1kg', category: 'Grocery', unit: 'kg', cost: 230, price: 280, lowStock: 10, sku: '1002' },
  { name: 'Cooking Oil 1L', category: 'Grocery', unit: 'ltr', cost: 420, price: 490, lowStock: 10, sku: '1003' },
  { name: 'Sugar 1kg', category: 'Grocery', unit: 'kg', cost: 135, price: 160, lowStock: 8, sku: '1004' },
  { name: 'Tea 190g', category: 'Beverages', unit: 'pack', cost: 480, price: 560, lowStock: 6, sku: '1005' },
  { name: 'Milk Pack 1L', category: 'Dairy', unit: 'pack', cost: 235, price: 270, lowStock: 12, sku: '1006' },
  { name: 'Eggs (Dozen)', category: 'Dairy', unit: 'dozen', cost: 290, price: 340, lowStock: 5, sku: '1007' },
  { name: 'Bread Large', category: 'Bakery', unit: 'pack', cost: 130, price: 160, lowStock: 6, sku: '1008' },
  { name: 'Soap Bar', category: 'Household', unit: 'pcs', cost: 105, price: 140, lowStock: 6, sku: '1009' },
  { name: 'Detergent 1kg', category: 'Household', unit: 'pack', cost: 330, price: 410, lowStock: 5, sku: '1010' },
  { name: 'Cold Drink 1.5L', category: 'Beverages', unit: 'bottle', cost: 150, price: 190, lowStock: 8, sku: '1011' },
  { name: 'Biscuits Family Pack', category: 'Snacks', unit: 'pack', cost: 90, price: 120, lowStock: 10, sku: '1012' },
];

export function defaultSettings() {
  return {
    shopName: 'My Mart',
    ownerName: '',
    phone: '',
    shopType: 'mart',
    address: '',
    currency: 'Rs',
    taxRate: 0,
    lowStock: 5,
    receiptNote: 'Thank you for shopping with us!',
  };
}

function freshDb() {
  return {
    version: SCHEMA_VERSION,
    settings: defaultSettings(),
    products: [],
    customers: [],
    suppliers: [],
    sales: [],
    purchases: [],
    payments: [],
    returns: [],
    expenses: [],
    counters: { invoice: 1, purchase: 1 },
    createdAt: new Date().toISOString(),
  };
}

export function normalizeDb(parsed) {
  const base = freshDb();
  const data = parsed && typeof parsed === 'object' ? parsed : {};
  return {
    ...base,
    ...data,
    settings: { ...base.settings, ...(data.settings || {}) },
    counters: { ...base.counters, ...(data.counters || {}) },
    products: Array.isArray(data.products) ? data.products : [],
    customers: Array.isArray(data.customers) ? data.customers : [],
    suppliers: Array.isArray(data.suppliers) ? data.suppliers : [],
    sales: Array.isArray(data.sales) ? data.sales : [],
    purchases: Array.isArray(data.purchases) ? data.purchases : [],
    payments: Array.isArray(data.payments) ? data.payments : [],
    returns: Array.isArray(data.returns) ? data.returns : [],
    expenses: Array.isArray(data.expenses) ? data.expenses : [],
  };
}

export let db = load();

function load() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return freshDb();
    return normalizeDb(JSON.parse(raw));
  } catch (err) {
    console.error('Could not read local data, starting fresh.', err);
    return freshDb();
  }
}

/** Point the app at a shop cache (or demo cache) before loading data. */
export function configureShop({ shopId = null, demo = false } = {}) {
  syncEnabled = Boolean(shopId) && !demo;
  storageKey = demo ? `${CACHE_PREFIX}demo` : shopId ? `${CACHE_PREFIX}${shopId}` : LEGACY_KEY;
  db = load();
  return db;
}

/** Replace in-memory data with the server copy and refresh local cache. */
export function hydrate(remoteData) {
  db = normalizeDb(remoteData);
  writeLocal();
}

export function isSyncEnabled() { return syncEnabled; }

function writeLocal() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(db));
  } catch (err) {
    console.error('Could not save local cache.', err);
  }
}

export function save() {
  writeLocal();
  if (syncEnabled) scheduleSync(JSON.stringify(db));
}

export async function loadSampleData({ demo = false } = {}) {
  seedCommonProducts();
  if (demo) seedDemoActivity();
  return db;
}

export function seedDemoActivity() {
  if (db.sales.length || db.customers.length || db.expenses.length) return 0;
  const products = db.products.slice(0, 12);
  if (products.length < 3) return 0;
  const now = Date.now();
  const mkSale = (n, customer, phone, picks, pay, daysAgo) => {
    const items = picks.map(([idx, qty]) => {
      const p = products[idx % products.length];
      p.stock = Math.max(0, (Number(p.stock) || 0) - qty);
      return { id: p.id, name: p.name, price: Number(p.price) || 0, qty };
    });
    const subtotal = items.reduce((a, it) => a + it.qty * it.price, 0);
    return {
      id: uid('sale'),
      invoiceNo: `INV-${String(n).padStart(6, '0')}`,
      customerName: customer,
      customerPhone: phone,
      items,
      subtotal,
      tax: 0,
      taxRate: 0,
      total: subtotal,
      paymentMethod: pay,
      createdAt: new Date(now - daysAgo * 86400000).toISOString(),
    };
  };
  const stamp = new Date(now).toISOString();
  db.customers = [
    { id: uid('cus'), name: 'Ali Khan', phone: '03001234567', balance: 1200, createdAt: stamp },
    { id: uid('cus'), name: 'Sara Ahmed', phone: '03219876543', balance: 0, createdAt: stamp },
  ];
  db.sales = [
    mkSale(1, 'Ali Khan', '03001234567', [[0, 2], [1, 1]], 'Cash', 0),
    mkSale(2, 'Sara Ahmed', '03219876543', [[5, 2], [7, 1]], 'Card', 0),
    mkSale(3, 'Ali Khan', '03001234567', [[3, 3]], 'Cash', 1),
    mkSale(4, 'Bilal', '', [[2, 1], [8, 2]], 'Online', 2),
    mkSale(5, 'Sara Ahmed', '03219876543', [[6, 1], [10, 2]], 'Cash', 3),
  ];
  db.expenses = [
    { id: uid('exp'), title: 'Transport', category: 'Transport', amount: 500, note: 'Delivery', createdAt: stamp },
    { id: uid('exp'), title: 'Shop rent', category: 'Rent', amount: 15000, note: 'Monthly', createdAt: new Date(now - 86400000).toISOString() },
  ];
  save();
  return db.sales.length;
}

export function seedCommonProducts() {
  const existing = new Set(db.products.map((p) => String(p.name || '').toLowerCase()));
  const now = new Date().toISOString();
  let added = 0;
  COMMON_PRODUCTS.forEach((item) => {
    if (existing.has(item.name.toLowerCase())) return;
    db.products.push({
      id: uid('prd'),
      name: item.name,
      sku: item.sku,
      category: item.category,
      unit: item.unit,
      cost: item.cost,
      price: item.price,
      stock: 10,
      lowStock: item.lowStock,
      createdAt: now,
      updatedAt: now,
    });
    added += 1;
  });
  if (added) save();
  return added;
}

export function replaceDb(next) {
  db = { ...freshDb(), ...next };
  save();
}

export function exportDb() {
  return JSON.stringify(db, null, 2);
}

export function importDb(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid backup file');
  if (!Array.isArray(parsed.products) || !Array.isArray(parsed.sales)) {
    throw new Error('This file does not look like a Mart Manager backup');
  }
  const base = freshDb();
  db = {
    ...base,
    ...parsed,
    settings: { ...base.settings, ...(parsed.settings || {}) },
    counters: { ...base.counters, ...(parsed.counters || {}) },
  };
  save();
  return db;
}

export function clearAll() {
  db = freshDb();
  save();
}

let uidCounter = 0;
export function uid(prefix) {
  uidCounter += 1;
  return `${prefix}_${Date.now()}_${uidCounter}`;
}

/* ---------- reports helpers ---------- */

export function lowStockProducts() {
  return db.products.filter((p) => (p.stock ?? 0) <= (p.lowStock ?? 5));
}

export function totalReceivable() {
  return db.customers.reduce((sum, c) => sum + Math.max(0, Number(c.balance) || 0), 0);
}

export function totalSales() {
  return db.sales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
}

export function totalProfit() {
  let profit = 0;
  for (const s of db.sales) {
    if (Array.isArray(s.items) && s.items.length) {
      for (const it of s.items) {
        const p = db.products.find((pr) => pr.id === it.id || pr.id === it.productId);
        const cost = p ? Number(p.cost) || 0 : 0;
        const qty = Number(it.qty) || 1;
        profit += ((Number(it.price) || 0) - cost) * qty;
      }
    } else {
      const p = db.products.find((pr) => pr.id === s.productId);
      const cost = p ? Number(p.cost) || 0 : 0;
      profit += (Number(s.total) || 0) - cost * (Number(s.qty) || 1);
    }
  }
  return profit;
}
