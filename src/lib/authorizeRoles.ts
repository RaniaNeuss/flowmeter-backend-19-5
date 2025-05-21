// file: src/lib/authorizeRoles.ts
import { Request, Response, NextFunction } from "express";
import prisma from "../prismaClient";

/**
 * Higher-order function that takes a list of allowed roles
 * and returns an Express middleware checking if the user
 * has at least one of those roles.
 */
export function authorizeRoles(allowedRoles: string[]) {
  // Return a standard (req, res, next) function
  return function (req: Request, res: Response, next: NextFunction): void {
    // 1) We must have userId from authenticateUser
    const userId = req.userId;
    if (!userId) {
      res
        .status(401)
        .json({ error: "unauthorized", message: "User is not logged in" });
      return;
    }

    // 2) Fetch user from DB
    prisma.user
      .findUnique({
        where: { id: String(userId) },
        include: { groups: true },
      })
      .then((user) => {
        if (!user) {
          res
            .status(404)
            .json({ error: "not_found", message: "User not found" });
          return;
        }

        // 3) Check if user has at least one group that is in allowedRoles
        const userGroupNames = user.groups.map((g) => g.name);
        const hasRole = userGroupNames.some((groupName) =>
          allowedRoles.includes(groupName)
        );
        if (!hasRole) {
          res.status(403).json({
            error: "forbidden",
            message: `only Admins allowed to make changes:}`,
          });
          return;
        }

        // 4) If checks pass, continue
        next();
      })
      .catch((err) => {
        console.error("authorizeRoles error:", err);
        res
          .status(500)
          .json({ error: "unexpected_error", message: "Server error" });
      });
  };
}
