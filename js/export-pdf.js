import { getAllLines } from './db.js';

export async function exportAsPdf(filename){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }); // A4 dikey
  const margin = 32;

  // Başlık
  doc.setFont('helvetica','bold');
  doc.setFontSize(16);
  doc.text('GENÇ GROSS · Sayım', margin, margin);
  doc.setFont('helvetica','normal');
  doc.setFontSize(10);
  doc.text(new Date().toLocaleString('tr-TR'), margin, margin + 14);

  // Veri
  const lines = await getAllLines();
  // Sütunlar: Barkod | İsim | Adet | Birim Fiyat | Toplam Fiyat
  const head = [['Barkod','İsim','Adet','Birim Fiyat','Toplam Fiyat']];
  const body = lines.map(l => [
    l.code,
    l.name || '',
    String(l.qty),
    money(l.price ?? 0),
    money((l.price ?? 0) * l.qty)
  ]);

  let total = 0;
  for (const l of lines) total += (l.price ?? 0) * l.qty;

  // Tablo
  doc.autoTable({
    startY: margin + 28,
    head, body,
    styles: { lineWidth: 0.6, lineColor: '#cccccc', fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [241,243,251], textColor: 20, halign:'left' },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 220 },
      2: { cellWidth: 60, halign: 'right' },
      3: { cellWidth: 90, halign: 'right' },
      4: { cellWidth: 100, halign: 'right' }
    },
    didDrawPage: (data) => {
      // Footer total (sağ alt)
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.setFont('helvetica','bold'); doc.setFontSize(12);
      doc.text(`Genel Toplam: ${money(total)}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
    }
  });

  doc.save(ensureExt(filename || defaultName(), '.pdf'));
}

function money(n){
  return new Intl.NumberFormat('tr-TR', { style:'currency', currency:'TRY', minimumFractionDigits:2 }).format(n || 0);
}
function defaultName(){
  const d = new Date();
  const pad = n=>String(n).padStart(2,'0');
  return `sayim-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
function ensureExt(name, ext){
  return name.toLowerCase().endsWith(ext) ? name : name + ext;
}
