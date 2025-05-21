-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GeneralInfo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfpId" INTEGER NOT NULL,
    "licensee" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "reportRef" TEXT NOT NULL,
    "responsiblePosition" TEXT NOT NULL,
    "responsibleDepartment" TEXT NOT NULL,
    "fmIdScada" TEXT NOT NULL,
    "fmIdSwsAssetNo" TEXT NOT NULL,
    "siteManagerName" TEXT,
    "faxNumber" TEXT,
    CONSTRAINT "GeneralInfo_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GeneralInfo" ("address", "contactNumber", "faxNumber", "fmIdScada", "fmIdSwsAssetNo", "id", "licensee", "reportDate", "reportRef", "responsibleDepartment", "responsiblePosition", "rfpId", "siteManagerName") SELECT "address", "contactNumber", "faxNumber", "fmIdScada", "fmIdSwsAssetNo", "id", "licensee", "reportDate", "reportRef", "responsibleDepartment", "responsiblePosition", "rfpId", "siteManagerName" FROM "GeneralInfo";
DROP TABLE "GeneralInfo";
ALTER TABLE "new_GeneralInfo" RENAME TO "GeneralInfo";
CREATE UNIQUE INDEX "GeneralInfo_rfpId_key" ON "GeneralInfo"("rfpId");
CREATE TABLE "new_Installation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "meterInstallDate" TEXT NOT NULL,
    "meterRemovalDate" TEXT NOT NULL,
    "hydraulicUpstream" TEXT,
    "hydraulicDownstream" TEXT,
    "environmental" TEXT,
    "onSiteTesting" TEXT,
    "safetyRisks" TEXT,
    "securityOfLocation" TEXT
);
INSERT INTO "new_Installation" ("environmental", "hydraulicDownstream", "hydraulicUpstream", "id", "meterInstallDate", "meterRemovalDate", "onSiteTesting", "safetyRisks", "securityOfLocation") SELECT "environmental", "hydraulicDownstream", "hydraulicUpstream", "id", "meterInstallDate", "meterRemovalDate", "onSiteTesting", "safetyRisks", "securityOfLocation" FROM "Installation";
DROP TABLE "Installation";
ALTER TABLE "new_Installation" RENAME TO "Installation";
CREATE TABLE "new_Rfp" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "typeOfRfp" TEXT NOT NULL,
    "RfpReference" TEXT NOT NULL,
    "startDate" TEXT,
    "completionDate" TEXT,
    "panelMeetingDate" TEXT,
    "panelDecisionDate" TEXT
);
INSERT INTO "new_Rfp" ("RfpReference", "completionDate", "id", "panelDecisionDate", "panelMeetingDate", "startDate", "typeOfRfp") SELECT "RfpReference", "completionDate", "id", "panelDecisionDate", "panelMeetingDate", "startDate", "typeOfRfp" FROM "Rfp";
DROP TABLE "Rfp";
ALTER TABLE "new_Rfp" RENAME TO "Rfp";
CREATE UNIQUE INDEX "Rfp_RfpReference_key" ON "Rfp"("RfpReference");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
