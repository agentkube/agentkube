import { ORCHESTRATOR_URL } from "@/config";
import { fetch } from '@tauri-apps/plugin-http';

/**
 * Send an analytics event to the AgentKube orchestrator
 * @param event The name of the event to capture
 * @param properties Optional properties to include with the event
 * @returns Promise that resolves with the response
 */
export const sendEvent = async (
  event: string,
  properties?: Record<string, any>
): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/analytics/send-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event,
        properties: properties || {}
      })
    });

    if (!response.ok) {
      throw new Error(`Analytics request failed with status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error sending analytics event:', error);
    return { 
      success: false, 
      message: `Error: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
};