const fs = require('fs');

const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');

// --- CONFIG (DIRECT VALUES) ---
const token = '8644363775:AAGE3rPVm9Gf1Vf8YMl9ctmiHhOTrIUfDtk';
const chatId = '8481555738';
// -----------------------------

// ✅ Telegram bot (safe start to avoid 409)
const bot = new TelegramBot(token, { polling: false });

(async () => {
    try {
        await bot.deleteWebHook().catch(() => {});
        await bot.startPolling();
        console.log('✅ Telegram started');
    } catch (err) {
        console.error('❌ Telegram error:', err.message);
    }
})();

// ✅ Express server
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('✅ WhatsApp Bot Running'));
app.listen(port, () => console.log(`🌐 Server running on port ${port}`));

// 🔥 New session (fix 405 permanently)
function getSessionPath() {
    try {
        fs.mkdirSync('/data', { recursive: true });
        return '/data/auth_info_baileys_v3'; // 🔥 new session
    } catch {
        return './auth_info_baileys_v3';
    }
}

async function connectToWhatsApp() {

    const { state, saveCreds } = await useMultiFileAuthState(getSessionPath());

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // 🔥 ALWAYS send QR to Telegram
        if (qr) {
            console.log('📲 QR generated');

            try {
                const filePath = './qr.png';

                await QRCode.toFile(filePath, qr);

                await bot.sendPhoto(chatId, fs.createReadStream(filePath), {
                    caption: '📱 Scan this QR FAST ⚡'
                });

                fs.unlink(filePath, () => {});
                console.log('✅ QR sent to Telegram');

            } catch (err) {
                console.error('❌ QR error:', err.message);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;

            console.log('⚠️ Connection closed:', statusCode);

            const shouldReconnect = (lastDisconnect?.error instanceof Boom)
                ? statusCode !== DisconnectReason.loggedOut
                : true;

            if (shouldReconnect) {
                console.log('🔁 Reconnecting...');
                setTimeout(connectToWhatsApp, 4000);
            } else {
                console.log('❌ Logged out! Delete session folder.');
            }

        } else if (connection === 'open') {
            console.log('✅ WhatsApp Connected!');
            bot.sendMessage(chatId, '✅ WhatsApp Connected!');
        }
    });

    // 📩 Auto reply
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const text =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                '';

            console.log('📩 Message:', text);

            if (text.toLowerCase().includes('hi')) {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: 'Hello 👋'
                });
            }

        } catch (err) {
            console.error('❌ Message error:', err);
        }
    });
}

// 🚀 Start
connectToWhatsApp();
