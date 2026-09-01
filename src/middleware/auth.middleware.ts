import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
        profileId?: string;
      };
    }
  }
}

export const protect = (req: Request, res: Response, next: NextFunction) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Not authorized to access this route" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string; role: string; profileId?: string };
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Not authorized to access this route" });
  }
};

// Middleware to restrict access to specific roles
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: `User role ${req.user?.role} is not authorized to access this route` 
      });
    }
    next();
  };
};

/**
 * Decodes the token when one is supplied but never rejects the request.
 * Use on routes that are readable by anyone but return more detail to the
 * owner or an admin (e.g. a trainer's own verification documents).
 */
export const optionalAuth = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer")) {
    try {
      req.user = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET as string) as {
        userId: string;
        role: string;
        profileId?: string;
      };
    } catch {
      // Invalid or expired token — carry on as an anonymous request.
    }
  }
  next();
};

/** True for admins, and for the user whose own profile this is. */
export const isOwnerOrAdmin = (
  user: Express.Request["user"],
  profileId: unknown
): boolean => {
  if (!user) return false;
  if (user.role === "admin") return true;
  return !!user.profileId && String(user.profileId) === String(profileId);
};
