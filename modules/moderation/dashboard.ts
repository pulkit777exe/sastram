import { prisma } from '@/lib/infrastructure/prisma';

export class ModerationDashboard {
  async getQueue(params?: { status?: string }) {
    const whereClause: Record<string, unknown> = { status: params?.status || 'PENDING' };

    return prisma.report.findMany({
      where: whereClause,
      include: {
        message: {
          include: {
            sender: { select: { id: true, name: true, email: true } },
            thread: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });
  }
}
