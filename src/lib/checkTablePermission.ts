import { Request, Response, NextFunction } from "express";
import prisma from "../prismaClient";


export const checkTablePermission = (table: string, action: 'canRead' | 'canCreate' | 'canUpdate' | 'canDelete') => {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    const userId = req.userId;

    if (!userId)  res.status(401).json({ error: 'Unauthorized' });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        tablePermissions: true,
        group: {
          include: {
            tablePermissions: true,
          }
        }
      },
    });

    const userPerm = user?.tablePermissions?.find(p => p.tableName === table);
    const groupPerm = user?.group?.tablePermissions?.find(p => p.tableName === table);

    const allowed = userPerm?.[action] || groupPerm?.[action];

    if (!allowed) {
       res.status(403).json({ error: 'Forbidden', message: `You lack ${action} permission for ${table}` });
       return;
    }

    next();
  };
};
