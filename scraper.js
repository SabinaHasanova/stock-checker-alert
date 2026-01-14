import { chromium } from 'playwright';
import { handlePopupsAndCookies } from './handlePopupsAndCookies.js';

export async function checkZaraAvailability(product) {
 const browser = await chromium.launch({
  headless: false,
  slowMo: 50,
  args: [
    '--window-position=-2000,0',   // 👈 ekranın kənarına atır
    '--window-size=200,200',
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-dev-shm-usage'
  ]
});

const context = await browser.newContext({
  viewport: { width: 200, height: 200 },
  locale: 'de-DE',
  timezoneId: 'Europe/Berlin',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/120.0.0.0 Safari/537.36'
});


  const page = await context.newPage();

  await page.evaluate(() => {
  // pəncərəni ekrandan kənara at
  window.moveTo(-4000, 0);
  window.resizeTo(800, 600);

  // fokus almasın
  window.blur();
});

  try {
    await page.goto(product.url, { waitUntil: 'domcontentloaded' });

    // 🔹 popup + cookie handling
    await handlePopupsAndCookies(page);

  

   const addToCartSelector = 'button.product-detail-cart-buttons__button';
 
   const inStock = await isInStockByButton(page);

if (!inStock) {
  return false;
}

    
      
     // 🔹 SIZE YOXDURSA → hər hansı stock varmı?
    if (!product.size) {
      
      return true;
    }
    

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
    console.log('Retrying Zara check due to navigation...');
    await page.waitForTimeout(2000);
    return await checkZaraAvailability(product); // retry
  } finally {
    await browser.close();
  }
}

async function isInStockByButton(page) {
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