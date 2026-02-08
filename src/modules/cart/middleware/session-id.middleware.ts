import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

const COOKIE_NAME = 'cart_session_id';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 дней

@Injectable()
export class SessionIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    let sessionId = req.cookies?.[COOKIE_NAME];

    if (!sessionId) {
      sessionId = uuidv4();
      res.cookie(COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
      });
    }

    (req as Request & { cartSessionId: string }).cartSessionId = sessionId;
    next();
  }
}
