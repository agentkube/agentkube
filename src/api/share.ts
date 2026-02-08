// api/share.ts
import { SharedInvestigation } from '@/types/investigation';
import { SharedInvestigationApiResponse } from '@/types/share';
import { getHeaders } from '@/utils/headers';

interface CreateShareLinkResponse {
  message: string;
  shareUrl: string;
  sharedInvestigation: SharedInvestigation;
  isExisting: boolean;
}

interface ShareLinkRequest {
  investigationId: string;
  userId: string;
  expiresIn?: number | undefined; 
}

export const createShareableLink = async (
  data: ShareLinkRequest
): Promise<CreateShareLinkResponse> => {


  const response = await fetch('/api/investigation/create-link', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to create shareable link');
  }

  return response.json();
};

export const getSharedInvestigation = async (
  shareToken: string
): Promise<SharedInvestigationApiResponse> => {
  const response = await fetch(`/api/investigation/share/${shareToken}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to get shared investigation');
  }

  return response.json();
};

export const revokeShareableLink = async (
  shareToken: string,
  userId: string
): Promise<{ message: string }> => {
  const response = await fetch(`/api/investigation/share/${shareToken}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    throw new Error('Failed to revoke share link');
  }

  return response.json();
};