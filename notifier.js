import axios from 'axios';
import 'dotenv/config';

const AUTHOR_CHAT_ID=process.env.BOT_AUTHOR_CHAT_ID;
const TOKEN = process.env.BOT_TOKEN;

function hasToken() {
  if (!TOKEN) {
    console.error('Missing BOT_TOKEN environment variable. Telegram notifications disabled.');
    return false;
  }
  return true;
}

/*
  sendTelegramNotification(chatId, message)
  - Sends a plain message to `chatId` using the configured `BOT_TOKEN`.
  - Safely handles missing token and network errors (logs but does not throw).
*/

export async function sendTelegramNotification(chatId, message) {
  if (!hasToken()) return;

  try {
    await axios.post(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: message
      }
    );
  } catch (err) {
    console.error('Failed to send Telegram notification:', err.message);
  }
}

export async function sendTelegramErrorNotification(message) {
  if (!hasToken()) return;

  if (!AUTHOR_CHAT_ID) {
    console.error('Missing BOT_AUTHOR_CHAT_ID environment variable. Cannot send error notifications.');
    return;
  }

  try {
    await axios.post(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      {
        chat_id: AUTHOR_CHAT_ID,
        text: message
      }
    );
  } catch (err) {
    console.error('Failed to send Telegram error notification:', err.message);
  }
}

/*
  sendTelegramErrorNotification(message)
  - Sends an error/alert message to the bot author (`BOT_AUTHOR_CHAT_ID`).
  - Validates that the author chat id is configured before attempting to send.
*/