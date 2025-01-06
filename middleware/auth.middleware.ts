import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../connectors/prisma";

interface SupabaseJWTPayload {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  email: string;
  role: string;
  is_anonymous: boolean;
}

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
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
      !decoded.is_anonymous                  // Ensure it's not an anonymous user
    );

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
 * Express middleware to verify Supabase JWT tokens and attach user to request
 */
export const verifyAuthToken = async (req: Request, res: Response, next: NextFunction) => {
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

    // Attach user data to request object
    req.user = {
      ...dbUser,
      tokenId: payload.sub,
      authenticatedVia: payload.aud
    };

    next();

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error while verifying token",
      error: error.message
    });
  }
};

// Optional middleware to require specific user roles
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required"
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: "Insufficient permissions"
      });
      return;
    }

    next();
  };
};