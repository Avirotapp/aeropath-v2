export type UserRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN' | 'SAFETY_MANAGER';
export type BookingStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
export type SessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TrainingResourceType = 'SIMULATOR' | 'AIRCRAFT';
export type TrainingMode = 'SIMULATOR' | 'FLIGHT';

export interface BookingCreateRequest {
  resourceId: string;
  instructorId?: string | null;
  startAt: string;
  endAt: string;
  purpose?: string | null;
}

export interface TrainingResource {
  resourceId: string;
  resourceType: TrainingResourceType;
  name: string;
  model: string;
  identifier: string;
  callsign?: string | null;
  description?: string | null;
  active: boolean;
}
