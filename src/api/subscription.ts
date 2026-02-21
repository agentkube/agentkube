
import { ORCHESTRATOR_URL } from '@/config';
import {
  ValidateLicenseResponse,
  ActivateLicenseResponse,
  DeactivateLicenseResponse,
  ListLicenseKeyInstancesResponse
} from '@/types/subscription';
const LEMONSQUEEZY_BASE_URL = 'https://api.lemonsqueezy.com/v1';

/**
 * Validates a LemonSqueezy license key
 * @param params License key validation parameters
 * @returns License validation response
 */
export const validateLicense = async (
  licenseKey: string,
  instanceId?: string
): Promise<ValidateLicenseResponse> => {
  const url = `${LEMONSQUEEZY_BASE_URL}/licenses/validate`;
  const formData = new URLSearchParams();
  formData.append('license_key', licenseKey);
  
  if (instanceId) {
    formData.append('instance_id', instanceId);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to validate license: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Activates a LemonSqueezy license key with a new instance
 * @param licenseKey The license key to activate
 * @param instanceName The name of the instance to create
 * @returns License activation response
 */
export const activateLicense = async (
  licenseKey: string,
  instanceName: string
): Promise<ActivateLicenseResponse> => {
  const url = `${LEMONSQUEEZY_BASE_URL}/licenses/activate`;
  const formData = new URLSearchParams();
  formData.append('license_key', licenseKey);
  formData.append('instance_name', instanceName);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
    },
    body: formData,
  });

  return response.json();
};

/**
 * Deactivates a LemonSqueezy license key instance
 * @param licenseKey The license key to deactivate
 * @param instanceId The ID of the instance to deactivate
 * @returns License deactivation response
 */
export const deactivateLicense = async (
  licenseKey: string,
  instanceId: string
): Promise<DeactivateLicenseResponse> => {
  const url = `${LEMONSQUEEZY_BASE_URL}/licenses/deactivate`;
  const formData = new URLSearchParams();
  formData.append('license_key', licenseKey);
  formData.append('instance_id', instanceId);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to deactivate license: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Lists all instances for a specific license key
 * @param licenseKeyId The ID of the license key
 * @param apiKey The LemonSqueezy API key
 * @returns List of license key instances
 */
export const listLicenseKeyInstances = async (
  licenseKeyId: number,
  apiKey: string
): Promise<ListLicenseKeyInstancesResponse> => {
  if (!apiKey) {
    throw new Error('API key is required for listing license key instances');
  }

  const url = `${LEMONSQUEEZY_BASE_URL}/license-key-instances?filter[license_key_id]=${licenseKeyId}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list license key instances: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Stores a license key in the local system
 * @param licenseKey The license key to store
 * @returns Response indicating success or failure
 */
export const storeLicenseKeyLocal = async (
  licenseKey: string
): Promise<{ success: boolean; message: string }> => {
  const url = `${ORCHESTRATOR_URL}/api/license`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ license_key: licenseKey }),
  });

  if (!response.ok) {
    throw new Error(`Failed to store license key: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Retrieves the locally stored license key
 * @returns The stored license key or null if not found
 */
export const getLicenseKeyLocal = async (): Promise<{ 
  success: boolean; 
  message: string; 
  license_key?: string;
}> => {  
  const response = await fetch(`${ORCHESTRATOR_URL}/api/license`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to retrieve license key: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Updates the locally stored license key
 * @param licenseKey The new license key to store
 * @returns Response indicating success or failure
 */
export const updateLicenseKeyLocal = async (
  licenseKey: string
): Promise<{ success: boolean; message: string }> => {

  const response = await fetch(`${ORCHESTRATOR_URL}/api/license`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ license_key: licenseKey }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update license key: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Removes the locally stored license key
 * @returns Response indicating success or failure
 */
export const removeLicenseKeyLocal = async (): Promise<{ 
  success: boolean; 
  message: string; 
}> => {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/license`, {
    method: 'DELETE',
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to remove license key: ${response.statusText}`);
  }

  return response.json();
};


export const storeInstanceIdLocal = async (instanceId: string): Promise<void> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/instance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ instance_id: instanceId }),
    });

    if (!response.ok) {
      throw new Error('Failed to store instance ID');
    }
  } catch (error) {
    console.error('Error storing instance ID:', error);
    throw error;
  }
};

export const getInstanceIdLocal = async (): Promise<string | null> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/instance`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.instance_id || null;
  } catch (error) {
    console.error('Error retrieving instance ID:', error);
    return null;
  }
};
