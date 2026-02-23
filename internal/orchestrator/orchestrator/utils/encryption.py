import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import binascii

ENCRYPTION_SECRET = ""

def encrypt_data(text: str) -> str:
    """
    Encrypt data using AES-256-CBC (compatible with Node.js implementation)
    
    Args:
        text: Text to encrypt
    
    Returns:
        Encrypted text in format 'iv:encrypted_data'
    """
    # Get the encryption key from environment or use a default (for development only)
    encryption_key = os.getenv("ENCRYPTION_KEY", ENCRYPTION_SECRET)
    # Use only first 32 chars as in Node.js implementation
    key = encryption_key[:32].encode()
    
    # Generate a random 16-byte IV
    iv = os.urandom(16)
    
    # Create cipher with CBC mode
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    
    # Pad the text to be a multiple of 16 bytes (AES block size)
    padded_text = _pad_text(text.encode('utf-8'))
    
    # Encrypt the padded text
    encrypted_data = encryptor.update(padded_text) + encryptor.finalize()
    
    # Return as iv:encrypted_data in hex format
    return f"{binascii.hexlify(iv).decode()}:{binascii.hexlify(encrypted_data).decode()}"

def decrypt_data(encrypted_text: str) -> str:
    """
    Decrypt data (compatible with Node.js implementation)
    
    Args:
        encrypted_text: Text to decrypt (iv:encryptedData format)
    
    Returns:
        Decrypted text
    """
    # Split the encrypted text into IV and encrypted data
    parts = encrypted_text.split(':')
    if len(parts) != 2:
        raise ValueError("Invalid encrypted text format")
    
    iv = binascii.unhexlify(parts[0])
    encrypted_data = binascii.unhexlify(parts[1])
    
    # Get the encryption key
    encryption_key = os.getenv("ENCRYPTION_KEY", ENCRYPTION_SECRET)
    key = encryption_key[:32].encode()
    
    # Create cipher with CBC mode
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    
    # Decrypt the data
    decrypted_padded = decryptor.update(encrypted_data) + decryptor.finalize()
    
    # Remove padding
    decrypted = _unpad_text(decrypted_padded)
    
    return decrypted.decode('utf-8')

def _pad_text(data: bytes) -> bytes:
    """
    Pad text to be a multiple of 16 bytes (AES block size)
    Uses PKCS#7 padding (same as Node.js)
    """
    block_size = 16
    padding_length = block_size - (len(data) % block_size)
    padding = bytes([padding_length] * padding_length)
    return data + padding

def _unpad_text(data: bytes) -> bytes:
    """
    Remove PKCS#7 padding
    """
    padding_length = data[-1]
    return data[:-padding_length]