// file: src/lib/authorizePermissions.ts
import { Request, Response, NextFunction } from "express";
import prisma from "../prismaClient";

/**
 * Middleware to check if the user has one of the required permissions.
 * Usage: authorizePermissions(['users:canCreate'])
 */
export function authorizePermissions(requiredPermissions: string[]) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({ error: "unauthorized", message: "User is not logged in" });
      return;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          groups: {
            include: {
              permissions: true,
            },
          },
        },
      });

      if (!user) {
        res.status(404).json({ error: "not_found", message: "User not found" });
        return;
      }

      const userPermissions = user.groups.flatMap(group =>
        group.permissions.map(p => p.action)
      );

      const hasPermission = requiredPermissions.some(perm =>
        userPermissions.includes(perm)
      );

      if (!hasPermission) {
        res.status(403).json({
          error: "forbidden",
          message: "You do not have permission to perform this action",
        });
        return;
      }

      next();
    } catch (err) {
      console.error("authorizePermissions error:", err);
      res.status(500).json({ error: "unexpected_error", message: "Server error" });
    }
  };
}
