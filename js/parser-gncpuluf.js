import { upsertProducts, setMeta, countProducts } from './db.js';

// GNCPULUF blok yapısı (örnek):
// 1;KOD;İSİM;...  -> ürün isim satırı
// 3;KOD;BARKOD;.. -> bir ürüne ait bir barkod satırı (birden fazla olabilir)
// 4;0;KOD;1;FIYAT;FIYAT;0 -> fiyat bilgisi
// 5;... -> bizde kullanılmıyor (yok say)

// Sadece sayısal barkod / kısa kod geçerli. Noktalı stok kodları kullanılmaz.
function pickShortNumeric(fields) {
  // Alanlar içinde tamamen sayısal ve 3-8 hane arası olanı kısa kod olarak al (ihtiyaca göre)
  for (const f of fields) {
    if (/^\d{3,8}$/.test(f)) return f;
  }
  return null;
}

export async function importGTFText(text) {
  const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);

  let current = { name: null, price: null, barcodes: [], shortCode: null };
  const products = new Map(); // key=ana barkod veya short; value product

  function flushCurrent() {
    if (!current.name || (!current.price && current.price !== 0) || current.barcodes.length === 0)
      return;
    // Her barkod için kayıt aç
    for (const bc of current.barcodes) {
      products.set(bc, {
        code: bc,
        name: current.name,
        price: Number(current.price),
        shortCode: current.shortCode || null,
        barcodes: current.barcodes.slice(0)
      });
    }
    // Kısa kod varsa onu da işaretle (lookup için)
    if (current.shortCode) {
      // Ana kaydı kısa kod üzerinden de erişilebilir kıl
      products.set(current.shortCode, {
        code: current.shortCode,
        name: current.name,
        price: Number(current.price),
        shortCode: current.shortCode,
        barcodes: current.barcodes.slice(0)
      });
    }
  }

  for (const raw of lines) {
    const parts = raw.split(';');
    const type = parts[0];

    if (type === '1') {
      // Yeni ürün bloğu başlıyor → önce mevcut varsa yaz
      if (current.barcodes.length) flushCurrent();
      current = { name: null, price: null, barcodes: [], shortCode: null };

      // 1;KOD;İSİM;...
      const name = (parts[2] || '').trim();
      current.name = name || null;

      // 1. satırda sayısal kısa kod var mı yakala (biz noktalıları almıyoruz)
      const short = pickShortNumeric(parts.slice(1, 5));
      if (short) current.shortCode = short;

    } else if (type === '3') {
      // 3;KOD;BARKOD;...
      const bc = (parts[2] || '').trim();
      if (/^\d+$/.test(bc)) current.barcodes.push(bc);

    } else if (type === '4') {
      // 4;0;KOD;1;FIYAT;FIYAT;0
      const priceCandidate = (parts[4] || '').replace(',', '.');
      const n = Number(priceCandidate);
      if (!Number.isNaN(n)) current.price = n;

      // 4. satırda da kısa kod yakalanırsa al
      const short = pickShortNumeric(parts.slice(1, 6));
      if (short && !current.shortCode) current.shortCode = short;

    } else {
      // 2 ve 5 vs. kullanılmıyor
    }
  }
  // Son blok
  if (current.barcodes.length) flushCurrent();

  // DB'ye yaz
  await upsertProducts([...products.values()]);
  await setMeta('productCount', await countProducts());
}
