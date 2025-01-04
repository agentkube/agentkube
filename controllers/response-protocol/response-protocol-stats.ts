import prisma from '../../connectors/prisma';

export const updateProtocolStats = async (protocolId: string) => {
  try {
    // Get all investigations for this protocol
    const investigations = await prisma.investigation.findMany({
      where: {
        protocolId,
      },
      select: {
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Calculate statistics
    const totalExecutions = investigations.length;
    const successfulExecutions = investigations.filter(
      inv => inv.status === 'COMPLETED'
    ).length;
    const failedExecutions = investigations.filter(
      inv => inv.status === 'FAILED'
    ).length;
    const pendingExecutions = investigations.filter(
      inv => inv.status === 'PENDING' || inv.status === 'IN_PROGRESS'
    ).length;

    // Calculate average execution time for completed investigations
    const completedInvestigations = investigations.filter(
      inv => inv.status === 'COMPLETED'
    );
    let averageExecutionTime: number = 0;
    if (completedInvestigations.length > 0) {
      const totalTime = completedInvestigations.reduce((acc, inv) => {
        return acc + (inv.updatedAt.getTime() - inv.createdAt.getTime());
      }, 0);
      averageExecutionTime = totalTime / (completedInvestigations.length * 1000); // Convert to seconds
    }

    // Get the last execution
    const lastExecution = investigations[0];
    const lastExecutionStatus = lastExecution?.status;
    const lastExecutionTime = lastExecution?.updatedAt;

    // Update or create stats
    await prisma.responseProtocolStats.upsert({
      where: {
        protocolId,
      },
      update: {
        totalExecutions,
        lastExecutionStatus,
        lastExecutionTime,
        successfulExecutions,
        failedExecutions,
        pendingExecutions,
        averageExecutionTime,
        updatedAt: new Date(),
      },
      create: {
        protocolId,
        totalExecutions,
        lastExecutionStatus,
        lastExecutionTime,
        successfulExecutions,
        failedExecutions,
        pendingExecutions,
        averageExecutionTime,
      },
    });

    return true;
  } catch (error) {
    console.error('Error updating protocol stats:', error);
    return false;
  }
};