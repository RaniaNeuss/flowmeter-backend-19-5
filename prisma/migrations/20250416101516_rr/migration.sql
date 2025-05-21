/*
  Warnings:

  - You are about to drop the `Compliance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `department` on the `GeneralInfo` table. All the data in the column will be lost.
  - You are about to drop the column `position` on the `GeneralInfo` table. All the data in the column will be lost.
  - You are about to drop the column `responsible` on the `GeneralInfo` table. All the data in the column will be lost.
  - You are about to drop the column `siteScada` on the `GeneralInfo` table. All the data in the column will be lost.
  - You are about to drop the column `swsAssetNo` on the `GeneralInfo` table. All the data in the column will be lost.
  - You are about to drop the column `reference` on the `Rfp` table. All the data in the column will be lost.
  - Added the required column `fmIdScada` to the `GeneralInfo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fmIdSwsAssetNo` to the `GeneralInfo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `responsibleDepartment` to the `GeneralInfo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `responsiblePosition` to the `GeneralInfo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `RfpReference` to the `Rfp` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Compliance_rfpId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Compliance";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "LocationType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfpId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "LocationType_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlowMeterAttachment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfpId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlowMeterAttachment_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GeneralInfo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfpId" INTEGER NOT NULL,
    "licensee" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "reportDate" DATETIME NOT NULL,
    "reportRef" TEXT NOT NULL,
    "responsiblePosition" TEXT NOT NULL,
    "responsibleDepartment" TEXT NOT NULL,
    "fmIdScada" TEXT NOT NULL,
    "fmIdSwsAssetNo" TEXT NOT NULL,
    "siteManagerName" TEXT,
    "faxNumber" TEXT,
    CONSTRAINT "GeneralInfo_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GeneralInfo" ("address", "contactNumber", "faxNumber", "id", "licensee", "reportDate", "reportRef", "rfpId", "siteManagerName") SELECT "address", "contactNumber", "faxNumber", "id", "licensee", "reportDate", "reportRef", "rfpId", "siteManagerName" FROM "GeneralInfo";
DROP TABLE "GeneralInfo";
ALTER TABLE "new_GeneralInfo" RENAME TO "GeneralInfo";
CREATE UNIQUE INDEX "GeneralInfo_rfpId_key" ON "GeneralInfo"("rfpId");
CREATE TABLE "new_Rfp" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "typeOfRfp" TEXT NOT NULL,
    "RfpReference" TEXT NOT NULL,
    "startDate" DATETIME,
    "completionDate" DATETIME,
    "panelMeetingDate" DATETIME,
    "panelDecisionDate" DATETIME
);
INSERT INTO "new_Rfp" ("completionDate", "id", "panelDecisionDate", "panelMeetingDate", "startDate", "typeOfRfp") SELECT "completionDate", "id", "panelDecisionDate", "panelMeetingDate", "startDate", "typeOfRfp" FROM "Rfp";
DROP TABLE "Rfp";
ALTER TABLE "new_Rfp" RENAME TO "Rfp";
CREATE UNIQUE INDEX "Rfp_RfpReference_key" ON "Rfp"("RfpReference");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "LocationType_rfpId_key" ON "LocationType"("rfpId");
