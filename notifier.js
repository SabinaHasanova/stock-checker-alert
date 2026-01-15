import axios from 'axios';


const AUTHOR_CHAT_ID='1279780050';
const TOKEN = process.env.BOT_TOKEN;

export async function sendTelegramNotification(chatId, message) {
  await axios.post(
    `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    { 
      chat_id: chatId,
      text: message
    }
  );
}


export async function sendTelegramErrorNotification(message) {
  await axios.post(
    `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    { 
      chat_id: AUTHOR_CHAT_ID,
      text: message
    }
  );
}