/**
 * Report domain types
 */

export interface Report {
  id: string;
  messageId: string;
  reporterId: string;
  reason: string;
  details: string | null;
  status: string;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
  message: {
    id: string;
    content: string;
    createdAt: Date;
    sender: {
      id: string;
      name: string | null;
      email: string;
      image: string | null;
    };
    section: {
      id: string;
      name: string;
      slug: string;
    };
  };
  reporter: {
    id: string;
    name: string | null;
    email: string;
  };
  resolver: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}

