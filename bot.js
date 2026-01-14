import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';

const TOKEN = '7552377314:AAHpfHIsoTM4p3Iv5dhAEBt0E5WmWtnWeAk';
const PRODUCTS_FILE = './products.json';

const bot = new TelegramBot(TOKEN, { polling: true });

function loadProducts() {
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE));
}

function saveProducts(products) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}

bot.on('message', msg => {
  console.log('📩 MESSAGE RECEIVED:', msg.text);
});

// 🟢 ADD
bot.onText(/\/add (\S+)(?:\s+(\S+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const url = match[1];
  const size = match[2] || null; // 👈 nullable

  const products = loadProducts();
  const id = products.length ? products[products.length - 1].id + 1 : 1;

  products.push({
    id,
    userId: chatId,
    url,
    size,
    status: 1
  });

  saveProducts(products);

  bot.sendMessage(
    chatId,
    `✅ Added\nID: ${id}\nSize: ${size ?? 'ANY'}`
  );
});

// 📋 LIST
bot.onText(/\/list/, msg => {
  const chatId = msg.chat.id;
  const products = loadProducts().filter(p => p.userId === chatId);

  if (!products.length) {
    bot.sendMessage(chatId, 'No products.');
    return;
  }

 const text = products
  .map(p =>
    `ID: ${p.id}
Size: ${p.size ?? 'ANY'}
Status: ${p.status}
Link: ${p.url}
--------------------`
  )
  .join('\n');

  bot.sendMessage(chatId, text);
});

// ⏸️ PAUSE
bot.onText(/\/pause (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const id = Number(match[1]);

  const products = loadProducts();
  const product = products.find(p => p.id === id && p.userId === chatId);

  if (!product) {
    bot.sendMessage(chatId, '❌ Not found');
    return;
  }

  product.status = 0;
  saveProducts(products);

  bot.sendMessage(chatId, `⏸️ Paused ID ${id}`);
});

// ▶️ RESUME
bot.onText(/\/resume (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const id = Number(match[1]);

  const products = loadProducts();
  const product = products.find(p => p.id === id && p.userId === chatId);

  if (!product) {
    bot.sendMessage(chatId, '❌ Not found');
    return;
  }

  product.status = 1;
  saveProducts(products);

  bot.sendMessage(chatId, `▶️ Resumed ID ${id}`);
});

// ❌ REMOVE
bot.onText(/\/remove (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const id = Number(match[1]);

  let products = loadProducts();
  const before = products.length;

  products = products.filter(
    p => !(p.id === id && p.userId === chatId)
  );

  if (products.length === before) {
    bot.sendMessage(chatId, '❌ Not found');
    return;
  }

  saveProducts(products);
  bot.sendMessage(chatId, `🗑️ Removed ID ${id}`);
});

console.log('🤖 Telegram bot running');