const path    = require('path');
const qrcode  = require('qrcode-terminal');

let whatsappClient = null;
let isReady        = false;
let isInitializing = false;
let latestQr       = null;

/**
 * Boot the WhatsApp Web client.
 * Prints a QR code to the terminal on first run.
 * Session is cached in .wwebjs_auth/ so future starts skip QR.
 *
 * Uses PUPPETEER_EXECUTABLE_PATH env var if available (Docker/cloud),
 * otherwise falls back to bundled Chromium (local dev).
 */
const initWhatsApp = () => {
  if (isInitializing || whatsappClient) return;
  isInitializing = true;

  // Dynamic require so builds don't fail if puppeteer is missing
  const { Client, LocalAuth } = require('whatsapp-web.js');

  const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--single-process',
  ];

  const puppeteerOpts = {
    headless: true,
    args: puppeteerArgs,
  };

  // Use system Chromium if available (Docker / Railway)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    puppeteerOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(process.cwd(), '.wwebjs_auth'),
    }),
    puppeteer: puppeteerOpts,
  });

  // ── Events ──────────────────────────────────────────────────────────────────
  client.on('qr', (qr) => {
    latestQr = qr;
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║        📱  SCAN THIS QR CODE WITH WHATSAPP  📱           ║');
    console.log('║   Open WhatsApp → Settings → Linked Devices → Link       ║');
    console.log('║   Or visit the /api/whatsapp/qr page in your browser     ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('\n');
    qrcode.generate(qr, { small: true });
    console.log('\n⏳ Waiting for QR scan...\n');
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ WhatsApp loading: ${percent}% — ${message}`);
  });

  client.on('authenticated', () => {
    latestQr = null;
    console.log('🔐 WhatsApp authenticated! Loading session...');
  });

  client.on('ready', () => {
    isReady = true;
    latestQr = null;
    console.log('✅ WhatsApp client is ready — messages will be sent automatically!');
  });

  client.on('auth_failure', (msg) => {
    isReady = false;
    console.error('❌ WhatsApp auth failure:', msg);
    console.log('🔄 Retrying in 30 seconds...');
    setTimeout(() => {
      whatsappClient = null;
      isInitializing = false;
      initWhatsApp();
    }, 30_000);
  });

  client.on('disconnected', (reason) => {
    isReady = false;
    console.warn('⚠️  WhatsApp disconnected:', reason);
    console.log('🔄 Reconnecting in 10 seconds...');
    whatsappClient = null;
    isInitializing = false;
    setTimeout(initWhatsApp, 10_000);
  });

  client.initialize().catch((err) => {
    console.error('❌ WhatsApp init error:', err.message);
    whatsappClient = null;
    isInitializing = false;
    // Retry after 30 seconds
    console.log('🔄 Retrying WhatsApp in 30 seconds...');
    setTimeout(initWhatsApp, 30_000);
  });

  whatsappClient = client;
};

/**
 * Send a WhatsApp message to a phone number.
 * @param {string} phone  - Number with country code, e.g. "919876543210"
 * @param {string} message - Message text
 */
const sendMessage = async (phone, message) => {
  if (!whatsappClient || !isReady) {
    throw new Error('WhatsApp client not ready. Please scan the QR code first.');
  }

  // Use getNumberId() to resolve the correct chat ID and avoid "No LID for user" errors
  const numberId = await whatsappClient.getNumberId(phone);
  if (!numberId) {
    throw new Error(`Phone number ${phone} is not registered on WhatsApp.`);
  }

  const chatId = numberId._serialized;
  await whatsappClient.sendMessage(chatId, message);
};

/**
 * Get current WhatsApp connection status.
 */
const getStatus = () => ({
  isReady,
  hasClient:    !!whatsappClient,
  isInitializing,
  isDisabled:   false,
});

const getLatestQr = () => latestQr;

module.exports = { initWhatsApp, sendMessage, getStatus, getLatestQr };
