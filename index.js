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
const bot = new TelegramBot(token, { polling: false });

async function startTelegram() {
    try {
        await bot.deleteWebHook().catch(() => {});
        await bot.startPolling();
        console.log('✅ Telegram started');
    } catch (err) {
        console.error('❌ Telegram error:', err.message);
        setTimeout(startTelegram, 5000);
    }
}
startTelegram();

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

    let qrSent = false;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // 📲 QR → PNG → Telegram
        if (qr && !qrSent) {
            qrSent = true;

            try {
                const filePath = './qr.png';

                // ✅ Generate PNG file
                await QRCode.toFile(filePath, qr);

                // ✅ Send as file (better than buffer)
                await bot.sendPhoto(chatId, fs.createReadStream(filePath), {
                    caption: '📱 Scan this QR to login WhatsApp'
                });

                console.log('📤 QR PNG sent to Telegram');

                // 🧹 optional: delete file after send
                fs.unlinkSync(filePath);

            } catch (err) {
                console.error('❌ QR send error:', err.message);
            }
        }

        if (connection === 'close') {
            qrSent = false;

            const shouldReconnect = (lastDisconnect?.error instanceof Boom)
                ? lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut
                : true;

            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
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

connectToWhatsApp();
