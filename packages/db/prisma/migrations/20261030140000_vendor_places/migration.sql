-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "address" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "placeId" TEXT,
ADD COLUMN     "placePhotos" JSONB,
ADD COLUMN     "priceEstimated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "ratingCount" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_placeId_key" ON "Vendor"("placeId");

