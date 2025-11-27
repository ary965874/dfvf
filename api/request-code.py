from http.server import BaseHTTPRequestHandler
import json
import os
import sys
from telethon import TelegramClient
from telethon.sessions import StringSession
import asyncio

# Add current directory to path
sys.path.append(os.path.dirname(__file__))

API_ID = 23171051
API_HASH = '10331d5d712364f57ffdd23417f4513c'

async def send_code(phone):
    client = TelegramClient(StringSession(), API_ID, API_HASH)
    await client.connect()
    
    # Send code to the phone number
    result = await client.send_code_request(phone)
    phone_code_hash = result.phone_code_hash
    
    await client.disconnect()
    return phone_code_hash

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
            
            if not phone:
                response = {'success': False, 'error': 'Phone number is required'}
                self.wfile.write(json.dumps(response).encode())
                return
            
            # Run async function
            phone_code_hash = asyncio.run(send_code(phone))
            
            response = {
                'success': True,
                'phone_code_hash': phone_code_hash,
                'message': 'Verification code sent successfully'
            }
            
        except Exception as e:
            error_msg = str(e)
            if 'PHONE_NUMBER_INVALID' in error_msg:
                error_msg = 'Invalid phone number format'
            elif 'PHONE_NUMBER_UNOCCUPIED' in error_msg:
                error_msg = 'Phone number not registered on Telegram'
            elif 'FLOOD' in error_msg:
                error_msg = 'Too many attempts. Please try again later.'
            
            response = {'success': False, 'error': error_msg}
        
        self.wfile.write(json.dumps(response).encode())
