import { Request, Response, NextFunction } from "express";
import prisma from "../prismaClient";




export const filterFieldsByPermission = async (userId: string, tableName: string, data: any, action: 'canRead' | 'canUpdate') => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      fieldPermissions: true,
      group: {
        include: { fieldPermissions: true }
      }
    },
  });

  const allowedFields = new Set<string>();

  user?.fieldPermissions
    ?.filter(p => p.tableName === tableName && p[action])
    .forEach(p => allowedFields.add(p.fieldName));

  user?.group?.fieldPermissions
    ?.filter(p => p.tableName === tableName && p[action])
    .forEach(p => allowedFields.add(p.fieldName));

  const filtered: any = {};
  for (const key of Object.keys(data)) {
    if (allowedFields.has(key)) filtered[key] = data[key];
  }

  return filtered;
};
