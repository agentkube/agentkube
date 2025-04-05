
export interface LicenseKeyInfo {
  id: number;
  status: string;
  key: string;
  activation_limit: number;
  activation_usage: number;
  created_at: string;
  expires_at: string | null;
  test_mode: boolean;
}

export interface InstanceInfo {
  id: string;
  name: string;
  created_at: string;
}

export interface LicenseMeta {
  store_id: number;
  order_id: number;
  order_item_id: number;
  variant_id: number;
  variant_name: string;
  product_id: number;
  product_name: string;
  customer_id: number;
  customer_name: string;
  customer_email: string;
}

export interface ValidateLicenseResponse {
  valid: boolean;
  error: string | null;
  license_key: LicenseKeyInfo;
  instance: InstanceInfo | null;
  meta: LicenseMeta;
}

export interface ActivateLicenseResponse {
  activated: boolean;
  error: string | null;
  license_key: LicenseKeyInfo;
  instance: InstanceInfo;
  meta: LicenseMeta;
}

export interface DeactivateLicenseResponse {
  deactivated: boolean;
  error: string | null;
  license_key: LicenseKeyInfo;
  meta: LicenseMeta;
}

export interface LicenseKeyInstanceAttributes {
  license_key_id: number;
  identifier: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface LicenseKeyInstanceRelationships {
  "license-key": {
    links: {
      related: string;
      self: string;
    };
  };
}

export interface LicenseKeyInstance {
  type: string;
  id: string;
  attributes: LicenseKeyInstanceAttributes;
  relationships: LicenseKeyInstanceRelationships;
  links: {
    self: string;
  };
}

export interface ListLicenseKeyInstancesResponse {
  meta: {
    page: {
      currentPage: number;
      from: number;
      lastPage: number;
      perPage: number;
      to: number;
      total: number;
    };
  };
  jsonapi: {
    version: string;
  };
  links: {
    first: string;
    last: string;
  };
  data: LicenseKeyInstance[];
}

export interface ValidateLicenseParams {
  license_key: string;
  instance_id?: string;
}

export interface ActivateLicenseParams {
  license_key: string;
  instance_name: string;
}

export interface DeactivateLicenseParams {
  license_key: string;
  instance_id: string;
}