// IndexedDB katmanı
const DB_NAME = 'ggmt-db';
const DB_VERSION = 1;
const STORE_PRODUCTS = 'products';
const STORE_LINES = 'lines';
const STORE_META = 'meta';

let _db;

export async function openDb() {
  if (_db) return _db;
  _db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
        const os = db.createObjectStore(STORE_PRODUCTS, { keyPath: 'code' }); // code = barkod veya ana barkod
        os.createIndex('name', 'name', { unique: false });
        os.createIndex('price', 'price', { unique: false });
        os.createIndex('shortCode', 'shortCode', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_LINES)) {
        const os = db.createObjectStore(STORE_LINES, { keyPath: 'id', autoIncrement: true });
        os.createIndex('ts', 'ts', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _db;
}

function tx(store, mode='readonly') {
  const t = _db.transaction(store, mode);
  return [t.objectStore(store), t];
}

// PRODUCTS
export async function upsertProducts(arr) {
  await openDb();
  const [os, t] = tx(STORE_PRODUCTS, 'readwrite');
  for (const p of arr) os.put(p);
  await new Promise(r => t.oncomplete = r);
}
export async function getProductByBarcodeOrShort(code) {
  await openDb();
  // sayısal değilse direkt reddet
  if (!/^\d+$/.test(code)) return null;

  const [os] = tx(STORE_PRODUCTS);
  // Önce code (barkod/ana) ile ara
  const p = await new Promise((resolve) => {
    const r = os.get(code);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => resolve(null);
  });
  if (p) return p;

  // shortCode index
  const idx = os.index('shortCode');
  return await new Promise((resolve) => {
    const r = idx.get(code);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => resolve(null);
  });
}

export async function countProducts() {
  await openDb();
  const [os] = tx(STORE_PRODUCTS);
  return await new Promise((resolve) => {
    const r = os.count();
    r.onsuccess = () => resolve(r.result || 0);
    r.onerror = () => resolve(0);
  });
}

export async function clearProducts() {
  await openDb();
  const [os, t] = tx(STORE_PRODUCTS, 'readwrite');
  os.clear();
  await new Promise(r => t.oncomplete = r);
}

// LINES
export async function addLine(line) {
  await openDb();
  const [os, t] = tx(STORE_LINES, 'readwrite');
  os.add({ ...line, ts: Date.now() });
  await new Promise(r => t.oncomplete = r);
}
export async function undoLastLine() {
  await openDb();
  const [os] = tx(STORE_LINES);
  const idx = os.index('ts');
  const req = idx.openCursor(null, 'prev');
  const id = await new Promise(resolve => {
    req.onsuccess = () => {
      const c = req.result;
      resolve(c ? c.primaryKey : null);
    };
    req.onerror = () => resolve(null);
  });
  if (id == null) return false;
  const [os2, t2] = tx(STORE_LINES, 'readwrite');
  os2.delete(id);
  await new Promise(r => t2.oncomplete = r);
  return true;
}
export async function getAllLines() {
  await openDb();
  const [os] = tx(STORE_LINES);
  const out = [];
  return await new Promise((resolve) => {
    const req = os.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) { out.push(c.value); c.continue(); }
      else resolve(out);
    };
    req.onerror = () => resolve(out);
  });
}
export async function clearLines() {
  await openDb();
  const [os, t] = tx(STORE_LINES, 'readwrite');
  os.clear();
  await new Promise(r => t.oncomplete = r);
}

// META
export async function setMeta(key, value) {
  await openDb();
  const [os, t] = tx(STORE_META, 'readwrite');
  os.put({ key, value });
  await new Promise(r => t.oncomplete = r);
}
export async function getMeta(key, def=null) {
  await openDb();
  const [os] = tx(STORE_META);
  return await new Promise((resolve) => {
    const r = os.get(key);
    r.onsuccess = () => resolve(r.result ? r.result.value : def);
    r.onerror = () => resolve(def);
  });
}
