import { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Response {
      sendEvent(type: string, content: any): void;
      endSSE(): void;
    }
  }
}

export const sseMiddleware = (_: Request, res: Response, next: NextFunction) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  res.sendEvent = (type: string, content: any) => {
    res.write(`data: ${JSON.stringify({ type, content })}\n\n`);
  };

  res.endSSE = () => {
    res.end();
  };

  res.sendEvent('start', null);
  next();
};

export default sseMiddleware;