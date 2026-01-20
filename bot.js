import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const TOKEN = process.env.BOT_TOKEN;
const PRODUCTS_FILE = path.resolve(process.cwd(), 'products.json');

const bot = new TelegramBot(TOKEN, { polling: true });
const userStates = {};

/* =======================
   Storage helpers
======================= */

function loadProducts() {
  try {
    if (!fs.existsSync(PRODUCTS_FILE)) fs.writeFileSync(PRODUCTS_FILE, '[]');
    const data = fs.readFileSync(PRODUCTS_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Failed to load products file:', err.message);
    return [];
  }
}

/*
  sendStoreMenu(chatId)
  - Sends the initial store selection keyboard to the user.
*/

function saveProducts(products) {
  try {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
  } catch (err) {
    console.error('Failed to save products file:', err.message);
  }
}

/* =======================
   Menus
======================= */

function sendStoreMenu(chatId) {
  bot.sendMessage(chatId, '🏬 Select store:', {
    reply_markup: {
      keyboard: [['Zara']],
      resize_keyboard: true
    }
  });
}

/*
  sendMainMenu(chatId)
  - Sends the main action keyboard (add/list/pause/resume/delete).
*/

function sendMainMenu(chatId) {
  bot.sendMessage(chatId, '📋 Menu', {
    reply_markup: {
      keyboard: [
        ['➕ Add product'],
        ['📋 My products'],
        ['⏸️ Pause product', '▶️ Resume product'],
        ['❌ Delete product']
      ],
      resize_keyboard: true
    }
  });
}

/*
  sendProductsMenu(chatId)
  - Sends a keyboard to choose between active/paused products.
*/

function sendProductsMenu(chatId) {
  bot.sendMessage(chatId, 'Select product type:', {
    reply_markup: {
      keyboard: [
        ['✅ Active products'],
        ['⏸ Paused products'],
        ['⬅ Back to menu']
      ],
      resize_keyboard: true
    }
  });
}

/*
  sendSizeMenu(chatId)
  - Asks the user for a size or allows skipping (one-time keyboard).
*/

function sendSizeMenu(chatId) {
  bot.sendMessage(chatId, 'Enter size or choose Skip:', {
    reply_markup: {
      keyboard: [['Skip']],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
}

/* =======================
   State helpers
======================= */

function setState(chatId, data) {
  userStates[chatId] = { ...(userStates[chatId] || {}), ...data };
}

/*
  resetStep(chatId)
  - Reset in-memory conversation step/action for a user.
*/

function resetStep(chatId) {
  if (userStates[chatId]) {
    userStates[chatId].step = null;
    userStates[chatId].action = null;
  }
}

/* =======================
   Start
======================= */

bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  setState(chatId, { step: 'select_store' });
  sendStoreMenu(chatId);
});

/* =======================
   Main handler
======================= */

bot.on('message', msg => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  const state = userStates[chatId] || {};

  /* ---------- Store selection ---------- */

  if (state.step === 'select_store') {
    if (text === 'Zara') {
      setState(chatId, { store: 'zara', step: null });
      bot.sendMessage(chatId, '✅ Zara selected');
      sendMainMenu(chatId);
    } else {
      bot.sendMessage(chatId, 'Please select a store from the list.');
    }
    return;
  }

  /* ---------- Add product flow ---------- */

  if (text === '➕ Add product') {
    setState(chatId, { step: 'await_url' });
    bot.sendMessage(chatId, '🔗 Send product link:');
    return;
  }

  if (state.step === 'await_url') {
    setState(chatId, { url: text, step: 'await_size' });
    sendSizeMenu(chatId);
    return;
  }

  if (state.step === 'await_size') {
    const size = text === 'Skip' ? null : text.trim();
    const products = loadProducts();
    const id = products.length ? products.at(-1).id + 1 : 1;

    products.push({
      id,
      userId: chatId,
      url: state.url,
      size,
      status: 1,
      price: 0
    });

    saveProducts(products);

    bot.sendMessage(
      chatId,
      `✅ Added successfully\nUrl: ${state.url}\nID: ${id}\nSize: ${size ?? 'N/A'}`
    );

    resetStep(chatId);
    sendMainMenu(chatId);
    return;
  }

  /* ---------- My products ---------- */

  if (text === '📋 My products') {
    setState(chatId, { step: 'products_menu' });
    sendProductsMenu(chatId);
    return;
  }

  if (state.step === 'products_menu' && text === '✅ Active products') {
    showProducts(chatId, 1);
    return;
  }

  if (state.step === 'products_menu' && text === '⏸ Paused products') {
    showProducts(chatId, 0);
    return;
  }

  if (text === '⬅ Back to menu') {
    resetStep(chatId);
    sendMainMenu(chatId);
    return;
  }

  /* ---------- Actions ---------- */

  if (text === '⏸️ Pause product') return askForAction(chatId, 'pause');
  if (text === '▶️ Resume product') return askForAction(chatId, 'resume');
  if (text === '❌ Delete product') return askForAction(chatId, 'remove');

  if (state.action && /^\d+$/.test(text)) {
    handleProductAction(chatId, Number(text));
    return;
  }
});

/* =======================
   Action helpers
======================= */

function askForAction(chatId, action) {
  setState(chatId, { action });
  bot.sendMessage(chatId, 'Enter product ID:');
}

/*
  handleProductAction(chatId, id)
  - Perform the requested action (pause/resume/remove) on a product
    owned by the requesting user. Sends confirmation messages.
*/

function handleProductAction(chatId, id) {
  const state = userStates[chatId];
  let products = loadProducts();

  const product = products.find(p => p.id === id && p.userId === chatId);
  if (!product) {
    bot.sendMessage(chatId, '❌ Product not found');
    resetStep(chatId);
    sendMainMenu(chatId);
    return;
  }

  if (state.action === 'pause') product.status = 0;
  if (state.action === 'resume') product.status = 1;
  if (state.action === 'remove') {
    products = products.filter(p => p.id !== id);
  }

  saveProducts(products);

  bot.sendMessage(chatId, '✅ Operation completed');
  resetStep(chatId);
  sendMainMenu(chatId);
}

/*
  showProducts(chatId, status)
  - Sends a list of products for the given `status` (1 active, 0 paused)
    that belong to the requesting user.
*/

/* =======================
   Product listing
======================= */

function showProducts(chatId, status) {
  const products = loadProducts().filter(
    p => p.userId === chatId && p.status === status
  );

  if (!products.length) {
    bot.sendMessage(chatId, 'No products found.');
    return;
  }

  const list = products
    .map(p => `ID:${p.id} | Url:${p.url} | Size:${p.size ?? 'N/A'}`)
    .join('\n');

  bot.sendMessage(chatId, list);
}

/* ======================= */

console.log('🤖 Telegram bot is running (clean version)...');
