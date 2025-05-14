
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
  console.log(licenseKey)
  console.log(instanceName)
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
  const url = 'http://localhost:65001/orchestrator/api/license';
  
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

/*

Validate Lemonsqueezy license key
curl -X POST https://api.lemonsqueezy.com/v1/licenses/validate \
  -H "Accept: application/json" \
  -d "license_key=0F43B4EE-C952-4930-9766-071257A21256" | jq
Response:
{
  "valid": true,
  "error": null,
  "license_key": {
    "id": 826675,
    "status": "active",
    "key": "0F43B4EE-C952-4930-9766-071257A21256",
    "activation_limit": 2,
    "activation_usage": 2,
    "created_at": "2025-04-04T02:48:42.000000Z",
    "expires_at": null,
    "test_mode": true
  },
  "instance": null,
  "meta": {
    "store_id": 127666,
    "order_id": 5210115,
    "order_item_id": 5150363,
    "variant_id": 557705,
    "variant_name": "Default",
    "product_id": 373068,
    "product_name": "Pro Plan",
    "customer_id": 3939245,
    "customer_name": "Siddhant Prateek Mahanayak",
    "customer_email": "siddhantprateek@gmail.com"
  }
}
Validate Lemonsqueezy license key by instance_id
cucurl -X POST https://api.lemonsqueezy.com/v1/licenses/validate \
  -H "Accept: application/json" \
  -d "license_key=0F43B4EE-C952-4930-9766-071257A21256" \
  -d "instance_id=0cd20712-3c0d-44f5-a787-4e78b23d9b95" | jq
Response:
{
  "valid": true,
  "error": null,
  "license_key": {
    "id": 826675,
    "status": "active",
    "key": "0F43B4EE-C952-4930-9766-071257A21256",
    "activation_limit": 2,
    "activation_usage": 2,
    "created_at": "2025-04-04T02:48:42.000000Z",
    "expires_at": null,
    "test_mode": true
  },
  "instance": {
    "id": "0cd20712-3c0d-44f5-a787-4e78b23d9b95",
    "name": "system-378219789312",
    "created_at": "2025-04-04T05:47:52.000000Z"
  },
  "meta": {
    "store_id": 127666,
    "order_id": 5210115,
    "order_item_id": 5150363,
    "variant_id": 557705,
    "variant_name": "Default",
    "product_id": 373068,
    "product_name": "Pro Plan",
    "customer_id": 3939245,
    "customer_name": "Siddhant Prateek Mahanayak",
    "customer_email": "siddhantprateek@gmail.com"
  }
}


Activate Lemonsqueezy license key
curl -X POST https://api.lemonsqueezy.com/v1/licenses/activate \
  -H "Accept: application/json" \
  -d "license_key=0F43B4EE-C952-4930-9766-071257A21256" \
  -d "instance_name=system-hjkdhsakjhd" | jq
Response:
{
  "activated": true,
  "error": null,
  "license_key": {
    "id": 826675,
    "status": "active",
    "key": "0F43B4EE-C952-4930-9766-071257A21256",
    "activation_limit": 2,
    "activation_usage": 2,
    "created_at": "2025-04-04T02:48:42.000000Z",
    "expires_at": null,
    "test_mode": true
  },
  "instance": {
    "id": "6a237589-0db6-418d-a62b-f13e0d78d5ed",
    "name": "system-hjkdhsakjhd",
    "created_at": "2025-04-04T06:13:04.000000Z"
  },
  "meta": {
    "store_id": 127666,
    "order_id": 5210115,
    "order_item_id": 5150363,
    "variant_id": 557705,
    "variant_name": "Default",
    "product_id": 373068,
    "product_name": "Pro Plan",
    "customer_id": 3939245,
    "customer_name": "Siddhant Prateek Mahanayak",
    "customer_email": "siddhantprateek@gmail.com"
  }
}

List all license key instances
curl "https://api.lemonsqueezy.com/v1/license-key-instances?filter\[license_key_id\]=826675" \
  -H 'Accept: application/vnd.api+json' \
  -H 'Content-Type: application/vnd.api+json' \
  -H 'Authorization: Bearer ${LMSQZY_API_KEY}' | jq
Response:
{
  "meta": {
    "page": {
      "currentPage": 1,
      "from": 1,
      "lastPage": 1,
      "perPage": 10,
      "to": 2,
      "total": 2
    }
  },
  "jsonapi": {
    "version": "1.0"
  },
  "links": {
    "first": "https://api.lemonsqueezy.com/v1/license-key-instances?filter%5Blicense_key_id%5D=826675&page%5Bnumber%5D=1&page%5Bsize%5D=10&sort=id",
    "last": "https://api.lemonsqueezy.com/v1/license-key-instances?filter%5Blicense_key_id%5D=826675&page%5Bnumber%5D=1&page%5Bsize%5D=10&sort=id"
  },
  "data": [
    {
      "type": "license-key-instances",
      "id": "2027279",
      "attributes": {
        "license_key_id": 826675,
        "identifier": "0cd20712-3c0d-44f5-a787-4e78b23d9b95",
        "name": "system-378219789312",
        "created_at": "2025-04-04T05:47:52.000000Z",
        "updated_at": "2025-04-04T05:47:52.000000Z"
      },
      "relationships": {
        "license-key": {
          "links": {
            "related": "https://api.lemonsqueezy.com/v1/license-key-instances/2027279/license-key",
            "self": "https://api.lemonsqueezy.com/v1/license-key-instances/2027279/relationships/license-key"
          }
        }
      },
      "links": {
        "self": "https://api.lemonsqueezy.com/v1/license-key-instances/2027279"
      }
    },
    {
      "type": "license-key-instances",
      "id": "2027289",
      "attributes": {
        "license_key_id": 826675,
        "identifier": "6a237589-0db6-418d-a62b-f13e0d78d5ed",
        "name": "system-hjkdhsakjhd",
        "created_at": "2025-04-04T06:13:04.000000Z",
        "updated_at": "2025-04-04T06:13:04.000000Z"
      },
      "relationships": {
        "license-key": {
          "links": {
            "related": "https://api.lemonsqueezy.com/v1/license-key-instances/2027289/license-key",
            "self": "https://api.lemonsqueezy.com/v1/license-key-instances/2027289/relationships/license-key"
          }
        }
      },
      "links": {
        "self": "https://api.lemonsqueezy.com/v1/license-key-instances/2027289"
      }
    }
  ]
}

Deactivate Lemonsqueezy license key
curl -X POST https://api.lemonsqueezy.com/v1/licenses/deactivate \
  -H "Accept: application/json" \
  -d "license_key=0F43B4EE-C952-4930-9766-071257A21256" \
  -d "instance_id=4d31792a-68d1-4ca1-9410-182fe916e040"
Response:
{
  "deactivated": true,
  "error": null,
  "license_key": {
    "id": 826675,
    "status": "active",
    "key": "0F43B4EE-C952-4930-9766-071257A21256",
    "activation_limit": 2,
    "activation_usage": 1,
    "created_at": "2025-04-04T02:48:42.000000Z",
    "expires_at": null,
    "test_mode": true
  },
  "meta": {
    "store_id": 127666,
    "order_id": 5210115,
    "order_item_id": 5150363,
    "variant_id": 557705,
    "variant_name": "Default",
    "product_id": 373068,
    "product_name": "Pro Plan",
    "customer_id": 3939245,
    "customer_name": "Siddhant Prateek Mahanayak",
    "customer_email": "siddhantprateek@gmail.com"
  }
}
*/