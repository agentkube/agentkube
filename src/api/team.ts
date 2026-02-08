import { Organization, Invite, JoinResponse } from "@/types/team";
import { getHeaders } from "@/utils/headers";

export const createOrganization = async (name: string, email: string): Promise<Organization> => {
  const response = await fetch('/api/organizations', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name, email })
  });
  
  if (!response.ok) throw new Error('Failed to create organization');
  return response.json();
};

export const getOrganizations = async (): Promise<Organization[]> => {
  const response = await fetch('/api/organizations', {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch organizations');
  return response.json();
};

export const getOrganizationById = async (id: string): Promise<Organization> => {
  const response = await fetch(`/api/organizations/${id}`, {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch organization');
  return response.json();
};

export const getOrganizationsByUserId = async (userId: string): Promise<Organization[]> => {
  const response = await fetch(`/api/organizations/user/${userId}`, {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch user organizations');
  return response.json();
};

export const getOrganizationsByEmail = async (email: string): Promise<Organization[]> => {
  const response = await fetch(`/api/organizations/email/${email}`, {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch organizations for email');
  return response.json();
};

export const deleteOrganization = async (id: string): Promise<void> => {
  const response = await fetch(`/api/organizations/${id}`, { 
    headers: getHeaders(),
    method: 'DELETE' 
  });
  if (!response.ok) throw new Error('Failed to delete organization');
};

export const deleteOrganizationsByEmail = async (email: string): Promise<void> => {
  const response = await fetch(`/api/organizations/email/${email}`, { 
    headers: getHeaders(),
    method: 'DELETE' 
  });
  if (!response.ok) throw new Error('Failed to delete organizations');
};

export const updateOrganization = async (id: string, name: string): Promise<Organization> => {
  const response = await fetch(`/api/organizations/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ name })
  });
  if (!response.ok) throw new Error('Failed to update organization');
  return response.json();
};

export const deleteMember = async (orgId: string, userId: string): Promise<void> => {
  const response = await fetch(`/api/organizations/${orgId}/members/${userId}`, {
    headers: getHeaders(),
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete member');
};

export const addMember = async (
  orgId: string, 
  email: string, 
  role: 'OWNER' | 'ADMIN' | 'MEMBER',
  inviterId: string
): Promise<Invite> => {
  const response = await fetch(`/api/organizations/${orgId}/members`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ email, role, inviterId })
  });
  if (!response.ok) throw new Error('Failed to add member');
  return response.json();
};

export const joinOrganization = async (token: string, email: string): Promise<JoinResponse> => {
  const response = await fetch(`/api/organizations/join/${token}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ email })
  });
  if (!response.ok) throw new Error('Failed to join organization');
  return response.json();
};

export const getInviteToken = async (memberId: string): Promise<{ token: string }> => {
  const response = await fetch(`/api/members/${memberId}/invite-token`, {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch invite token');
  return response.json();
 };