import { RunInvestigationResponse } from "@/types/investigation";
import { CreateResponseProtocolRequest } from "@/types/protocols";
import { PatchProtocolResponse } from "@/types/protocols-patch";
import { GetProtocolsResponse } from "@/types/response-protocol";
import { getAuthToken, getHeaders } from "@/utils/headers";

export const GetOrganizationResponseProtocol = async (
  orgId: string, 
  page: number = 1, 
  limit: number = 10
): Promise<GetProtocolsResponse> => {
  const response = await fetch(`/api/organizations/${orgId}/protocols?page=${page}&limit=${limit}`, {
      headers: getHeaders(),
  });
  
  if (!response.ok) {
    throw new Error("Failed to fetch response protocols");
  }
  
  return response.json();
}


export interface ResponseProtocolCreatedResponse {
  message: string;
}

export const CreateResponseProtocol = async (
  request: CreateResponseProtocolRequest 
): Promise<ResponseProtocolCreatedResponse> => {

  const response = await fetch(`/api/organizations/protocols`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    throw new Error("Failed to fetch investigations");
  }
  
  return response.json();
}




export interface CreateInvestigationRequest {
  protocolId: string;
  clusterId: string;
  userId: string;
}

export const CreateInvestigationByResponseProtocol = async (
  request: CreateInvestigationRequest
): Promise<RunInvestigationResponse> => {
  const response = await fetch(`/api/investigations`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    throw new Error("Failed to fetch investigations");
  }
  
  return response.json();
}

export const DeleteResponseProtocol = async (
  protocolId: string
) => {
  const response = await fetch(`/api/protocols/${protocolId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  
  if (!response.ok) {
    throw new Error("Failed to DELETE Response Protocol");
  }
  
  // return response.json();
}

export const PatchResponseProtocol = async (
  protocolId: string,
  data: PatchProtocolResponse
): Promise<PatchProtocolResponse> => {
  const response = await fetch(`/api/protocols/${protocolId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    throw new Error("Failed to fetch investigations");
  }
  
  return response.json();
}

export interface ImportYamlResponse {
  message: string;
  protocol: any;
}

export interface ImportYamlRequest {
  userId: string;
  orgId: string;
  yamlContent: string;
}

export const ImportResponseProtocol = async (
  request: ImportYamlRequest
): Promise<ImportYamlResponse> => {
  const response = await fetch(`/api/protocols/import-yaml`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error || "Failed to import YAML protocol");
  }
  
  return response.json();
}

export const ExportResponseProtocol = async (
  protocolId: string
): Promise<void> => {
  const token = getAuthToken();
  const response = await fetch(`/api/protocols/${protocolId}/export-yaml`, {
    method: "GET",
    headers: {
      "Accept": "text/yaml",
      "Authorization": token ? `Bearer ${token}` : '',
    },
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error || "Failed to export protocol as YAML");
  }

  // Get the filename from the Content-Disposition header or use a default
  const contentDisposition = response.headers.get('Content-Disposition');
  const filename = contentDisposition
    ? contentDisposition.split('filename=')[1].replace(/"/g, '')
    : `protocol-${protocolId}.yaml`;

  // Create blob and download it
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
