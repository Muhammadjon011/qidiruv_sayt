// Telegram kanal ma'lumotlarini olish uchun kichik backend server.
// Bot tokeni faqat shu serverda, muhit o'zgaruvchisi (environment variable)
// sifatida saqlanadi va frontendga hech qachon yuborilmaydi.

// Lokalda ishga tushirganda .env faylni o'qish uchun (Render kabi hostinglarda
// bu shart emas — ular env o'zgaruvchilarni to'g'ridan-to'g'ri beradi).
try { require('dotenv').config(); } catch (e) { /* dotenv o'rnatilmagan bo'lsa ham davom etadi */ }

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('XATO: TELEGRAM_BOT_TOKEN muhit o\'zgaruvchisi topilmadi. Serverni ishga tushirishdan oldin uni o\'rnating.');
}

function tgApi(method, params) {
  const query = new URLSearchParams(params).toString();
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}?${query}`).then(r => r.json());
}

// Asosiy: kanal/guruh haqida ma'lumot
app.get('/api/telegram/:username', async (req, res) => {
  const username = req.params.username.replace(/^@/, '');

  if (!BOT_TOKEN) {
    return res.status(500).json({ error: 'Serverda TELEGRAM_BOT_TOKEN sozlanmagan.' });
  }

  try {
    const chatData = await tgApi('getChat', { chat_id: '@' + username });

    if (!chatData.ok) {
      return res.status(404).json({ error: chatData.description || 'Kanal yoki guruh topilmadi.' });
    }

    const chat = chatData.result;

    let memberCount = null;
    try {
      const countData = await tgApi('getChatMemberCount', { chat_id: '@' + username });
      if (countData.ok) memberCount = countData.result;
    } catch (e) { /* jim o'tkazamiz */ }

    const typeLabels = {
      channel: 'Kanal',
      supergroup: 'Superguruh',
      group: 'Guruh',
      private: 'Shaxsiy'
    };

    res.json({
      title: chat.title || chat.username || username,
      username: chat.username || username,
      type: chat.type,
      typeLabel: typeLabels[chat.type] || chat.type,
      description: chat.description || '',
      memberCount: memberCount,
      photoUrl: chat.photo ? `/api/telegram/${username}/photo` : null,
      link: `https://t.me/${chat.username || username}`
    });

  } catch (err) {
    res.status(500).json({ error: 'Server xatosi: ' + err.message });
  }
});

// Rasmni proksi qilib beramiz — shunda bot tokeni klientga hech qachon oshkor bo'lmaydi
app.get('/api/telegram/:username/photo', async (req, res) => {
  const username = req.params.username.replace(/^@/, '');
  if (!BOT_TOKEN) return res.status(500).end();

  try {
    const chatData = await tgApi('getChat', { chat_id: '@' + username });
    if (!chatData.ok || !chatData.result.photo) return res.status(404).end();

    const fileData = await tgApi('getFile', { file_id: chatData.result.photo.big_file_id });
    if (!fileData.ok) return res.status(404).end();

    const imgRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`);
    if (!imgRes.ok) return res.status(404).end();

    res.set('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    const buffer = await imgRes.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).end();
  }
});

app.get('/', (req, res) => {
  res.send('Telegram lookup backend ishlamoqda. /api/telegram/:username orqali foydalaning.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server ishga tushdi: port ' + PORT));
