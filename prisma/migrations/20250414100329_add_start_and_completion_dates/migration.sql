-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "info" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "password" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Rfp" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "typeOfRfp" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "startDate" DATETIME,
    "completionDate" DATETIME,
    "panelMeetingDate" DATETIME,
    "panelDecisionDate" DATETIME
);

-- CreateTable
CREATE TABLE "Compliance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfpId" INTEGER NOT NULL,
    "inletToTreatment" BOOLEAN NOT NULL,
    "outletFromTreatment" BOOLEAN NOT NULL,
    "terminalPumpDischarge" BOOLEAN NOT NULL,
    "dischargeAtPot" BOOLEAN NOT NULL,
    "tankerDischarge" BOOLEAN NOT NULL,
    "tankerFillPoint" BOOLEAN NOT NULL,
    "incidentReporting" BOOLEAN NOT NULL,
    CONSTRAINT "Compliance_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneralInfo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfpId" INTEGER NOT NULL,
    "licensee" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "reportDate" DATETIME NOT NULL,
    "reportRef" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "siteScada" TEXT NOT NULL,
    "swsAssetNo" TEXT NOT NULL,
    "siteManagerName" TEXT,
    "faxNumber" TEXT,
    CONSTRAINT "GeneralInfo_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Location" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfpId" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    "stpcc" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coordinateN" REAL NOT NULL,
    "coordinateE" REAL NOT NULL,
    "siteDrawingRef" TEXT NOT NULL,
    "flowDiagramRef" TEXT NOT NULL,
    CONSTRAINT "Location_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlowMeasurement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfpId" INTEGER NOT NULL,
    "cumulativeFlow" BOOLEAN NOT NULL,
    "fifteenMinFlow" BOOLEAN NOT NULL,
    "eventRecording" BOOLEAN NOT NULL,
    CONSTRAINT "FlowMeasurement_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlowMonitoringRegister" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfpId" INTEGER NOT NULL,
    "inventoryId" INTEGER NOT NULL,
    "installationId" INTEGER NOT NULL,
    "maintenanceId" INTEGER NOT NULL,
    CONSTRAINT "FlowMonitoringRegister_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FlowMonitoringRegister_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FlowMonitoringRegister_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FlowMonitoringRegister_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "Maintenance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "make" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "fmSize" TEXT NOT NULL,
    "pipelineSize" TEXT NOT NULL,
    "velocityRange" TEXT NOT NULL,
    "accuracyReading" TEXT NOT NULL,
    "accuracyFullScale" TEXT NOT NULL,
    "readingMethod" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Installation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "meterInstallDate" DATETIME NOT NULL,
    "meterRemovalDate" DATETIME NOT NULL,
    "hydraulicUpstream" TEXT,
    "hydraulicDownstream" TEXT,
    "environmental" TEXT,
    "onSiteTesting" TEXT,
    "safetyRisks" TEXT,
    "securityOfLocation" TEXT
);

-- CreateTable
CREATE TABLE "Maintenance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "maintenanceRef" BOOLEAN NOT NULL,
    "preventativeScheduleRef" BOOLEAN NOT NULL
);

-- CreateTable
CREATE TABLE "Data" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfpId" INTEGER NOT NULL,
    "manualMethod" TEXT,
    "dataLogger" TEXT,
    "remoteReading" TEXT,
    "outstationDetails" TEXT,
    "storageDetails" TEXT,
    "ubReport" TEXT,
    "ubValue" TEXT,
    "dataManagementProcedure" TEXT,
    CONSTRAINT "Data_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MAF" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rfpId" INTEGER NOT NULL,
    "detail" TEXT,
    "sopRef" TEXT,
    "selectionSummary" TEXT,
    CONSTRAINT "MAF_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_UserGroups" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_UserGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_UserGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Rfp_reference_key" ON "Rfp"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Compliance_rfpId_key" ON "Compliance"("rfpId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneralInfo_rfpId_key" ON "GeneralInfo"("rfpId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_rfpId_key" ON "Location"("rfpId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowMeasurement_rfpId_key" ON "FlowMeasurement"("rfpId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowMonitoringRegister_rfpId_key" ON "FlowMonitoringRegister"("rfpId");

-- CreateIndex
CREATE UNIQUE INDEX "Data_rfpId_key" ON "Data"("rfpId");

-- CreateIndex
CREATE UNIQUE INDEX "MAF_rfpId_key" ON "MAF"("rfpId");

-- CreateIndex
CREATE UNIQUE INDEX "_UserGroups_AB_unique" ON "_UserGroups"("A", "B");

-- CreateIndex
CREATE INDEX "_UserGroups_B_index" ON "_UserGroups"("B");
