import { chromium } from 'playwright';
import { handlePopupsAndCookies } from './handlePopupsAndCookies.js';
import { sendTelegramErrorNotification,sendTelegramNotification  } from './notifier.js';



/*
  checkZaraAvailability(product, retryCount, browser, context)
  - Visits a Zara product page and inspects price and availability.
  - Parameters:
    - product: object containing `url`, `size`, `price`, `userId`, etc.
    - retryCount: current retry attempt (used internally).
    - browser: optional Playwright Browser to reuse across checks.
    - context: optional Playwright BrowserContext to reuse across checks.
  - Returns: `true` if the requested size is available, `false` otherwise.
*/
export async function checkZaraAvailability(product, retryCount = 0, browser = null, context = null) {

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
    await handlePopupsAndCookies(page);

const currentPrice = await page.evaluate(() => {
      const el = document.querySelector(
          '[data-qa-qualifier="price-amount-current"] .money-amount__main'
      );

      if (!el) return null;

      return parseFloat(
          el.innerText
              .replace(',', '.')
              .replace(/[^\d.]/g, '')
      );
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


     // -------- Stock by button --------

    const inStock = await isInStockByButton(page);

    if (!inStock) return false;
    

    // -------- If no size required --------
    if (!product.size) return true;
    

      // 🔹 Add to cart button (sənin C# selector-un)
    const addToCartSelector = 'button.product-detail-cart-buttons__button';
    await page.waitForSelector(addToCartSelector, { timeout: 15000 });

    await page.click(addToCartSelector);

    // Bir az gözləyək ki size-lar render olunsun
    await page.waitForTimeout(1500);
    // 🔹 ENABLED + IN STOCK
    const availableSizes = await page.evaluate(() => {
      return Array.from(
          document.querySelectorAll(
              'li.size-selector-sizes-size--enabled button.size-selector-sizes-size__button[data-qa-action="size-in-stock"] div.size-selector-sizes-size__label'
          )
      ).map(t => t.innerText.trim());
    });

    if (availableSizes.includes(product.size)) {
      return true;
    }

    // 🔹 LOW STOCK
    const lowStockSizes = await page.evaluate(() => {
      return Array.from(
          document.querySelectorAll(
              'li.size-selector-sizes-size--enabled button.size-selector-sizes-size__button[data-qa-action="size-low-on-stock"] div.size-selector-sizes-size__label'
          )
      ).map(t => t.innerText.trim());
    });

    return lowStockSizes.includes(product.size);

  } catch (err) {

    try {
      await sendTelegramErrorNotification(
          `❌ Zara checker error\n\nProduct: ${product.url}\nError: ${err.message}`
      );
    } catch (notifyErr) {
      console.log('Telegram notify failed:', notifyErr.message);
    }

    if (retryCount >= 2) {
      return false;
    }

    await page.waitForTimeout(2000);
    return await checkZaraAvailability(product, retryCount + 1, browser, context); // retry
  } finally {
    try {
      if (!page.isClosed()) await page.close();
    } catch {
    }

    try {
      if (createdContext && context && !context.isClosed?.()) await context.close();
    } catch {}

    try {
      if (createdBrowser && browser) await browser.close();
    } catch {}
  }
}
async function isInStockByButton(page) {
  /*
    isInStockByButton(page)
    - Inspect the primary add-to-cart button to infer whether the product
      is available to add to cart. Returns boolean.
  */
  const result = await page.evaluate(() => {
    const btn = document.querySelector('button.product-detail-cart-buttons__button');
    if (!btn) return false;

    const action = btn.getAttribute('data-qa-action');
    const text = btn.innerText.toLowerCase();

    if (action === 'add-to-cart') return true;
    if (action === 'show-similar-products') return false;
    if (text.includes('out of stock')) return false;

    return false;
  });

  return result;
}


async function safeClickAddToCart(page, retries = 3) {
  /*
    safeClickAddToCart(page, retries)
    - Attempt to click the add-to-cart button with a small retry loop.
    - Throws if the button cannot be clicked after `retries` attempts.
  */
  const ADD_BTN = 'button.product-detail-cart-buttons__button';
  for (let i = 0; i < retries; i++) {
    try {
      await page.waitForSelector(ADD_BTN, { state: 'visible', timeout: 5000 });

      await page.evaluate(sel => {
        const btn = document.querySelector(sel);
        if (!btn) throw new Error('Add to cart button missing');
        btn.click();
      }, ADD_BTN);

      return true;
    } catch (err) {
      if (i === retries - 1) throw err;
      await page.waitForTimeout(1200);
    }
  }
}