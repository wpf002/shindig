-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "shareToken" TEXT;

-- AlterTable
ALTER TABLE "VendorImage" ADD COLUMN     "credit" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Plan_shareToken_key" ON "Plan"("shareToken");

