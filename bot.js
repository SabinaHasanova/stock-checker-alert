import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { getStores, getProductsByUserAndStatus, addProduct, getProductsByUser, updateProduct, deleteProduct, getCheckLogs } from './db.js';
import 'dotenv/config';
import Database from 'better-sqlite3';

const TOKEN = process.env.BOT_TOKEN;
const PRODUCTS_FILE = path.resolve(process.cwd(), 'products.json');
const db = new Database('data/db.sqlite');

const bot = new TelegramBot(TOKEN, { polling: true });
const userStates = {};

/* =======================
   Storage helpers
======================= */

/*
  NOTE: products are now persisted in SQLite via `db.js`.
  Use `getProductsByUser`, `getProductsByUserAndStatus`, `addProduct`, `updateProduct`, `deleteProduct`.
*/

/*
  loadStores()
  - Read `stores.json` from project root and return enabled stores.
  - Falls back to a small builtin list when the file is missing or invalid.
*/
function loadStores() {
  // Use DB-backed stores; `db.js` handles initial migration from stores.json.
  try {
    return getStores();
  } catch (err) {
    console.error('loadStores db error:', err.message);
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
  // Build store buttons dynamically from `stores.json`.
  const stores = loadStores();
  const keyboard = stores.map(s => [{ text: s.name, callback_data: `store_${s.slug}` }]);
  keyboard.push([{ text: 'Cancel', callback_data: 'back_to_menu' }]);

  bot.sendMessage(chatId, '🏬 Select store:', {
    reply_markup: { inline_keyboard: keyboard }
  });
}

/*
  sendMainMenu(chatId)
  - Sends the main action keyboard (add/list/pause/resume/delete).
*/

function sendMainMenu(chatId) {
  // Use inline keyboard for a cleaner UX and callback handling
  bot.sendMessage(chatId, '📋 Menu', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Add product', callback_data: 'main_add_product' }],
        [{ text: '📋 My products', callback_data: 'main_my_products' }],
        [
          { text: '⏸️ Pause product', callback_data: 'main_pause' },
          { text: '▶️ Resume product', callback_data: 'main_resume' }
        ],
        [{ text: '❌ Delete product', callback_data: 'main_delete' }]
      ]
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

bot.onText(/\/help/, msg => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Help:\n- Use the menu to add products or manage existing ones.\n- You can add product URL then size (or Skip).\n- In My products use inline buttons to Pause/Resume/Delete.');
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
    const newId = addProduct({ userId: chatId, url: state.url, size, status: 1, price: 0 });

    bot.sendMessage(
      chatId,
      `✅ Added successfully\nUrl: ${state.url}\nID: ${newId}\nSize: ${size ?? 'N/A'}`
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
  const products = getProductsByUser(chatId);
  const product = products.find(p => p.id === id);
  if (!product) {
    bot.sendMessage(chatId, '❌ Product not found');
    resetStep(chatId);
    sendMainMenu(chatId);
    return;
  }

  if (state.action === 'pause') product.status = 0;
  if (state.action === 'resume') product.status = 1;
  if (state.action === 'remove') {
    deleteProduct(id);
    bot.sendMessage(chatId, '✅ Operation completed');
    resetStep(chatId);
    sendMainMenu(chatId);
    return;
  }

  // update product in DB
  updateProduct(product);
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
  const products = getProductsByUserAndStatus(chatId, status);

  if (!products.length) {
    bot.sendMessage(chatId, 'No products found.');
    return;
  }

  // Build inline keyboard: one row per product, plus a Back button
  const keyboard = products.map(p => [
    { text: `ID:${p.id} | ${p.size ?? 'N/A'}`, callback_data: `product_${p.id}` }
  ]);

  keyboard.push([{ text: '⬅ Back to menu', callback_data: 'back_to_menu' }]);

  bot.sendMessage(chatId, 'Select a product to manage:', {
    reply_markup: { inline_keyboard: keyboard }
  });
}

/*
  Callback query handler
  - product_<id> => show product details + action buttons
  - action_toggle_<id> => pause/resume
  - action_delete_<id> => ask confirm
  - confirm_delete_<id> => delete
  - back_to_menu => return to main menu
*/
bot.on('callback_query', async query => {
  const data = query.data;
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id).catch(() => {});

  // Main menu callbacks
  if (data === 'main_add_product') {
    setState(chatId, { step: 'await_url' });
    bot.sendMessage(chatId, '🔗 Send product link:');
    return;
  }

  if (data === 'main_my_products') {
    setState(chatId, { step: 'products_menu' });
    showProducts(chatId, 1);
    return;
  }

  if (data === 'main_pause') {
    askForAction(chatId, 'pause');
    return;
  }

  if (data === 'main_resume') {
    askForAction(chatId, 'resume');
    return;
  }

  if (data === 'main_delete') {
    askForAction(chatId, 'remove');
    return;
  }

  if (data === 'back_to_menu') {
    resetStep(chatId);
    sendMainMenu(chatId);
    return;
  }

  if (data && data.startsWith('product_')) {
    const id = Number(data.split('_')[1]);
    const products = getProductsByUser(chatId);
    const product = products.find(p => p.id === id);
    if (!product) {
      bot.sendMessage(chatId, 'Product not found.');
      return;
    }

    const actions = [];
    if (product.status === 1) actions.push({ text: '⏸ Pause', callback_data: `action_toggle_${id}` });
    else actions.push({ text: '▶️ Resume', callback_data: `action_toggle_${id}` });

    actions.push({ text: '📜 History', callback_data: `action_history_${id}` });
    actions.push({ text: '❌ Delete', callback_data: `action_delete_${id}` });
    actions.push({ text: '⬅ Back', callback_data: 'back_to_menu' });

    await bot.sendMessage(chatId,
      `ID:${product.id}\nUrl:${product.url}\nSize:${product.size ?? 'N/A'}\nStatus:${product.status === 1 ? 'Active' : 'Paused'}`,
      { reply_markup: { inline_keyboard: [actions] } }
    );
    return;
  }

  if (data && data.startsWith('action_toggle_')) {
    const id = Number(data.split('_')[2]);
    const products = loadProducts();
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) {
      bot.sendMessage(chatId, 'Product not found.');
      return;
    }
    products[idx].status = products[idx].status === 1 ? 0 : 1;
    saveProducts(products);
    bot.sendMessage(chatId, '✅ Operation completed');
    sendMainMenu(chatId);
    return;
  }

  if (data && data.startsWith('action_history_')) {
    const id = Number(data.split('_')[2]);
    const logs = getCheckLogs(id, 10);
    if (!logs.length) {
      bot.sendMessage(chatId, 'No history found for this product.');
      return;
    }

    const text = logs
      .map(l => {
        const when = l.checked_at;
        const status = l.in_stock ? 'IN' : 'OUT';
        const price = l.price != null ? `price:${l.price}` : '';
        const err = l.error ? ` error:${l.error}` : '';
        return `${when} — ${status} ${price}${err}`;
      })
      .join('\n');

    bot.sendMessage(chatId, `Recent checks for product ${id}:\n${text}`);
    return;
  }

  if (data && data.startsWith('action_delete_')) {
    const id = Number(data.split('_')[2]);
    const confirmKeyboard = [
      [
        { text: 'Yes, delete', callback_data: `confirm_delete_${id}` },
        { text: 'No', callback_data: 'back_to_menu' }
      ]
    ];
    bot.sendMessage(chatId, 'Are you sure you want to delete this product?', { reply_markup: { inline_keyboard: confirmKeyboard } });
    return;
  }

  if (data && data.startsWith('confirm_delete_')) {
    const id = Number(data.split('_')[2]);
    let products = loadProducts();
    const before = products.length;
    products = products.filter(p => p.id !== id);
    if (products.length === before) {
      bot.sendMessage(chatId, 'Product not found.');
      return;
    }
    saveProducts(products);
    bot.sendMessage(chatId, '✅ Product deleted');
    sendMainMenu(chatId);
    return;
  }
});

/* ======================= */

console.log('🤖 Telegram bot is running (clean version)...');
