/*
  Warnings:

  - You are about to drop the `Project` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Tag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_ProjectToUser` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `projectId` on the `Device` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `Settings` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Project_name_userId_key";

-- DropIndex
DROP INDEX "Tag_deviceId_address_key";

-- DropIndex
DROP INDEX "_ProjectToUser_B_index";

-- DropIndex
DROP INDEX "_ProjectToUser_AB_unique";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Project";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Tag";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_ProjectToUser";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT,
    "property" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "polling" INTEGER,
    "lastConnected" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Device" ("createdAt", "description", "enabled", "id", "lastConnected", "name", "polling", "property", "type", "updatedAt") SELECT "createdAt", "description", "enabled", "id", "lastConnected", "name", "polling", "property", "type", "updatedAt" FROM "Device";
DROP TABLE "Device";
ALTER TABLE "new_Device" RENAME TO "Device";
CREATE UNIQUE INDEX "Device_name_key" ON "Device"("name");
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "system" TEXT,
    "form" TEXT,
    "smtp" TEXT,
    "daqstore" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("createdAt", "daqstore", "form", "id", "smtp", "system", "updatedAt") SELECT "createdAt", "daqstore", "form", "id", "smtp", "system", "updatedAt" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
