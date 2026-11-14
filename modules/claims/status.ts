import type { ClaimStatus } from '@prisma/client';

export function computeClaimStatus(confirmCount: number, disputeCount: number): ClaimStatus {
  const net = confirmCount - disputeCount;
  const total = confirmCount + disputeCount;
  if (total < 2) return 'OPEN';
  if (net >= 2) return 'CONFIRMED';
  if (net <= -2) return 'DISPUTED';
  return 'CONTESTED';
}
