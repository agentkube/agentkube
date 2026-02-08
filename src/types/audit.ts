// types/audit.ts

export interface User {
  name: string;
  // Add other user fields as needed
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: User;
  action: string;
  target: string;
  ipAddress: string;
}

export interface AuditLogEntry {
  name: string;
  userId: string;
  email: string;
  orgId: string;
  action: string;
  target: string;
}

export interface AuditLogQueryParams {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  targetType?: string;
  action?: string;
}

export interface AuditLogsResponse {
  data: AuditLog[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
}