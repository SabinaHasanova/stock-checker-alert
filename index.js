import fs from 'fs';
import cron from 'node-cron';
import { checkZaraAvailability } from './scraper.js';
import { sendTelegramNotification } from './notifier.js';

const products = JSON.parse(fs.readFileSync('./products.json'));


async function runStockCheck() {


 for (const product of products) {
  if (product.status !== 1) continue;

  const inStock = await checkZaraAvailability(product);

  if (inStock) {
    await sendTelegramNotification(
      product.userId,
      `✅ In stock!\nSize: ${product.size}\n${product.url}`
    );
  }
}
}

await runStockCheck();

cron.schedule('*/5 * * * *', async () => {
  await runStockCheck();
});