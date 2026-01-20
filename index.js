import 'dotenv/config';
import fs from 'fs';
import cron from 'node-cron';
import { chromium } from 'playwright';
import { checkZaraAvailability } from './scraper.js';
import { sendTelegramNotification,sendTelegramErrorNotification  } from './notifier.js';
import pLimit from 'p-limit';

const limit = pLimit(3);


/*
  loadProducts()
  - Read and parse the `products.json` file from disk.
  - Returns an array of product objects (or throws if file is invalid).
*/
function loadProducts() {
  return JSON.parse(fs.readFileSync('./products.json'));
}

/*
  runStockCheck()
  - Main worker that loads products, creates a shared Playwright
    browser/context for the run, and checks active products in parallel.
  - Sends Telegram notifications for in-stock or price-drop events
    and persists updated product state back to disk.
*/
async function runStockCheck() {
  const products = loadProducts();

  const activeProducts = products.filter(product => product.status === 1);
  if (!activeProducts.length) {
    fs.writeFileSync('./products.json', JSON.stringify(products, null, 2));
    return;
  }

  let browser = null;
  let context = null;

  try {
    const HEADLESS = process.env.HEADLESS ? process.env.HEADLESS === 'true' : false;
    const SLOW_MO = process.env.SLOW_MO ? Number(process.env.SLOW_MO) : 50;

    browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO, args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'] });
    context = await browser.newContext({
      viewport: { width: 800, height: 800 },
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/120.0.0.0 Safari/537.36'
    });

    const tasks = activeProducts.map(product =>
      limit(async () => {
        try {
          const inStock = await checkZaraAvailability(product, 0, browser, context);

          if (inStock) {
            await sendTelegramNotification(
              product.userId,
              `🔥 IN STOCK!\nID: ${product.id}\nSize: ${product.size ?? 'ANY'}\n${product.url}`
            );
          }

        } catch (err) {
          console.log('Global stock check error:', err.message);

          await sendTelegramErrorNotification(
            `❌ Stock checker crashed\nError: ${err.message}`
          );
        }
      })
    );

    await Promise.all(tasks);
  } finally {
    try { if (context) await context.close(); } catch {}
    try { if (browser) await browser.close(); } catch {}
    fs.writeFileSync('./products.json', JSON.stringify(products, null, 2));
  }
}

/*
  validateEnv()
  - Check for required environment variables and emit a console warning
    if any are missing. Does not throw — informational only.
*/
function validateEnv() {
  const missing = [];
  if (!process.env.BOT_TOKEN) missing.push('BOT_TOKEN');
  if (!process.env.BOT_AUTHOR_CHAT_ID) missing.push('BOT_AUTHOR_CHAT_ID');

  if (missing.length) {
    console.warn('Warning: missing environment variables:', missing.join(', '));
    console.warn('Notifications may fail. Set variables in your .env file or environment.');
  }
}



await runStockCheck();

cron.schedule('*/5 * * * *', async () => {
  await runStockCheck();
});