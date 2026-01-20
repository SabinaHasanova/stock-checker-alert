import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = process.env.DB_FILE || path.resolve(DATA_DIR, 'db.sqlite');
const db = new Database(DB_FILE);

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      url TEXT,
      size TEXT,
      status INTEGER DEFAULT 1,
      price REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS check_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      checked_at TEXT DEFAULT (datetime('now')),
      in_stock INTEGER,
      price REAL,
      error TEXT
    );
  `);

  migrateStoresFromFile();
  migrateProductsFromFile();
}

function migrateStoresFromFile() {
  try {
    const count = db.prepare('SELECT COUNT(1) as c FROM stores').get().c;
    if (count > 0) return; // already migrated

    const storesPath = path.resolve(process.cwd(), process.env.STORES_FILE || 'stores.json');
    if (!fs.existsSync(storesPath)) return; // nothing to migrate

    const raw = fs.readFileSync(storesPath, 'utf8');
    const stores = JSON.parse(raw || '[]');
    if (!Array.isArray(stores)) return;

    const insert = db.prepare('INSERT OR REPLACE INTO stores (slug, name, enabled) VALUES (?, ?, ?)');
    const insertMany = db.transaction((items) => {
      for (const s of items) {
        if (!s || !s.slug || !s.name) continue;
        insert.run(s.slug, s.name, s.enabled === false ? 0 : 1);
      }
    });

    insertMany(stores);
  } catch (err) {
    console.error('db migration error:', err.message);
  }
}

function migrateProductsFromFile() {
  try {
    const count = db.prepare('SELECT COUNT(1) as c FROM products').get().c;
    if (count > 0) return; // already migrated

    const productsPath = path.resolve(process.cwd(), process.env.PRODUCTS_FILE || 'products.json');
    if (!fs.existsSync(productsPath)) return; // nothing to migrate

    const raw = fs.readFileSync(productsPath, 'utf8');
    const products = JSON.parse(raw || '[]');
    if (!Array.isArray(products)) return;

    const insertWithId = db.prepare('INSERT OR REPLACE INTO products (id, user_id, url, size, status, price) VALUES (?, ?, ?, ?, ?, ?)');
    const insert = db.prepare('INSERT INTO products (user_id, url, size, status, price) VALUES (?, ?, ?, ?, ?)');

    const insertMany = db.transaction((items) => {
      for (const p of items) {
        if (!p || !p.url) continue;
        const userId = p.userId ?? p.user_id ?? null;
        const size = p.size ?? null;
        const status = typeof p.status === 'number' ? p.status : (p.status ? 1 : 0);
        const price = typeof p.price === 'number' ? p.price : (p.price ? Number(p.price) : 0);

        if (p.id) {
          insertWithId.run(p.id, userId, p.url, size, status, price);
        } else {
          insert.run(userId, p.url, size, status, price);
        }
      }
    });

    insertMany(products);
    console.log('Migrated products.json into SQLite DB (products table).');
  } catch (err) {
    console.error('db products migration error:', err.message);
  }
}

export function getStores() {
  try {
    return db.prepare('SELECT slug, name, enabled FROM stores WHERE enabled = 1').all();
  } catch (err) {
    console.error('getStores error:', err.message);
    return [];
  }
}

export function addOrUpdateStore({ slug, name, enabled = 1 }) {
  try {
    db.prepare('INSERT OR REPLACE INTO stores (slug, name, enabled) VALUES (?, ?, ?)').run(slug, name, enabled ? 1 : 0);
    return true;
  } catch (err) {
    console.error('addOrUpdateStore error:', err.message);
    return false;
  }
}

export function getProductsForCheck() {
  return db.prepare('SELECT * FROM products WHERE status = 1').all();
}

export function getAllProducts() {
  return db.prepare('SELECT * FROM products').all();
}

export function getProductsByUser(userId) {
  try {
    return db.prepare('SELECT * FROM products WHERE user_id = ?').all(userId);
  } catch (err) {
    console.error('getProductsByUser error:', err.message);
    return [];
  }
}

export function getProductsByUserAndStatus(userId, status) {
  try {
    return db.prepare('SELECT * FROM products WHERE user_id = ? AND status = ?').all(userId, status);
  } catch (err) {
    console.error('getProductsByUserAndStatus error:', err.message);
    return [];
  }
}

export function addCheckLog({ productId = null, inStock = 0, price = null, error = null } = {}) {
  try {
    const stmt = db.prepare('INSERT INTO check_logs (product_id, in_stock, price, error) VALUES (?, ?, ?, ?)');
    const info = stmt.run(productId, inStock ? 1 : 0, price, error);
    return info.lastInsertRowid;
  } catch (err) {
    console.error('addCheckLog error:', err.message);
    return null;
  }
}

export function getCheckLogs(productId, limit = 10) {
  try {
    return db.prepare('SELECT id, checked_at, in_stock, price, error FROM check_logs WHERE product_id = ? ORDER BY checked_at DESC LIMIT ?').all(productId, limit);
  } catch (err) {
    console.error('getCheckLogs error:', err.message);
    return [];
  }
}

export function closeDB() {
  try {
    db.close();
  } catch (err) {
    console.error('Error closing DB:', err.message);
  }
}

export function addProduct(p) {
  const stmt = db.prepare('INSERT INTO products (user_id, url, size, status, price) VALUES (?, ?, ?, ?, ?)');
  const info = stmt.run(p.userId, p.url, p.size, p.status ?? 1, p.price ?? 0);
  return info.lastInsertRowid;
}

export function updateProduct(product) {
  const stmt = db.prepare('UPDATE products SET url = ?, size = ?, status = ?, price = ? WHERE id = ?');
  stmt.run(product.url, product.size, product.status, product.price, product.id);
}

export function deleteProduct(id) {
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
}

initDB();
