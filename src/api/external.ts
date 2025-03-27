/**
 * Opens a URL in the system's default browser
 * @param url The URL to open in the browser
 * @returns A promise that resolves when the request is complete
 */
export const openExternalUrl = async (url: string): Promise<{ message: string }> => {
  // Encode the URL to ensure special characters are handled properly
  const encodedUrl = encodeURIComponent(url);
  
  const response = await fetch(`http://localhost:4688/api/v1/externalUrl?url=${encodedUrl}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to open external URL (${response.status})`);
  }

  return response.json();
};

/**
 * Interface for external shell command response
 */
interface ExternalShellResponse {
  message: string;
  cluster: string;
  command: string;
}

/**
 * Runs a command in an external terminal with the specified cluster context
 * @param clusterName The name of the Kubernetes cluster context
 * @param command The command to execute in the terminal
 * @returns A promise that resolves with information about the executed command
 */
export const runExternalShell = async (
  clusterName: string, 
  command: string
): Promise<ExternalShellResponse> => {
  const response = await fetch(`http://localhost:4688/api/v1/cluster/${clusterName}/externalShell`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ command }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to run external shell command (${response.status})`);
  }

  return response.json();
};