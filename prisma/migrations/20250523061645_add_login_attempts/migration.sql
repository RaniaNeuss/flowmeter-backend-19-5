-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "info" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiry" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "otpCode" TEXT,
    "otpExpiry" DATETIME,
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "password" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "info", "name", "otpCode", "otpExpiry", "password", "resetToken", "resetTokenExpiry", "status", "updatedAt", "username") SELECT "createdAt", "email", "id", "info", "name", "otpCode", "otpExpiry", "password", "resetToken", "resetTokenExpiry", "status", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
