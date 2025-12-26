/**
 * Activity feed domain types
 */

export interface UserActivity {
  id: string;
  userId: string;
  type: string;
  entityType: string;
  entityId: string;
  metadata: any;
  createdAt: Date;
}

