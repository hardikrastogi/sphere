-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showActivityStatus" BOOLEAN NOT NULL DEFAULT true;
