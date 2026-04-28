const fs = require('fs');

const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');

// --- CONFIG ---
const token = '8635875959:AAFHHj5-DiI4lQ0AiebLa0BcyTwgq51-omM';
const chatId = '8481555738';
// ---------------

// ✅ Telegram bot
const bot = new TelegramBot(token, { polling: true });

// ✅ Express server
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('✅ WhatsApp Bot Running'));
app.listen(port, () => console.log(`🌐 Server running on port ${port}`));

// 🔥 Session path
function getSessionPath() {
    try {
        fs.mkdirSync('/data', { recursive: true });
        return '/data/auth_info_baileys';
    } catch {
        return './auth_info_baileys';
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

        // 🔥 ALWAYS send QR
        if (qr) {
            console.log('📲 QR generated');

            try {
                const filePath = './qr.png';

                await QRCode.toFile(filePath, qr);

                await bot.sendPhoto(chatId, fs.createReadStream(filePath), {
                    caption: '📱 Scan quickly (QR expires fast)'
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
                setTimeout(connectToWhatsApp, 3000);
            } else {
                console.log('❌ Logged out!');
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
