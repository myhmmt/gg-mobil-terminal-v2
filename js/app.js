import {
  openDb, getProductByBarcodeOrShort, countProducts,
  addLine, getAllLines, clearLines, undoLastLine,
  clearProducts, setMeta, getMeta
} from './db.js';
import { importGTFText } from './parser-gncpuluf.js';
import { exportAsTxt } from './export-txt.js';
import { exportAsPdf } from './export-pdf.js';
import { startCamera, stopCamera } from './scanner.js';

// Elements
const el = (id)=>document.getElementById(id);

const codeInput = el('codeInput');
const qtyInput = el('qtyInput');
const foundName = el('foundName');
const foundPrice = el('foundPrice');
const productCountBadge = el('productCountBadge');
const linesTbody = el('linesTbody');
const totalsCell = el('totalsCell');

const beep = new Audio('assets/beep.ogg');
const errS = new Audio('assets/error.ogg');

let firstQtyKeyReplaces = true; // ilk tuşta overwrite kuralı

// INIT
window.addEventListener('DOMContentLoaded', async () => {
  await openDb();
  await refreshProductCount();
  await renderLines();

  // UI bağla
  el('btnStart').onclick = () => startCamera();
  el('btnStop').onclick  = () => stopCamera();
  el('btnSingle').onclick= () => startCamera({ once:true });

  el('btnClearCode').onclick = () => { codeInput.value=''; codeInput.focus(); };
  el('btnConfirmCode').onclick = () => confirmCode();

  el('btnMinus').onclick = () => stepQty(-1);
  el('btnPlus').onclick  = () => stepQty(+1);
  el('btnAdd').onclick   = () => addCurrentLine();
  el('btnUndo').onclick  = () => undo();

  el('btnExportTxt').onclick = () => exportAsTxt(fileName());
  el('btnExportPdf').onclick = () => exportAsPdf(fileName());
  el('btnClearList').onclick = async () => {
    if (confirm('Listedeki tüm satırlar silinsin mi?')) {
      await clearLines(); await renderLines();
    }
  };

  // Dosya yükleme
  el('btnClearProducts').onclick = async () => {
    if (confirm('Tüm ürün verisi silinsin mi?')) {
      await clearProducts(); await setMeta('productCount', 0);
      await refreshProductCount();
    }
  };
  el('fileInput').addEventListener('change', onFileSelected);

  // İsimle arama
  el('searchInput').addEventListener('input', onSearchInput);

  // Klavye davranışları
  codeInput.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter') { e.preventDefault(); confirmCode(); }
  });
  qtyInput.addEventListener('focus', ()=>{
    qtyInput.select();
    firstQtyKeyReplaces = true;
  });
  qtyInput.addEventListener('keydown', (e)=>{
    if (!/^\d$/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Enter' && e.key !== 'Tab') return;
    if (/^\d$/.test(e.key) && firstQtyKeyReplaces) {
      // ilk rakam overwrite yapsın
      e.preventDefault();
      qtyInput.value = e.key;
      firstQtyKeyReplaces = false;
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); addCurrentLine(); }
  });

  // Başlangıç focus
  codeInput.focus();
});

// SCAN callback (scanner.js çağırır)
export async function handleScannedCode(code) {
  // sadece sayısal
  if (!/^\d+$/.test(code)) return;
  codeInput.value = code;
  await confirmCode(); // bulursa beep + qty fokus
}

// ---- helpers ----
async function confirmCode() {
  const code = codeInput.value.trim();
  if (!/^\d+$/.test(code)) {
    await buzz(false);
    blink(codeInput);
    return;
  }
  const p = await getProductByBarcodeOrShort(code);
  if (p) {
    showFound(p);
    await buzz(true);
    qtyInput.focus();
  } else {
    showFound(null);
    await buzz(false);
    blink(codeInput);
  }
}

function showFound(p) {
  if (!p) {
    foundName.textContent = '—';
    foundPrice.textContent = '—';
    return;
  }
  foundName.textContent = p.name || '—';
  foundPrice.textContent = p.price != null ? money(p.price) : '—';
}

function stepQty(d){
  const n = Math.max(1, (parseInt(qtyInput.value||'1',10)||1)+d);
  qtyInput.value = String(n);
}

async function addCurrentLine(){
  const code = codeInput.value.trim();
  if (!/^\d+$/.test(code)) { await buzz(false); return; }
  const p = await getProductByBarcodeOrShort(code);
  const qty = Math.max(1, parseInt(qtyInput.value||'1',10)||1);
  if (!p) { await buzz(false); blink(codeInput); return; }

  await addLine({ code, name: p.name, price: p.price ?? 0, qty });
  await renderLines();

  // Sonraki giriş için
  codeInput.value = '';
  qtyInput.value = '1';
  firstQtyKeyReplaces = true;
  codeInput.focus();
}

async function undo(){
  await undoLastLine();
  await renderLines();
}

async function renderLines(){
  const all = await getAllLines();
  linesTbody.innerHTML = '';
  let totalQty = 0;
  for (const l of all) {
    totalQty += l.qty;
    const tr = document.createElement('tr');

    const tdCode = document.createElement('td'); tdCode.textContent = l.code;
    const tdName = document.createElement('td'); tdName.textContent = l.name || '';
    const tdQty  = document.createElement('td'); tdQty.textContent = String(l.qty);
    const tdDel  = document.createElement('td');
    const btnDel = document.createElement('button');
    btnDel.className = 'btn danger';
    btnDel.textContent = 'Sil';
    btnDel.onclick = async () => {
      if (confirm(`${l.code} nolu ürünü silmek istediğinize emin misiniz?`)) {
        // satır silmek için küçük bir yol: tümünü al -> filtrele -> clear -> yeniden yaz
        const rest = (await getAllLines()).filter(x => x.id !== l.id);
        await clearLines();
        for (const r of rest) await addLine(r);
        await renderLines();
      }
    };
    tdDel.appendChild(btnDel);

    tr.append(tdCode, tdName, tdQty, tdDel);
    linesTbody.appendChild(tr);
  }
  totalsCell.textContent = `Toplam satır: ${all.length} · Toplam adet: ${totalQty}`;
}

async function refreshProductCount(){
  const n = await getMeta('productCount', 0);
  productCountBadge.textContent = `${n} ürün yüklü`;
}

function fileName(){
  const v = (document.getElementById('fileName').value || '').trim();
  if (v) return v;
  const d = new Date(); const pad = n=>String(n).padStart(2,'0');
  return `sayim-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function money(n){ return new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(n||0); }
function blink(input){
  input.classList.add('blink');
  setTimeout(()=>input.classList.remove('blink'), 350);
}
async function buzz(ok){
  try {
    if (ok) await beep.play(); else await errS.play();
    if (navigator.vibrate) navigator.vibrate(ok? [40] : [15,40,15]);
  } catch(_) {}
}

// Dosya seçimi
async function onFileSelected(e){
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const enc = document.getElementById('encodingSelect').value || 'windows-1254';

  const buf = await f.arrayBuffer();
  let text;
  try {
    const decoder = new TextDecoder(enc);
    text = decoder.decode(buf);
  } catch (_) {
    text = new TextDecoder('utf-8').decode(buf);
  }
  await importGTFText(text);
  await setMeta('productCount', await countProducts());
  await refreshProductCount();
  alert('Ürün verisi yüklendi.');
}

// İsimle arama (basit startsWith filtre)
async function onSearchInput(e){
  const q = (e.target.value || '').toLocaleLowerCase('tr-TR').trim();
  const ul = document.getElementById('searchResults');
  ul.innerHTML = '';
  if (!q || q.length < 2) return;

  // Tüm ürünleri taramak büyük veride pahalı olur → basit cache: ilk 2000 kaydı dolaş
  const db = await openDb();
  const tx = db.transaction('products'); const os = tx.objectStore('products');
  const req = os.openCursor(); let shown = 0;
  req.onsuccess = () => {
    const c = req.result;
    if (c && shown < 2000) {
      const p = c.value;
      if ((p.name || '').toLocaleLowerCase('tr-TR').startsWith(q)) {
        const li = document.createElement('li');
        li.textContent = `${p.name} · ${p.barcodes?.[0] || p.code}`;
        li.onclick = () => {
          const code = p.barcodes?.[0] || p.code;
          codeInput.value = code;
          confirmCode();
          ul.innerHTML = '';
        };
        ul.appendChild(li); shown++;
      }
      c.continue();
    }
  };
}
