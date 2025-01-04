-- CreateTable
CREATE TABLE "response_protocol_stats" (
    "id" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "totalExecutions" INTEGER NOT NULL DEFAULT 0,
    "lastExecutionStatus" TEXT,
    "lastExecutionTime" TIMESTAMP(3),
    "successfulExecutions" INTEGER NOT NULL DEFAULT 0,
    "failedExecutions" INTEGER NOT NULL DEFAULT 0,
    "pendingExecutions" INTEGER NOT NULL DEFAULT 0,
    "averageExecutionTime" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "response_protocol_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "response_protocol_stats_protocolId_key" ON "response_protocol_stats"("protocolId");

-- AddForeignKey
ALTER TABLE "response_protocol_stats" ADD CONSTRAINT "response_protocol_stats_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "response_protocols"("id") ON DELETE CASCADE ON UPDATE CASCADE;
