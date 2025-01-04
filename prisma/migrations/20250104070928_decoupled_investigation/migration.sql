-- DropForeignKey
ALTER TABLE "investigations" DROP CONSTRAINT "investigations_protocolId_fkey";

-- AlterTable
ALTER TABLE "investigations" ALTER COLUMN "protocolId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "response_protocols"("id") ON DELETE SET NULL ON UPDATE CASCADE;
