from pydantic import BaseModel
from typing import Optional

class LicenseKeyRequest(BaseModel):
    license_key: str

class LicenseKeyResponse(BaseModel):
    success: bool
    message: str
    license_key: Optional[str] = None