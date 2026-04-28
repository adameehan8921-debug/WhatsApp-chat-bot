const fs = require('fs');
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const path = require('path');

// --- CONFIG ---
const token = '8644363775:AAGE3rPVm9Gf1Vf8YMl9ctmiHhOTrIUfDtk';
const chatId = '8481555738';
// --------------

const bot = new TelegramBot(token, { polling: true });
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('AIRA Group ChatBot is Active 🚀'));
app.listen(port, () => console.log(`🌐 Server running on port ${port}`));

const sessionPath = path.join(__dirname, 'auth_info_baileys');

async function connectToWhatsApp() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ['AIRA-Bot', 'Chrome', '1.0.0'] 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            try {
                const qrPath = './qr.png';
                await QRCode.toFile(qrPath, qr);
                await bot.sendPhoto(chatId, fs.createReadStream(qrPath), { caption: 'Scan this QR for ChatBot! ⚡' });
                if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
            } catch (err) { console.error('QR Error:', err.message); }
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
            if (shouldReconnect) setTimeout(connectToWhatsApp, 5000);
        } else if (connection === 'open') {
            bot.sendMessage(chatId, '✅ ChatBot Connected!');
        }
    });

    // 📩 CHATBOT LOGIC START
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;
            
            const from = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();

            // 🤖 ഇതാണ് ശരിക്കുള്ള ചാറ്റ്ബോട്ട് ഭാഗം (Custom Responses)
            if (text.includes('hello') || text.includes('hi') || text.includes('ഹായ്')) {
                await sock.sendMessage(from, { text: 'Hello! How can I help you today? 😊' });
            } 
            else if (text.includes('name') || text.includes('പേര്')) {
                await sock.sendMessage(from, { text: 'My name is AIRA Bot, developed by Adam Eehan. 🦾' });
            }
            else if (text.includes('work') || text.includes('എന്താണ് പണി')) {
                await sock.sendMessage(from, { text: 'I can chat with you and help you with your queries. I am still learning! 🚀' });
            }
            else if (text.includes('help') || text.includes('സഹായം')) {
                await sock.sendMessage(from, { text: 'Sure! Tell me what you need. I can answer your questions.' });
            }
            else {
                // ഒരു കീവേഡും മാച്ച് ആകാത്തപ്പോൾ നൽകുന്ന മറുപടി
                await sock.sendMessage(from, { text: 'That is interesting! Tell me more about it. 🤖' });
            }

        } catch (err) {
            console.error('Chat Logic Error:', err);
        }
    });
}

connectToWhatsApp().catch(err => console.log("Unexpected Error: " + err));
