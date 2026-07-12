#!/usr/bin/env node
/**
 * Bookend Web Vitals de la landing Condado VI v2 (Lighthouse LOCAL, sin Chrome del sistema).
 *
 * Lanza el Chromium headless de puppeteer y le corre Lighthouse encima.
 * Mide una URL YA SERVIDA (por defecto el `next start` local en :3000).
 * NO orquesta el servidor: arrancá `next start` aparte antes de correr esto.
 *
 * Uso:
 *   node scripts/lighthouse-landing-condado.mjs [url] [--desktop]
 *   node scripts/lighthouse-landing-condado.mjs http://localhost:3000/condado-vi-v2
 *
 * Salida: scorecard JSON (performance score + LCP/TBT/CLS/FCP/SI).
 * Es RUIDOSO por naturaleza -> usar como bookend antes/después, no por iteración.
 */
import puppeteer from 'puppeteer';
import lighthouse from 'lighthouse';

const args = process.argv.slice(2);
const PAGE_URL = args.find((a) => a.startsWith('http')) || 'http://localhost:3000/condado-vi-v2';
const desktop = args.includes('--desktop');

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});

try {
  const port = Number(new URL(browser.wsEndpoint()).port);
  const result = await lighthouse(PAGE_URL, {
    port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance'],
    formFactor: desktop ? 'desktop' : 'mobile',
    screenEmulation: desktop
      ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
      : { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
  });
  const lhr = result.lhr;
  const dv = (id) => lhr.audits[id]?.displayValue ?? 'n/a';
  const scorecard = {
    url: PAGE_URL,
    form_factor: desktop ? 'desktop' : 'mobile',
    performance: Math.round(lhr.categories.performance.score * 100),
    LCP: dv('largest-contentful-paint'),
    TBT: dv('total-blocking-time'),
    CLS: dv('cumulative-layout-shift'),
    FCP: dv('first-contentful-paint'),
    SI: dv('speed-index'),
  };
  console.log(JSON.stringify(scorecard, null, 2));
} finally {
  await browser.close();
}
