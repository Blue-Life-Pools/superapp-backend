import { moneyValue } from './opportunity-data';

export type EstimatePdfText = { text: string; x: number; y: number };
export type EstimatePdfDetails = { estimateNumber: string; total: string; descriptions: string[] };
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();

export function parseEstimatePdfPages(pages: EstimatePdfText[][], expectedNumber: string): EstimatePdfDetails | null {
  const text = pages.flat().map(item => item.text).join('\n');
  const numbers = [...text.matchAll(/\bEstimate\s*(?:no\.?|number|#)\s*:?\s*(\d+)/gi)].map(match => match[1]);
  if (!numbers.length || numbers.some(number => number !== expectedNumber)) return null;
  const totals = [...text.matchAll(/(?:^|\n)Total\s*\n?\s*\$\s*([\d,]+(?:\.\d{2})?)\s*(?=\n|$)/gi)];
  const total = totals.at(-1)?.[1];
  if (!total) return null;
  const rows: string[][] = [];
  let current: string[] | null = null;
  for (const source of pages) {
    const items = source.filter(item => clean(item.text));
    const description = items.find(item => /^Description$/i.test(clean(item.text)));
    if (!description) continue;
    const quantity = items.find(item => /^(?:Qty|Quantity)$/i.test(clean(item.text)) && Math.abs(item.y - description.y) < 5);
    const product = items.find(item => /^Product(?:\s+or\s+service|\s*\/\s*Service)$/i.test(clean(item.text)) && Math.abs(item.y - description.y) < 5);
    if (!quantity || !product || quantity.x <= description.x || product.x >= description.x) continue;
    const footers = items.filter(item => /^(?:Subtotal|Tax|Total|Accepted date|Accepted by)$/i.test(clean(item.text)) && item.y < description.y);
    const bottom = footers.length ? Math.max(...footers.map(item => item.y)) : -Infinity;
    const body = items.filter(item => item.y < description.y - 4 && item.y > bottom + 2).sort((a, b) => Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x);
    for (const item of body) {
      if (/^\d+[.)]$/.test(clean(item.text)) && item.x < product.x - 3) {
        current = []; rows.push(current);
      } else if (current && item.x >= description.x - 3 && item.x < quantity.x - 6) current.push(clean(item.text));
    }
  }
  const descriptions = rows.map(row => row.join(' ').trim()).filter(Boolean);
  return descriptions.length ? { estimateNumber: expectedNumber, total: moneyValue(total)!, descriptions } : null;
}

export async function readEstimatePdf(bytes: Uint8Array, expectedNumber: string): Promise<EstimatePdfDetails | null> {
  if (bytes.byteLength > 5 * 1024 * 1024 || Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') throw new Error('Invalid estimate PDF attachment.');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Include the local worker explicitly in serverless bundles; PDF.js otherwise
  // resolves its path dynamically, which dependency tracers can omit.
  await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, useWorkerFetch: false, stopAtErrors: true });
  try {
    const document = await task.promise;
    if (document.numPages > 20) throw new Error('Estimate PDF exceeds the supported page limit.');
    const pages: EstimatePdfText[][] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number), content = await page.getTextContent();
      pages.push(content.items.flatMap(item => 'str' in item ? [{ text: item.str, x: item.transform[4], y: item.transform[5] }] : []));
      page.cleanup();
    }
    return parseEstimatePdfPages(pages, expectedNumber);
  } finally { await task.destroy(); }
}
