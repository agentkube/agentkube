import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";

/**
 * Get the consent URL for DocuSign JWT authentication
 */
export const getConsentUrl = async (_: Request, res: Response) => {
  try {
    const params = new URLSearchParams({
      response_type: 'code',
      scope: 'signature impersonation',
      client_id: process.env.DOCUSIGN_INTEGRATION_KEY!,
      redirect_uri: 'https://agentkube.com/'
    });

    const consentUrl = `https://account-d.docusign.com/oauth/auth?${params.toString()}`;
    
    res.json({ 
      consent_url: consentUrl,
      message: "Open this URL in a browser to grant consent. After consent, you can close the page."
    });
  } catch (error) {
    console.error('DocuSign error:', error);
    res.status(500).json({ error: 'Failed to generate consent URL' });
  }
};

/**
 * Initialize DocuSign and get access token (only call this after consent is granted)
 */

// Step 3: Get access token
export const getAccessToken = async (_: Request, res: Response) => {
  try {
    // Read private key from file
    const privateKeyPath = path.join(__dirname, '../../keys/private.key');
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

    // Create JWT
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: process.env.DOCUSIGN_INTEGRATION_KEY,
      sub: process.env.DOCUSIGN_IMPERSONATED_USER_ID,
      aud: 'account-d.docusign.com',
      iat: now,
      exp: now + 3600,
      scope: "signature impersonation"
    };

    const assertion = jwt.sign(payload, {
      key: privateKey,
      passphrase: ''
    }, { 
      algorithm: 'RS256'
    });

    // Exchange JWT for access token
    const response = await fetch('https://account-d.docusign.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`DocuSign API error: ${JSON.stringify(data)}`);
    }

    res.json(data);

  } catch (error) {
    console.error('DocuSign token error:', error);
    res.status(500).json({ 
      error: 'Failed to get access token',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};



// Step 4: Get user info and base URI
export const getUserInfo = async (req: Request, res: Response) => {
  try {
    const { access_token } = req.body;

    if (!access_token) {
      res.status(400).json({ error: 'access_token is required' });
      return;
    }

    const response = await fetch('https://account-d.docusign.com/oauth/userinfo', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error('DocuSign userinfo error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
};


