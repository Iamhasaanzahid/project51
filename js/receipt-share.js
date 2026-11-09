/* ============================================================
   mhzaly — shared receipt helpers (WhatsApp / print)
   ============================================================ */

import { db } from './db.js';

export function money(n) {
  return 'Rs ' + Number(n || 0).toLocaleString();
}

export function receiptText(sale) {
  const s = db.settings || {};
  const lines = [];
  lines.push(`*${s.shopName || 'My Mart'}*`);
  if (s.phone) lines.push(`Phone: ${s.phone}`);
  if (s.address) lines.push(s.address);
  lines.push('');
  lines.push(`Invoice: ${sale.invoiceNo || sale.id}`);
  lines.push(`Date: ${new Date(sale.createdAt).toLocaleString()}`);
  if (sale.customerName) lines.push(`Customer: ${sale.customerName}`);
  lines.push('------------------------');
  for (const it of sale.items || []) {
    const qty = Number(it.qty) || 1;
    const price = Number(it.price) || 0;
    lines.push(`${it.name}`);
    lines.push(`  ${qty} x Rs ${price.toLocaleString()} = Rs ${(qty * price).toLocaleString()}`);
  }
  lines.push('------------------------');
  lines.push(`*Total: Rs ${Number(sale.total || 0).toLocaleString()}*`);
  lines.push(`Payment: ${sale.paymentMethod || 'Cash'}`);
  if (s.receiptNote) lines.push('', s.receiptNote);
  return lines.join('\n');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function printReceipt(sale) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(
    `<html><head><style>@page{margin:6mm}body{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;white-space:pre-wrap;margin:0;color:#000}</style></head><body>${escapeHtml(
      receiptText(sale)
    )}</body></html>`
  );
  doc.close();
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  setTimeout(() => iframe.remove(), 1200);
}

export function normalizePhone(phone) {
  let digits = String(phone || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = '92' + digits.slice(1);
  else if (digits.length === 10 && digits.startsWith('3')) digits = '92' + digits;
  return digits;
}

export function shareWhatsApp(sale, phone) {
  const text = encodeURIComponent(receiptText(sale));
  const digits = normalizePhone(phone);
  const url = digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
  window.open(url, '_blank');
}
