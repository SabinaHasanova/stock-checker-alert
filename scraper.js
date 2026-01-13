import { chromium } from 'playwright';
import { handlePopupsAndCookies } from './handlePopupsAndCookies.js';
import { sendTelegramErrorNotification,sendTelegramNotification  } from './notifier.js';


export async function checkZaraAvailability(product, retryCount = 0, browser = null, context = null) {

  if (!browser) {
    browser = await chromium.launch({
      headless: false,
      slowMo: 50,
      args: ['--disable-blink-features=AutomationControlled']
    });

    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/120.0.0.0 Safari/537.36'
    });
  }


  const page = await context.newPage();

  try {
    await page.goto(product.url, { waitUntil: 'domcontentloaded' });

    // 🔹 popup + cookie handling
    await handlePopupsAndCookies(page);

    // 🔹 Add to cart button (sənin C# selector-un)
    const addToCartSelector = 'button.product-detail-cart-buttons__button';
    await page.waitForSelector(addToCartSelector, { timeout: 15000 });

    await page.click(addToCartSelector);

    // Bir az gözləyək ki size-lar render olunsun
    await page.waitForTimeout(1500);

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
  const direction = diff < 0 ? '📉 Price dropped' : '📈 Price increased';

  await sendTelegramNotification(
    product.userId,
    `${direction}\nOld: ${product.price} \nNew: ${currentPrice} \n${product.url}`
  );

  product.price = currentPrice; // listdə yenilə

}

    // 🔹 SIZE YOXDURSA → hər hansı stock varmı?
    if (!product.size) {
      const inStock = await page.evaluate(() => {
        return Array.from(
          document.querySelectorAll(
            'button.product-detail-size-selector-std-actions__button[data-qa-action="add-to-cart"]'
          )
        ).map(t => t.innerText.trim());
      });

      return inStock.length > 0;
    }

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
    console.log('Retrying Zara check due to navigation...');

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
  } catch {}

  if (retryCount === 0) {
    await browser.close();
  }
}}