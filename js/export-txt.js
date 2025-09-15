import { getAllLines } from './db.js';

export async function exportAsTxt(filename) {
  const lines = await getAllLines();
  const rows = lines.map(l => `${l.code};${l.qty}`);
  const blob = new Blob([rows.join('\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ensureExt(filename || defaultName(), '.txt');
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function defaultName(){
  const d = new Date();
  const pad = n=>String(n).padStart(2,'0');
  return `sayim-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
function ensureExt(name, ext){
  return name.toLowerCase().endsWith(ext) ? name : name + ext;
}
