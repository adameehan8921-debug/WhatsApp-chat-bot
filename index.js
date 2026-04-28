const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');

// --- CONFIG ---
const token = process.env.TELEGRAM_TOKEN || '8701301869:AAGiFFPQOk-gxZfIm5Irnfv57bqkMlLKcyA';
const chatId = process.env.CHAT_ID || '8142078717';
// ---------------

const bot = new TelegramBot(token, { polling: true });

const app = express();
const port = process.env.PORT || 3000;

// Health check
app.get('/', (req, res) => res.send('✅ WhatsApp Bot Running'));
app.listen(port, () => console.log(`🌐 Server running on port ${port}`));

async function connectToWhatsApp() {

    // 🔥 IMPORTANT: persistent path
    const { state, saveCreds } = await useMultiFileAuthState('/data/auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    let qrSent = false;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // 📲 QR → Telegram
        if (qr && !qrSent) {
            qrSent = true;
            console.log('📤 Sending QR to Telegram...');
            try {
                const qrBuffer = await QRCode.toBuffer(qr);
                await bot.sendPhoto(chatId, qrBuffer, {
                    caption: '📱 Scan this QR to login WhatsApp'
                });
            } catch (err) {
                console.error('❌ Telegram error:', err);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;

            const shouldReconnect = (lastDisconnect?.error instanceof Boom)
                ? statusCode !== DisconnectReason.loggedOut
                : true;

            console.log('⚠️ Connection closed:', statusCode);

            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log('❌ Logged out! Delete session folder.');
            }

        } else if (connection === 'open') {
            console.log('✅ WhatsApp Connected!');
            bot.sendMessage(chatId, '✅ WhatsApp Connected!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                '';

            if (text.toLowerCase().includes('hi')) {
                await sock.sendMessage(msg.key.remoteJid, { text: 'Hello 👋' });
            }

        } catch (err) {
            console.error('❌ Message error:', err);
        }
    });
}

connectToWhatsApp();
