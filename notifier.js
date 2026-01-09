import axios from 'axios';

const TELEGRAM_TOKEN = '7552377314:AAHpfHIsoTM4p3Iv5dhAEBt0E5WmWtnWeAk';
const CHAT_ID = '1279780050';

export async function sendTelegramNotification(chatId, message) {
  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    { 
      chat_id: chatId,
      text: message
    }
  );
}