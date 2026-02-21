import { Request, Response, NextFunction } from 'express';
import { userStore, UserRole } from './UserStore';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; username: string; role: UserRole };
    }
  }
}

/** Extract and verify JWT token from request */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: '请先登录' });
  }

  try {
    req.user = userStore.verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

/** Require specific role(s) */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: '请先登录' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}

/** Optional auth - sets req.user if token present, but doesn't require it */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    try {
      req.user = userStore.verifyToken(token);
    } catch {
      // Ignore invalid tokens
    }
  }
  next();
}
