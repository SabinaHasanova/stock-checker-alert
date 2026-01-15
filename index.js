import fs from 'fs';
import cron from 'node-cron';
import { checkZaraAvailability } from './scraper.js';
import { sendTelegramNotification,sendTelegramErrorNotification  } from './notifier.js';
import pLimit from 'p-limit';

const limit = pLimit(3);


 async function runStockCheck() {
  const products = JSON.parse(fs.readFileSync('./products.json'));

  const tasks = products
    .filter(product => product.status === 1)
    .map(product =>
      limit(async () => {
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
      })
    );

  await Promise.all(tasks);

  fs.writeFileSync('./products.json', JSON.stringify(products, null, 2));
}



await runStockCheck();

cron.schedule('*/5 * * * *', async () => {
  await runStockCheck();
});