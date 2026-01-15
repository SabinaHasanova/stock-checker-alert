import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import 'dotenv/config';

const TOKEN = process.env.BOT_TOKEN;
const PRODUCTS_FILE = './products.json';

const bot = new TelegramBot(TOKEN, { polling: true });

function loadProducts() {
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE));
}

function saveProducts(products) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}

function sendMenu(chatId) {
  bot.sendMessage(chatId, '📋 Menyu', {
    reply_markup: {
      keyboard: [
        ['➕ Məhsul əlavə et'],
        ['📋 Məhsullarım'],
        ['⏸️ Pause məhsul', '▶️ Resume məhsul'],
        ['❌ Məhsul sil']
      ],
      resize_keyboard: true
    }
  });
}

const userStates = {};

// /start
bot.onText(/\/start/, msg => {
  sendMenu(msg.chat.id);
});

// Main message handler
bot.on('message', msg => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  // ADD PRODUCT FLOW
  if (text === '➕ Məhsul əlavə et') {
    userStates[chatId] = { step: 'await_url' };
    bot.sendMessage(chatId, '🔗 Zara linkini göndər:');
    return;
  }

  if (userStates[chatId]?.step === 'await_url') {
    userStates[chatId].url = text;
    userStates[chatId].step = 'await_size';
    bot.sendMessage(chatId, '📏 Ölçünü yaz (məs: M, L, 42):');
    return;
  }

  if (userStates[chatId]?.step === 'await_size') {
    const url = userStates[chatId].url;
    const size = text;

    const products = loadProducts();
    const id = products.length ? products[products.length - 1].id + 1 : 1;

    products.push({
      id,
      userId: chatId,
      url,
      size,
      status: 1,
      price: 0
    });

    saveProducts(products);

    bot.sendMessage(chatId, `✅ Əlavə olundu\nID: ${id}\nSize: ${size}`);
    sendMenu(chatId);

    delete userStates[chatId];
    return;
  }

  // LIST PRODUCTS
  if (text === '📋 Məhsullarım') {
    const products = loadProducts().filter(p => p.userId === chatId);

    if (!products.length) {
      bot.sendMessage(chatId, 'Heç bir məhsul yoxdur.');
      return;
    }

    const list = products
      .map(p => `ID:${p.id} | Size:${p.size} | Status:${p.status ? 'ON' : 'OFF'}`)
      .join('\n');

    bot.sendMessage(chatId, list);
    return;
  }

  // ACTION SELECT
  if (text === '⏸️ Pause məhsul') {
    userStates[chatId] = { action: 'pause' };
    bot.sendMessage(chatId, 'Pause ediləcək ID-ni yaz:');
    return;
  }

  if (text === '▶️ Resume məhsul') {
    userStates[chatId] = { action: 'resume' };
    bot.sendMessage(chatId, 'Resume ediləcək ID-ni yaz:');
    return;
  }

  if (text === '❌ Məhsul sil') {
    userStates[chatId] = { action: 'remove' };
    bot.sendMessage(chatId, 'Silinəcək ID-ni yaz:');
    return;
  }

  // HANDLE ID INPUT
  if (userStates[chatId]?.action && /^\d+$/.test(text)) {
    const id = Number(text);
    let products = loadProducts();
    const product = products.find(p => p.id === id && p.userId === chatId);

    if (!product) {
      bot.sendMessage(chatId, '❌ Tapılmadı');
      delete userStates[chatId];
      sendMenu(chatId);
      return;
    }

    if (userStates[chatId].action === 'pause') product.status = 0;
    if (userStates[chatId].action === 'resume') product.status = 1;

    if (userStates[chatId].action === 'remove') {
      products = products.filter(p => !(p.id === id && p.userId === chatId));
    }

    saveProducts(products);

    bot.sendMessage(chatId, '✅ Əməliyyat tamamlandı');
    sendMenu(chatId);
    delete userStates[chatId];
    return;
  }
});

console.log('🤖 Telegram menu bot işləyir...');