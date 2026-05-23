const { getStatus } = require('../whatsapp/client');

// GET /api/whatsapp/status
const getWhatsAppStatus = (req, res) => {
  const { isReady, hasClient, isInitializing } = getStatus();

  let statusMessage;
  let statusCode;

  if (isReady) {
    statusMessage = 'WhatsApp is connected and ready to send messages.';
    statusCode    = 'connected';
  } else if (isInitializing || hasClient) {
    statusMessage = 'WhatsApp is initializing. Please scan the QR code in the terminal.';
    statusCode    = 'pending';
  } else {
    statusMessage = 'WhatsApp client is not running.';
    statusCode    = 'disconnected';
  }

  res.json({ isReady, hasClient, isInitializing, statusCode, statusMessage });
};

module.exports = { getWhatsAppStatus };
