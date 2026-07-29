// Chip "vs. similares" en /alquileres — medición mínima y comparable.
// Playwright porque el preview interno no hidrata estos feeds (VERIFICAR_FEEDS_DESKTOP.md).
// Ojo: el feed mobile VIRTUALIZA (dibuja ~4 tarjetas), el de escritorio no (dibuja ~200).
// Por eso no se comparan totales: se compara CHIPS contra TARJETAS DIBUJADAS.
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3100';
const VUELTAS = Number(process.argv[3] || 2);
const browser = await chromium.launch();
console.log(`\n${BASE}`);
console.log('ancho  vuelta   tarjetas   chips   ¿todas con chip?');
console.log('─'.repeat(52));

for (const w of [430, 600, 1024]) {
  for (let v = 1; v <= VUELTAS; v++) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/alquileres`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => ({
      cards: document.querySelectorAll('.amc-content').length || document.querySelectorAll('.alc-name2').length,
      chips: document.querySelectorAll('.amc-fid').length + document.querySelectorAll('.alc-mkt2').length,
    }));
    const ok = r.cards > 0 && r.chips >= r.cards ? 'sí' : r.chips > 0 ? 'parcial' : 'NO';
    console.log(String(w).padEnd(7) + String(v).padEnd(9) + String(r.cards).padEnd(11) + String(r.chips).padEnd(8) + ok);
    await ctx.close();
  }
}
await browser.close();
console.log('');
