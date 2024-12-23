import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import prisma from '../../connectors/prisma';
import { Buffer } from 'buffer';

/**
 * Get the consent URL for DocuSign JWT authentication
 */
export const getConsentUrl = async (req: Request, res: Response) => {
  const { redirect_uri } = req.body;

  try {
    const params = new URLSearchParams({
      response_type: 'code',
      scope: 'signature impersonation',
      client_id: process.env.DOCUSIGN_INTEGRATION_KEY!,
      redirect_uri: redirect_uri
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


interface SignatureRequestBody {
  investigation_id: string;
  investigation_summary: string;
  emails: string[];
  comment: string;
  access_token: string;
  account_id: string;
}

export const sendEnvelopeREST = async (
  req: Request<{}, {}, SignatureRequestBody>,
  res: Response
) => {
  try {
    const {
      investigation_id,
      investigation_summary,
      emails,
      comment,
      access_token,
      account_id
    } = req.body;

    if (!investigation_id || !investigation_summary || !emails || !access_token || !account_id) {
      res.status(400).json({
        error: 'Missing required fields'
      });
      return;
    }

    // Get Investigation details from database
    const investigation = await prisma.investigation.findUnique({
      where: { id: investigation_id },
      include: {
        protocol: {
          select: {
            name: true,
            description: true
          }
        },
        cluster: {
          select: {
            clusterName: true
          }
        }
      }
    });

    if (!investigation) {
      res.status(404).json({
        error: 'Investigation not found'
      });
      return;
    }

    // Format investigation results
    const results = investigation.results as Record<string, any>;
    const status = results?.status || investigation.status;
    const startedAt = results?.startedAt || investigation.createdAt;
    const completedAt = results?.completedAt || investigation.updatedAt;

    // Create HTML document with proper styling
    const documentHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              border-bottom: 2px solid #eee;
              padding-bottom: 20px;
              margin-bottom: 20px;
            }
            .section {
              margin-bottom: 20px;
            }
            .section-title {
              font-weight: bold;
              color: #2c3e50;
              margin-bottom: 10px;
            }
            .signature-section {
              margin-top: 40px;
              border-top: 1px solid #eee;
              padding-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Investigation Report</h1>
            <p>Protocol: ${investigation.protocol.name}</p>
            <p>Cluster: ${investigation.cluster.clusterName}</p>
            <p>Investigation ID: ${investigation_id}</p>
          </div>

          <div class="section">
            <div class="section-title">Description</div>
            <p>${investigation.protocol.description}</p>
          </div>

          <div class="section">
            <div class="section-title">Investigation Summary</div>
            <p>${investigation_summary}</p>
          </div>

          ${comment ? `
          <div class="section">
            <div class="section-title">Comments</div>
            <p>${comment}</p>
          </div>
          ` : ''}

          <div class="section">
            <div class="section-title">Status Information</div>
            <p>Status: ${status}</p>
            <p>Started: ${new Date(startedAt).toLocaleString()}</p>
            <p>Completed: ${new Date(completedAt).toLocaleString()}</p>
          </div>

          <div class="signature-section">
            <p>By signing below, I acknowledge that I have reviewed this investigation report:</p>
            <p>Signature: <span style="color:white;">**signature_1**</span></p>
            <p>Date: ${new Date().toLocaleDateString()}</p>
          </div>
        </body>
      </html>
    `;

    // Create envelope payload
    const envelopePayload = {
      emailSubject: `Investigation Report Review - ${investigation.protocol.name}`,
      status: 'sent',
      documents: [{
        documentBase64: Buffer.from(documentHtml).toString('base64'),
        name: `Investigation_Report_${investigation_id}`,
        fileExtension: 'html',
        documentId: '1'
      }],
      recipients: {
        signers: [{
          email: emails[0],
          name: 'Investigation Reviewer',
          recipientId: '1',
          routingOrder: '1',
          tabs: {
            signHereTabs: [{
              anchorString: '**signature_1**',
              anchorYOffset: '10',
              anchorUnits: 'pixels',
              anchorXOffset: '20'
            }]
          }
        }],
        carbonCopies: emails.length > 1 ? emails.slice(1).map((email, index) => ({
          email,
          name: `CC Recipient ${index + 1}`,
          recipientId: String(index + 2),
          routingOrder: '2'
        })) : undefined
      }
    };

    // Send envelope using REST API
    const response = await fetch(
      `https://demo.docusign.net/restapi/v2.1/accounts/${account_id}/envelopes`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(envelopePayload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`DocuSign API error: ${JSON.stringify(data)}`);
    }

    res.status(201).json({
      message: 'Envelope sent successfully',
      data,
      investigation: {
        id: investigation_id,
        name: investigation.protocol.name,
        status: status
      }
    });
  } catch (error) {
    console.error('DocuSign envelope error:', error);
    res.status(500).json({
      error: 'Failed to send envelope',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};