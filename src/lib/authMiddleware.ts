import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { JWT_SECRET } from "../lib/config";

declare module "express-serve-static-core" {
    interface Request {
        userId?: string;
    }
}

export const authenticateUser = (req: Request, res: Response, next: NextFunction): void => {
    // 1. Check Session-Based Authentication
    if (req.session && req.session.userId) {
        console.log("Authenticated using session.");
        req.userId = req.session.userId; // Attach userId from session
        return next(); // Call next middleware
    }
    // 2. Check JWT-Based Authentication
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as { id: string }; // Decode the token
            console.log("Authenticated using JWT.");
            req.userId = decoded.id; // Attach userId from JWT payload
            return next(); // Call next middleware
        } catch (err) {
            console.error("JWT validation failed:", err);
            res.status(401).json({ message: "Invalid token" });
        }
    }

    // 3. If Neither Session Nor JWT Exists
    console.warn("Authentication failed: No session or valid token found.");
    res.status(401).json({ message: "User is not authenticated" });
};
