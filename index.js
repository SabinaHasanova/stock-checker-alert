import fs from 'fs';
import cron from 'node-cron';
import { checkZaraAvailability } from './scraper.js';
import { sendTelegramNotification,sendTelegramErrorNotification  } from './notifier.js';




async function runStockCheck() {
  const products = JSON.parse(fs.readFileSync('./products.json'));
  for (const product of products) {
    if (product.status !== 1) continue;

    try {
      const inStock = await checkZaraAvailability(product);

      if (inStock) {
        await sendTelegramNotification(
          product.userId,
          `✅ In stock!\nSize: ${product.size || 'Any'}\n${product.url}`
        );
      }

    } catch (err) {
      console.log('Global stock check error:', err.message);

      await sendTelegramErrorNotification(
        `❌ Stock checker crashed\nError: ${err.message}`
      );
    }
 
  }
  fs.writeFileSync('./products.json', JSON.stringify(products, null, 2));
}

await runStockCheck();

cron.schedule('*/5 * * * *', async () => {
  await runStockCheck();
});