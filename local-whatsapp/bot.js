/**
 * EduTrack WhatsApp Bot — Local Edition
 * 
 * This bot runs on your local machine (or a Raspberry Pi / VPS) and:
 *   1. Connects to WhatsApp via QR code (one-time)
 *   2. Polls the cloud EduTrack server for pending messages
 *   3. Sends the messages via WhatsApp
 *   4. Reports delivery status back to the cloud
 * 
 * Usage:
 *   cd local-whatsapp
 *   npm install
 *   npm start
 * 
 * First run: scan the QR code with your WhatsApp.
 * Subsequent runs: auto-connects using saved session.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

// ─── Configuration ───────────────────────────────────────────────────────────
const CLOUD_URL  = process.env.CLOUD_URL  || 'https://edutrack-sai-production.up.railway.app';
const BOT_KEY    = process.env.BOT_KEY    || 'edutrack-bot-secret-2024';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 30000; // 30 seconds
const MESSAGE_DELAY = parseInt(process.env.MESSAGE_DELAY) || 2000;  // 2s between messages

// ─── State ───────────────────────────────────────────────────────────────────
let isWhatsAppReady = false;
let messagesSentToday = 0;

// ─── Print banner ────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║   🚀 EduTrack WhatsApp Bot — Local Edition          ║');
console.log('╠══════════════════════════════════════════════════════╣');
console.log(`║  Cloud API : ${CLOUD_URL.substring(0, 40).padEnd(40)}║`);
console.log(`║  Poll Rate : Every ${(POLL_INTERVAL / 1000)}s${' '.repeat(33)}║`);
console.log('╚══════════════════════════════════════════════════════╝\n');

// ─── WhatsApp Client ─────────────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  },
});

client.on('qr', (qr) => {
  console.log('\n📱 Scan this QR code with WhatsApp:\n');
  qrcode.generate(qr, { small: true });
  console.log('\n👉 Open WhatsApp → Settings → Linked Devices → Link a Device\n');
});

client.on('ready', () => {
  isWhatsAppReady = true;
  console.log('✅ WhatsApp is connected and ready!');
  console.log(`📡 Polling ${CLOUD_URL} every ${POLL_INTERVAL / 1000}s for pending messages...\n`);
  startPolling();
});

client.on('authenticated', () => {
  console.log('🔐 Session authenticated (saved for next time)');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
  console.log('💡 Try deleting the .wwebjs_auth folder and scanning again.');
});

client.on('disconnected', (reason) => {
  isWhatsAppReady = false;
  console.log('❌ WhatsApp disconnected:', reason);
  console.log('🔄 Reconnecting in 10 seconds...');
  setTimeout(() => client.initialize(), 10000);
});

// ─── Polling Loop ────────────────────────────────────────────────────────────
let pollTimer = null;

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(checkAndSendMessages, POLL_INTERVAL);
  // Run immediately on start
  checkAndSendMessages();
}

async function checkAndSendMessages() {
  if (!isWhatsAppReady) {
    console.log('⏳ WhatsApp not ready, skipping poll...');
    return;
  }

  try {
    const response = await axios.get(`${CLOUD_URL}/api/whatsapp/pending-messages`, {
      headers: { 'x-bot-key': BOT_KEY },
      timeout: 10000,
    });

    const { count, messages } = response.data;

    if (count === 0) {
      // Silent — no spam in the console
      return;
    }

    console.log(`\n📬 Found ${count} pending message(s). Sending...`);

    for (const msg of messages) {
      await sendAndReport(msg);
      // Small delay between messages to avoid WhatsApp rate limiting
      if (messages.indexOf(msg) < messages.length - 1) {
        await sleep(MESSAGE_DELAY);
      }
    }

    console.log(`✅ Batch complete. Total sent today: ${messagesSentToday}\n`);

  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.log('⚠️  Cannot reach cloud server. Is it running?');
    } else if (error.response?.status === 401) {
      console.log('⚠️  Invalid BOT_KEY! Check your configuration.');
    } else {
      console.log(`⚠️  Poll error: ${error.message}`);
    }
  }
}

async function sendAndReport(msg) {
  const { id, phone, message, student_name } = msg;

  try {
    const chatId = `${phone}@c.us`;
    await client.sendMessage(chatId, message);
    messagesSentToday++;

    console.log(`  ✅ Sent to ${student_name || phone}`);

    // Report success to cloud
    await axios.post(`${CLOUD_URL}/api/whatsapp/mark-sent`, {
      messageId: id,
      success: true,
    }, {
      headers: { 'x-bot-key': BOT_KEY },
      timeout: 10000,
    });

  } catch (error) {
    console.log(`  ❌ Failed for ${student_name || phone}: ${error.message}`);

    // Report failure to cloud
    try {
      await axios.post(`${CLOUD_URL}/api/whatsapp/mark-sent`, {
        messageId: id,
        success: false,
        error: error.message,
      }, {
        headers: { 'x-bot-key': BOT_KEY },
        timeout: 10000,
      });
    } catch (reportErr) {
      console.log(`  ⚠️  Could not report failure: ${reportErr.message}`);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  if (pollTimer) clearInterval(pollTimer);
  if (isWhatsAppReady) {
    await client.destroy();
  }
  process.exit(0);
});

// ─── Start ───────────────────────────────────────────────────────────────────
console.log('🔄 Initializing WhatsApp client...');
client.initialize();
