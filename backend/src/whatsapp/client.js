const path = require('path');
const qrcode = require('qrcode-terminal');

let whatsappClient = null;
let isReady = false;
let isInitializing = false;
let latestQr = null;

/**
 * Boot WhatsApp
 */
const initWhatsApp = async () => {
  if (isInitializing || whatsappClient) return;

  isInitializing = true;

  try {
    console.log('🚀 Starting WhatsApp...');

    const { Client, LocalAuth } = require('whatsapp-web.js');
    const puppeteer = require('puppeteer');

    // AUTO DETECT CHROME PATH
    const browserPath = puppeteer.executablePath();

    console.log('📍 Chrome path:', browserPath);

    const client = new Client({
      authStrategy: new LocalAuth({
        dataPath: path.join(process.cwd(), '.wwebjs_auth'),
      }),

      puppeteer: {
        headless: 'new',
        executablePath: browserPath,

args: [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
  '--single-process',
  '--no-remote',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
],
      },
    });

    // ─────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────

    client.on('qr', (qr) => {
      latestQr = qr;

      console.log('\n');
      console.log('╔══════════════════════════════════════════════╗');
      console.log('║        📱 SCAN THIS QR WITH WHATSAPP        ║');
      console.log('╚══════════════════════════════════════════════╝');
      console.log('\n');

      qrcode.generate(qr, { small: true });

      console.log('\n⏳ Waiting for QR scan...\n');
    });

    client.on('authenticated', () => {
      latestQr = null;
      console.log('🔐 WhatsApp authenticated!');
    });

    client.on('ready', () => {
      isReady = true;
      latestQr = null;

      console.log('✅ WhatsApp client is READY!');
    });

    client.on('loading_screen', (percent, message) => {
      console.log(`⏳ ${percent}% - ${message}`);
    });

    client.on('auth_failure', (msg) => {
      isReady = false;

      console.error('❌ Auth failure:', msg);

      whatsappClient = null;
      isInitializing = false;

      setTimeout(initWhatsApp, 30000);
    });

    client.on('disconnected', (reason) => {
      isReady = false;

      console.log('⚠️ WhatsApp disconnected:', reason);

      whatsappClient = null;
      isInitializing = false;

      setTimeout(initWhatsApp, 10000);
    });

    await client.initialize();

    whatsappClient = client;

  } catch (err) {
    console.error('❌ WhatsApp init error:', err);

    whatsappClient = null;
    isInitializing = false;

    console.log('🔄 Retrying in 30 seconds...');

    setTimeout(initWhatsApp, 30000);
  }
};

/**
 * Send WhatsApp message
 */
const sendMessage = async (phone, message) => {
  if (!whatsappClient || !isReady) {
    throw new Error('WhatsApp client not ready.');
  }

  try {
    const numberId = await whatsappClient.getNumberId(phone);

    const chatId = numberId
      ? numberId._serialized
      : `${phone}@c.us`;

    await whatsappClient.sendMessage(chatId, message);

  } catch (err) {
    console.error(`Send error for ${phone}:`, err);

    throw new Error(err.message || 'Failed to send message');
  }
};

/**
 * Status
 */
const getStatus = () => ({
  isReady,
  hasClient: !!whatsappClient,
  isInitializing,
  isDisabled: false,
});

const getLatestQr = () => latestQr;

module.exports = {
  initWhatsApp,
  sendMessage,
  getStatus,
  getLatestQr,
};