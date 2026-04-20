export type ContactPriority = "high" | "medium" | "low";

export interface JobSignals {
  contactPriority: ContactPriority;
  reason: string;
  linkedinQuery: string | null;
  hiringQuery: string | null;
}

export interface Collaborator {
  id: string;
  name: string | null;
  email: string | null;
  profilePhoto: string | null;
  role: string;
  company: string | null;
  companyDomain: string | null;
  isWorkEmail: boolean;
  jobSignals: JobSignals;
}

export interface LookupResponse {
  pageId: string;
  collaborators: Collaborator[];
  cached: boolean;
  timestamp: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
  pageId?: string;
}

export interface UserReferences {
  userIds: Set<string>;
  rolesByUserId: Map<string, string>;
}
