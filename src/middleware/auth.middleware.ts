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
