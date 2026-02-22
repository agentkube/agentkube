
from typing import Dict, Any
from agents import function_tool
import requests

AK_OPERATOR_URL = "http://localhost:4688/api/v1"   
  
@function_tool
def scan_image(container_image: str) -> Dict[str, Any]:
    """Scan an image for vulnerabilities."""
    response = requests.post(f"{AK_OPERATOR_URL}/vulnerability/scan", json={"images": [container_image]})
    return response.json()

