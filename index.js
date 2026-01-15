import fs from 'fs';
import cron from 'node-cron';
import { checkZaraAvailability } from './scraper.js';
import { sendTelegramNotification,sendTelegramErrorNotification  } from './notifier.js';
import pLimit from 'p-limit';

const limit = pLimit(3);


function loadProducts() {
  return JSON.parse(fs.readFileSync('./products.json'));
}

async function runStockCheck() {
const products = loadProducts();

 for (const product of products) {
  if (product.status !== 1) continue;


  const tasks = products
    .filter(product => product.status === 1)
    .map(product =>
      limit(async () => {
        try {
          const inStock = await checkZaraAvailability(product);

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

  fs.writeFileSync('./products.json', JSON.stringify(products, null, 2));
}



await runStockCheck();

cron.schedule('*/5 * * * *', async () => {
  await runStockCheck();
});