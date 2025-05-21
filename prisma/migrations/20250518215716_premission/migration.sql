-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_GroupPermissions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_GroupPermissions_A_fkey" FOREIGN KEY ("A") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_GroupPermissions_B_fkey" FOREIGN KEY ("B") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Permission_action_key" ON "Permission"("action");

-- CreateIndex
CREATE UNIQUE INDEX "_GroupPermissions_AB_unique" ON "_GroupPermissions"("A", "B");

-- CreateIndex
CREATE INDEX "_GroupPermissions_B_index" ON "_GroupPermissions"("B");
