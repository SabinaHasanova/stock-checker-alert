import 'dotenv/config';
import cron from 'node-cron';
import { chromium } from 'playwright';
import { checkZaraAvailability } from './scraper.js';
import { sendTelegramNotification,sendTelegramErrorNotification  } from './notifier.js';
import pLimit from 'p-limit';
import { getProductsForCheck, addCheckLog, closeDB } from './db.js';

const limit = pLimit(3);


// products are now stored in SQLite; see `db.js` helpers.

/*
  runStockCheck()
  - Main worker that loads products, creates a shared Playwright
    browser/context for the run, and checks active products in parallel.
  - Sends Telegram notifications for in-stock or price-drop events
    and persists updated product state back to disk.
*/
async function runStockCheck() {
  const activeProducts = getProductsForCheck();
  if (!activeProducts.length) {
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
          // Log the check result
          try { addCheckLog({ productId: product.id, inStock: inStock ? 1 : 0, price: product.price ?? null }); } catch {}

          if (inStock) {
            await sendTelegramNotification(
              product.userId,
              `🔥 IN STOCK!\nID: ${product.id}\nSize: ${product.size ?? 'ANY'}\n${product.url}`
            );
          }

        } catch (err) {
          console.log('Global stock check error:', err.message);

          try { addCheckLog({ productId: product.id, inStock: 0, price: product.price ?? null, error: err.message }); } catch {}

          await sendTelegramErrorNotification(`❌ Stock checker crashed\nError: ${err.message}`);
        }
      })
    );

    await Promise.all(tasks);
  } finally {
    try { if (context) await context.close(); } catch {}
    try { if (browser) await browser.close(); } catch {}
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

validateEnv();

const scheduledTask = cron.schedule('*/5 * * * *', async () => {
  await runStockCheck();
});

async function gracefulShutdown(signal) {
  try {
    console.log('Shutting down (signal:', signal, ')');
    try { if (scheduledTask) scheduledTask.stop(); } catch (err) {}
    try { closeDB(); } catch (err) { console.error('Error closing DB during shutdown:', err.message); }
    console.log('Shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', async (err) => {
  console.error('Uncaught exception:', err && err.stack ? err.stack : err);
  try { await sendTelegramErrorNotification(`Uncaught exception: ${err && err.message ? err.message : String(err)}`); } catch (e) {}
  try { closeDB(); } catch (e) {}
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  console.error('Unhandled rejection:', reason);
  try { await sendTelegramErrorNotification(`Unhandled rejection: ${String(reason)}`); } catch (e) {}
});