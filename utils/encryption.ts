import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-agentkube-secret-key-here'; // 32 chars for AES-256
const ENCRYPTION_METHOD = 'aes-256-cbc';

// Generate a secure API key
export const generateApiKey = () => {
  return `ak_${crypto.randomBytes(16).toString('hex')}`;
};


export const encryptApiKey = (text: string) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_METHOD, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};


export const decryptApiKey = (text: string) => {
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ENCRYPTION_METHOD, ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};