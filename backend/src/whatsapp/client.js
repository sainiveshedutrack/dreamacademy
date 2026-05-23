const path = require('path');
const qrcode = require('qrcode-terminal');

let whatsappClient = null;
let isReady = false;
let isInitializing = false;
let latestQr = null;

/**
 * Boot the WhatsApp Web client
 */
const initWhatsApp = async () => {
  if (isInitializing || whatsappClient) return;

  isInitializing = true;

  try {
    const { Client, LocalAuth } = require('whatsapp-web.js');

    // IMPORTANT FOR RENDER
    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      process.env.CHROME_BIN ||
      undefined;

    console.log('🚀 Starting WhatsApp...');
    console.log('📍 Chrome path:', executablePath || 'Bundled Chromium');

    const client = new Client({
      authStrategy: new LocalAuth({
        dataPath: path.join(process.cwd(), '.wwebjs_auth'),
      }),

      puppeteer: {
        headless: true,

        executablePath,

        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--single-process',
        ],
      },
    });

    // ─────────────────────────────────────────────
    // QR EVENT
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

    // ─────────────────────────────────────────────
    // AUTHENTICATED
    // ─────────────────────────────────────────────
    client.on('authenticated', () => {
      latestQr = null;

      console.log('🔐 WhatsApp authenticated!');
    });

    // ─────────────────────────────────────────────
    // READY
    // ─────────────────────────────────────────────
    client.on('ready', () => {
      isReady = true;
      latestQr = null;

      console.log('✅ WhatsApp client is READY!');
    });

    // ─────────────────────────────────────────────
    // LOADING
    // ─────────────────────────────────────────────
    client.on('loading_screen', (percent, message) => {
      console.log(`⏳ ${percent}% - ${message}`);
    });

    // ─────────────────────────────────────────────
    // AUTH FAILURE
    // ─────────────────────────────────────────────
    client.on('auth_failure', (msg) => {
      isReady = false;

      console.error('❌ Auth failure:', msg);

      whatsappClient = null;
      isInitializing = false;

      setTimeout(initWhatsApp, 30000);
    });

    // ─────────────────────────────────────────────
    // DISCONNECTED
    // ─────────────────────────────────────────────
    client.on('disconnected', (reason) => {
      isReady = false;

      console.log('⚠️ WhatsApp disconnected:', reason);

      whatsappClient = null;
      isInitializing = false;

      setTimeout(initWhatsApp, 10000);
    });

    // SAVE CLIENT
    whatsappClient = client;

    // INITIALIZE
    await client.initialize();

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
    const cleanPhone = phone.replace(/\D/g, '');

    const numberId = await whatsappClient.getNumberId(cleanPhone);

    const chatId = numberId
      ? numberId._serialized
      : `${cleanPhone}@c.us`;

    await whatsappClient.sendMessage(chatId, message);

    console.log(`✅ Message sent to ${cleanPhone}`);

  } catch (err) {
    console.error(`❌ Send error for ${phone}:`, err);

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

/**
 * Get QR
 */
const getLatestQr = () => latestQr;

module.exports = {
  initWhatsApp,
  sendMessage,
  getStatus,
  getLatestQr,
};