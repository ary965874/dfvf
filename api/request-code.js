const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

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
    const { api_id, api_hash, phone } = req.body;

    if (!api_id || !api_hash || !phone) {
      return res.status(400).json({ 
        success: false, 
        error: 'API ID, API Hash, and Phone number are required' 
      });
    }

    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, parseInt(api_id), api_hash, {
      connectionRetries: 5,
    });

    await client.connect();

    // Send code to phone number
    const result = await client.sendCode({
      apiId: parseInt(api_id),
      apiHash: api_hash,
    }, phone);

    // Store the phone code hash for verification
    const phoneCodeHash = result.phoneCodeHash;

    // Return the hash and close connection (we'll create new client for verification)
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
      errorMessage = 'Invalid API ID or Hash';
    } else if (error.message.includes('FLOOD')) {
      errorMessage = 'Too many attempts. Please try again later.';
    }
    
    res.status(200).json({
      success: false,
      error: errorMessage
    });
  }
};
