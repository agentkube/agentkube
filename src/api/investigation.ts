import {
  CancelInvestigationResponse,
  InvestigateFurtherResponse,
  Investigation,
  RunInvestigationResponse,
} from "@/types/investigation";
import { getHeaders } from "@/utils/headers";

export const GetOrganizationInvestigations = async (
  orgId: string
): Promise<Investigation[]> => {
  const response = await fetch(`/api/organizations/${orgId}/investigations`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch investigations");
  }

  return response.json();
};

export const GetInvestigationById = async (
  investigationId: string,
  userId: string
): Promise<Investigation> => {
  const payload = {
    userId: userId,
  };
  const response = await fetch(`/api/investigations/${investigationId}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch investigations");
  }

  return response.json();
};
/**
 * TODO 3. Generate Investigation Troubleshooter
 * TODO 4. Cancel Investigation (Need fixes in backend)
 */

export interface CreateInvestigationRequest {
  protocolId: string;
  clusterId: string;
  userId: string;
}

export const CreateNewInvestigation = async (
  request: CreateInvestigationRequest
): Promise<RunInvestigationResponse> => {
  const response = await fetch(`/api/investigations`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch investigations");
  }

  return response.json();
};

export interface FurtherInvestigateProps {
  clusterId: string;
  message: string;
}

export const FurtherInvestigate = async (
  investigationId: string,
  request: FurtherInvestigateProps
): Promise<InvestigateFurtherResponse> => {
  const response = await fetch(
    `/api/investigations/${investigationId}/further-investigate`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to investigate further");
  }

  return response.json();
};

export const InvestigationTroubleshooter = async (
  request: CreateInvestigationRequest
) => {
  const response = await fetch(`/api/investigations/troubleshoot`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch investigations");
  }
};

export const CancelInvestigation = async (
  investigationId: string,
  userId: string
): Promise<CancelInvestigationResponse> => {
  const response = await fetch(
    `/api/investigations/${investigationId}/cancel`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        userId,
      }),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch investigations");
  }

  return response.json();
};

export const FutherInvestigate = async (
  investigationId: string,
  userId: string
): Promise<CancelInvestigationResponse> => {
  const response = await fetch(
    `/api/investigations/${investigationId}/cancel`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        userId,
      }),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch investigations");
  }

  return response.json();
};
