
/**
 * Validates an OpenAI API key format
 * OpenAI keys typically start with "sk-" and are followed by a string of characters
 */
export const validateOpenAIKey = (key: string): boolean => {
  // Basic validation: starts with sk- and has typical length (around 51 characters)
  const pattern = /^sk-[A-Za-z0-9]{48}$/;
  return pattern.test(key.trim());
};

/**
 * Validates an Anthropic API key format
 * Anthropic keys typically start with "sk-ant-" and are followed by a string
 */
export const validateAnthropicKey = (key: string): boolean => {
  return key.trim().startsWith('sk-ant-') && key.length >= 20;
};

/**
 * Validates a Google AI API key format
 * Google API keys are typically strings of alphanumeric characters
 */
export const validateGoogleKey = (key: string): boolean => {
  return key.trim().length >= 20 && /^[A-Za-z0-9_-]+$/.test(key.trim());
};

/**
 * Validates an Azure API key format
 * Azure API keys are typically strings of alphanumeric characters
 */
export const validateAzureKey = (key: string): boolean => {
  return key.trim().length >= 20 && /^[A-Za-z0-9]+$/.test(key.trim());
};

/**
 * Validates a URL format
 */
export const validateUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Validates Azure URL format
 */
export const validateAzureUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    return (
      validateUrl(url) && 
      (urlObj.hostname.includes('.openai.azure.com') || 
       urlObj.hostname.includes('.azure.com'))
    );
  } catch (e) {
    return false;
  }
};