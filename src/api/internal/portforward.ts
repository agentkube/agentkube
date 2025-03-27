/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Interface for port forward request payload
 */
export interface PortForwardRequest {
  id?: string;             // Optional ID (generated on server if not provided)
  namespace: string;       // Pod namespace
  pod: string;             // Pod name
  service?: string;        // Optional service name
  serviceNamespace?: string; // Optional service namespace
  targetPort: string;      // Container port to forward
  cluster: string;         // Cluster context name
  port?: string;           // Local port (if not specified, a random port will be chosen)
}

/**
 * Interface for port forward response
 */
export interface PortForwardResponse extends PortForwardRequest {
  id: string;             // Generated ID
}

/**
 * Interface for port forward info object
 */
export interface PortForward {
  id: string;              // Port forward ID
  pod: string;             // Pod name
  service?: string;        // Optional service name
  serviceNamespace?: string; // Optional service namespace
  namespace: string;       // Pod namespace
  cluster: string;         // Cluster name
  port: string;            // Local port
  targetPort: string;      // Container port
  status: 'Running' | 'Stopped' | 'Error'; // Current status
  error?: string;          // Error message (if status is 'Error')
}

/**
 * Interface for stop/delete port forward request
 */
export interface StopPortForwardRequest {
  id: string;              // Port forward ID
  cluster: string;         // Cluster name
  stopOrDelete: boolean;   // true to delete, false to stop
}

/**
 * Starts a port forward to a pod
 * 
 * @param request Port forward configuration
 * @returns Promise with the created port forward
 */
export async function startPortForward(request: PortForwardRequest): Promise<PortForwardResponse> {
  try {
    const response = await fetch('http://localhost:4688/api/v1/api/v1/portforward/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      credentials: 'include', // Include cookies for auth
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to start port forward: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error starting port forward:', error);
    throw error;
  }
}

/**
 * Stops or deletes a port forward
 * 
 * @param request Port forward stop/delete request
 * @returns Promise that resolves when successfully stopped/deleted
 */
export async function stopPortForward(request: StopPortForwardRequest): Promise<void> {
  try {
    const response = await fetch('http://localhost:4688/api/v1/api/v1/portforward/stop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      credentials: 'include', // Include cookies for auth
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to stop port forward: ${errorText}`);
    }
  } catch (error) {
    console.error('Error stopping port forward:', error);
    throw error;
  }
}

/**
 * Gets all port forwards for a cluster
 * 
 * @param clusterName Name of the cluster
 * @returns Promise with list of active port forwards
 */
export async function getPortForwards(clusterName: string): Promise<PortForward[]> {
  try {
    const response = await fetch(`http://localhost:4688/api/v1/api/v1/portforward?cluster=${encodeURIComponent(clusterName)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies for auth
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get port forwards: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting port forwards:', error);
    throw error;
  }
}

/**
 * Gets a specific port forward by ID
 * 
 * @param clusterName Name of the cluster
 * @param id Port forward ID
 * @returns Promise with the port forward details
 */
export async function getPortForwardById(clusterName: string, id: string): Promise<PortForward> {
  try {
    const response = await fetch(`http://localhost:4688/api/v1/api/v1/portforward/${id}?cluster=${encodeURIComponent(clusterName)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies for auth
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Port forward not found: ${id}`);
      }
      const errorText = await response.text();
      throw new Error(`Failed to get port forward: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting port forward:', error);
    throw error;
  }
}

/**
 * Creates a URL for accessing a port forwarded service
 * 
 * @param port Local port number
 * @param path Optional path to append to the URL
 * @returns URL string for accessing the service
 */
export function getPortForwardUrl(port: string, path: string = ''): string {
  // Normalize path to ensure it starts with a slash if non-empty
  const normalizedPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  
  // Determine protocol (http for most ports, https for 443)
  const protocol = port === '443' ? 'https' : 'http';
  
  return `${protocol}://localhost:${port}${normalizedPath}`;
}

/**
 * Port forwards to a pod in a Kubernetes cluster with one API call
 * 
 * @param clusterName Name of the cluster
 * @param namespace Pod namespace
 * @param podName Pod name
 * @param containerPort Port to forward in the container
 * @param localPort Optional local port (random port chosen if not specified)
 * @returns Promise with the created port forward details
 */
export async function quickPortForward(
  clusterName: string,
  namespace: string,
  podName: string,
  containerPort: number | string,
  localPort?: number | string
): Promise<PortForwardResponse> {
  const request: PortForwardRequest = {
    namespace,
    pod: podName,
    targetPort: containerPort.toString(),
    cluster: clusterName,
  };

  if (localPort) {
    request.port = localPort.toString();
  }

  return startPortForward(request);
}

/**
 * Port forwards to a service in a Kubernetes cluster
 * This is a convenience function that forwards to the first pod selected by the service
 * 
 * @param clusterName Name of the cluster
 * @param namespace Service namespace
 * @param serviceName Service name
 * @param servicePort Service port (name or number)
 * @param localPort Optional local port (random port chosen if not specified)
 * @returns Promise with the created port forward details
 * @throws Error if port forwarding fails
 */
export async function portForwardService(
  clusterName: string,
  namespace: string,
  serviceName: string,
  servicePort: number | string,
  localPort?: number | string
): Promise<PortForwardResponse> {
  try {
    // This endpoint would handle finding a pod that matches the service selector
    const response = await fetch(`http://localhost:4688/api/v1/api/v1/services/${namespace}/${serviceName}/portforward`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        servicePort: servicePort.toString(),
        localPort: localPort?.toString(),
        cluster: clusterName
      }),
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to port forward to service: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error setting up service port forward:', error);
    throw error;
  }
}
/**
 * Opens a port forwarded service in a new browser tab
 * 
 * @param port Local port number
 * @param path Optional path to append to the URL
 */
export function openPortForwardInBrowser(port: string, path: string = ''): void {
  const url = getPortForwardUrl(port, path);
  window.open(url, '_blank');
}