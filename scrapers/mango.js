import { chromium } from 'playwright';
import { handleMangoPopupsAndCookies } from '../handlePopupsAndCookies.js';
import { sendTelegramErrorNotification,sendTelegramNotification  } from '../notifier.js';


export async function checkMangoAvailability(product, retryCount = 0, browser = null, context = null) {

  let createdBrowser = false;
  let createdContext = false;

  if (!browser) {
    browser = await chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    });
    createdBrowser = true;
  }

  if (!context) {
    context = await browser.newContext({
      viewport: { width: 800, height: 800 },
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/120.0.0.0 Safari/537.36'
    });
    createdContext = true;
  }

  const page = await context.newPage();
 

  try {
    await page.goto(product.url, {waitUntil: 'domcontentloaded'});

    // 🔹 popup + cookie handling
    await handleMangoPopupsAndCookies(page);

      const currentPrice = await page.evaluate(() => {
     const el = document.querySelector('span.SinglePrice_finalPrice__hZjhM');
       if (!el) return null;

  const raw = el.innerText.trim(); 
  const cleaned = raw.replace(/[^\d.,]/g, '');
  const normalized = cleaned.replace(/\./g, '').replace(/,/g, '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
});

    if (currentPrice && product.price !== undefined && currentPrice !== product.price) {

      const diff = currentPrice - product.price;   
      if(diff < 0)
        {
           await sendTelegramNotification(
          product.userId,
          `📉 Price dropped \nOld: ${product.price} \nNew: ${currentPrice} \n${product.url}`
          );

      }
     
      product.price = currentPrice; // listdə yenilə

    }


  const SIZE_ROOT = '#pdp-size-selector';


const wantedSize = product.size ? String(product.size).trim().toUpperCase() : null;

const result = await page.evaluate(({ wantedSize }) => {
  const root = document.querySelector('#pdp-size-selector');
  if (!root) return { ok: false, reason: 'size-root-missing' };

  const buttons = Array.from(root.querySelectorAll('button'));

  // helper: find button by exact size label text (XXS, XS, S, M...)
  const findBySize = (size) => {
    return buttons.find(btn => {
      const label = btn.querySelector('span.textActionM_className__8McJk');
      return label && label.textContent.trim().toUpperCase() === size;
    }) || null;
  };

  // If no specific size requested: any button with id containing "sizeAvailable" => in stock
  if (!wantedSize) {
    const anyAvailable = buttons.some(btn => (btn.id || '').includes('sizeAvailable'));
    return { ok: true, inStock: anyAvailable };
  }

  const btn = findBySize(wantedSize);
  if (!btn) return { ok: true, inStock: false, reason: 'size-not-found' };

  const id = btn.id || '';
  if (id.includes('sizeAvailable')) return { ok: true, inStock: true };
  if (id.includes('sizeUnavailable')) return { ok: true, inStock: false };

  // fallback: notAvailable class inside
  const notAvail = !!btn.querySelector('.SizeItemContent_notAvailable__2WJ__');
  return { ok: true, inStock: !notAvail };
}, { wantedSize });

     if (!result.ok) return false;
     return result.inStock;
  } catch (err) {
    try {
      await sendTelegramErrorNotification(
        `❌ Mango checker error\n\nProduct: ${product.url}\nError: ${err.message}`
      );
    } catch (notifyErr) {
      console.log('Telegram notify failed:', notifyErr.message);
    }

    if (retryCount >= 2) return false;

    await page.waitForTimeout(2000);
    return await checkMangoAvailability(product, retryCount + 1, browser, context);
  } finally {
    try {
      if (!page.isClosed()) await page.close();
    } catch {}

    try {
      if (createdContext && context && !context.isClosed?.()) await context.close();
    } catch {}

    try {
      if (createdBrowser && browser) await browser.close();
    } catch {}
  }
}