-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShopSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "woosmapKeyEnc" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "countries" TEXT,
    "language" TEXT
);
INSERT INTO "new_ShopSettings" ("shop", "woosmapKeyEnc") SELECT "shop", "woosmapKeyEnc" FROM "ShopSettings";
DROP TABLE "ShopSettings";
ALTER TABLE "new_ShopSettings" RENAME TO "ShopSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
