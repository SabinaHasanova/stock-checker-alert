import fs from 'fs';
import cron from 'node-cron';
import { checkZaraAvailability } from './scraper.js';
import { sendTelegramNotification } from './notifier.js';

const products = JSON.parse(fs.readFileSync('./products.json'));

function loadProducts() {
  return JSON.parse(fs.readFileSync('./products.json'));
}

async function runStockCheck() {
const products = loadProducts();

 for (const product of products) {
  if (product.status !== 1) continue;

  const inStock = await checkZaraAvailability(product);

  if (inStock) {
    await sendTelegramNotification(
      product.userId,
       `🔥 IN STOCK!\nID: ${product.id}\nSize: ${product.size ?? 'ANY'}\n${product.url}`
    );
  }
}
}

await runStockCheck();

cron.schedule('*/5 * * * *', async () => {
  await runStockCheck();
});