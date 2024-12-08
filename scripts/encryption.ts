import crypto from 'crypto';

// Generate a secure encryption key
const generateEncryptionKey = () => {
  // Generate a 32-byte (256-bit) random key
  const key = crypto.randomBytes(32);
  
  // Convert to base64 for storage in environment variables
  return key.toString('base64');
};

// Example key generation
const encryptionKey = generateEncryptionKey();
console.log('Generated Encryption Key (save this securely):', encryptionKey);

// Example .env format
console.log('\nAdd this to your .env file:');
console.log(`ENCRYPTION_KEY="${encryptionKey}"`);

// Example usage in your application
console.log('\nIn your application code:');
console.log('const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY!, "base64");');

// Generate a few sample keys
console.log('\nHere are 3 sample secure encryption keys you can use:');
for(let i = 0; i < 3; i++) {
  console.log(`Key ${i + 1}: ${generateEncryptionKey()}`);
}