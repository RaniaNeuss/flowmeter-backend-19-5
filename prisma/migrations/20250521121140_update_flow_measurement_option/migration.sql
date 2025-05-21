/*
  Warnings:

  - You are about to drop the column `cumulativeFlow` on the `FlowMeasurement` table. All the data in the column will be lost.
  - You are about to drop the column `eventRecording` on the `FlowMeasurement` table. All the data in the column will be lost.
  - You are about to drop the column `fifteenMinFlow` on the `FlowMeasurement` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FlowMeasurement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfpId" INTEGER NOT NULL,
    "selectedOption" TEXT,
    CONSTRAINT "FlowMeasurement_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_FlowMeasurement" ("id", "rfpId") SELECT "id", "rfpId" FROM "FlowMeasurement";
DROP TABLE "FlowMeasurement";
ALTER TABLE "new_FlowMeasurement" RENAME TO "FlowMeasurement";
CREATE UNIQUE INDEX "FlowMeasurement_rfpId_key" ON "FlowMeasurement"("rfpId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
