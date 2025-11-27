const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

// Hardcoded API credentials
const API_ID = 23171051;
const API_HASH = '10331d5d712364f57ffdd23417f4513c';

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone number is required' 
      });
    }

    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, API_ID, API_HASH, {
      connectionRetries: 5,
    });

    await client.connect();

    // Send code to phone number
    const result = await client.sendCode({
      apiId: API_ID,
      apiHash: API_HASH,
    }, phone);

    // Store the phone code hash for verification
    const phoneCodeHash = result.phoneCodeHash;

    await client.disconnect();

    res.status(200).json({
      success: true,
      phone_code_hash: phoneCodeHash,
      message: 'Verification code sent to your Telegram account'
    });

  } catch (error) {
    console.error('Error sending code:', error);
    
    let errorMessage = error.message;
    if (error.message.includes('PHONE_NUMBER_INVALID')) {
      errorMessage = 'Invalid phone number format';
    } else if (error.message.includes('PHONE_NUMBER_UNOCCUPIED')) {
      errorMessage = 'Phone number not registered on Telegram';
    } else if (error.message.includes('API_ID_INVALID')) {
      errorMessage = 'Invalid API credentials';
    } else if (error.message.includes('FLOOD')) {
      errorMessage = 'Too many attempts. Please try again later.';
    }
    
    res.status(200).json({
      success: false,
      error: errorMessage
    });
  }
};
