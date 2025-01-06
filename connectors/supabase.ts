import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import prisma from './prisma';

interface SupabaseJWTPayload {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  email: string;
  role: string;
  is_anonymous: boolean;
}

/**
 * Verify a Supabase JWT token and check user exists in database
 */
async function verifySupabaseTokenAndUser(token: string): Promise<{ 
  isValid: boolean; 
  payload?: SupabaseJWTPayload;
  dbUser?: any;
}> {
  try {
    // Decode the token without verifying signature
    const decoded = jwt.decode(token) as SupabaseJWTPayload;
    
    if (!decoded) {
      return { isValid: false };
    }

    // First check token claims
    const isTokenValid = Boolean(
      decoded.aud === 'authenticated' &&     // Check if audience is correct
      // decoded.exp > Math.floor(Date.now() / 1000) && // Check if token is not expired
      !decoded.is_anonymous                  // Ensure it's not an anonymous user
    );

    console.log("isTokenValid", isTokenValid)

    if (!isTokenValid) {
      return { isValid: false };
    }

    // Then verify user exists in database
    const dbUser = await prisma.user.findUnique({
      where: { email: decoded.email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        subscription: {
          select: {
            status: true,
            plan: true
          }
        }
      }
    });

    // Only valid if user exists in database
    return {
      isValid: Boolean(dbUser),
      payload: decoded,
      dbUser
    };

  } catch (error) {
    console.error('Token verification error:', error);
    return { isValid: false };
  }
}

/**
 * Express middleware to verify Supabase JWT tokens and database user
 */
export const verifyToken = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        success: false,
        message: "No authorization header provided"
      });
      return;
    }

    const token = authHeader.replace("Bearer ", "");
    
    if (!token) {
      res.status(401).json({
        success: false,
        message: "No token provided"
      });
      return;
    }

    const { isValid, payload, dbUser } = await verifySupabaseTokenAndUser(token);

    if (!isValid || !payload || !dbUser) {
      res.status(401).json({
        success: false,
        message: "Invalid token or user not found"
      });
      return;
    }

    // Return successful response with combined token and database user data
    res.status(200).json({
      success: true,
      message: "Token is valid and user exists",
      user: {
        ...dbUser,
        tokenId: payload.sub,
        authenticatedVia: payload.aud
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error while verifying token",
      error: error.message
    });
  }
};