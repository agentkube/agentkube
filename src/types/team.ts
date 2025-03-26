
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  role: 'USER' | 'ADMIN';
  members: {
    organization: Organization;
    role: 'OWNER' | 'ADMIN' | 'MEMBER';
  }[];
  apiKeys: ApiKey[];
  subscription: any | null;
}


export interface Connection {
  id: number;
  name: string;
  role: string;
  level: "Senior" | "Middle";
  avatar: string;
}


export interface ApiKey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  cluster: {
    id: string;
    clusterName: string;
    accessType: "READ_ONLY" | "READ_WRITE";
    externalEndpoint: string;
    status: "PENDING" | "ACTIVE" | "INACTIVE" | "ERROR";
    lastHeartbeat: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
}

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  members: Member[];
  invites?: Invite[];
}

export interface Member {
  id: string;
  userId: string;              
  orgId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  status: 'PENDING' | 'ACTIVE';
  joinedAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

export interface JoinResponse {
  id: string;
  userId: string;
  orgId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
  updatedAt: string;
}


export interface Invite {
  id: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  token: string;
  expiresAt: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELED';
  organization: Organization;
  inviter: {
    id: string;
    email: string;
    name: string | null;
  };
}
