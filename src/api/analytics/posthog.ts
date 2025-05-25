import { v4 as uuidv4 } from 'uuid';

const POSTHOG_API_URL = 'https://us.i.posthog.com/i/v0/e/';
const POSTHOG_API_KEY = 'phc_FvLYCHSQqEtKmXcwFRO8QwR8HeBhjbh4Qdk8w4Hb6tR'; 

// Get or generate a distinct ID for the user
const getDistinctId = (): string => {
  // Try to get the stored distinct ID
  const storedId = localStorage.getItem('posthog_distinct_id');
  
  if (storedId) {
    return storedId;
  }
  
  // Generate a new UUID if none exists
  const newId = uuidv4();
  localStorage.setItem('posthog_distinct_id', newId);
  return newId;
};

/**
 * Capture an event in PostHog
 * @param event The name of the event to capture
 * @param properties Optional properties to include with the event
 * @param distinctId Optional distinct ID to use instead of the stored/generated one
 * @returns Promise that resolves with the PostHog response
 */
export const posthogCapture = async (
  event: string,
  properties?: Record<string, any>,
  distinctId?: string
): Promise<{ status: string }> => {
  try {
    const payload = {
      api_key: POSTHOG_API_KEY,
      event,
      distinct_id: distinctId || getDistinctId(),
      properties
    };

    const response = await fetch(POSTHOG_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    return response.json();
  } catch (error) {
    console.error('Error capturing PostHog event:', error);
    return { status: 'Error' };
  }
};

/**
 * Capture an anonymous event in PostHog (doesn't affect person profiles)
 * @param event The name of the event to capture
 * @param properties Optional properties to include with the event
 * @param distinctId Optional distinct ID to use instead of the stored/generated one
 * @returns Promise that resolves with the PostHog response
 */
export const posthogCaptureAnonymous = async (
  event: string,
  properties?: Record<string, any>,
  distinctId?: string
): Promise<{ status: string }> => {
  // Ensure properties exists
  const eventProperties = properties || {};
  
  // Add the flag to not process person profiles
  eventProperties.$process_person_profile = false;
  
  return posthogCapture(event, eventProperties, distinctId);
};

/**
 * Capture a page view in PostHog
 * @param url The current URL (defaults to window.location.href)
 * @param properties Additional properties to include
 * @returns Promise that resolves with the PostHog response
 */
export const posthogCapturePageView = async (
  url?: string,
  properties?: Record<string, any>
): Promise<{ status: string }> => {
  const currentUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  
  return posthogCapture('$pageview', {
    $current_url: currentUrl,
    ...properties
  });
};

/**
 * Capture a screen view in PostHog (mostly for mobile)
 * @param screenName The name of the screen
 * @param properties Additional properties to include
 * @returns Promise that resolves with the PostHog response
 */
export const posthogCaptureScreenView = async (
  screenName: string,
  properties?: Record<string, any>
): Promise<{ status: string }> => {
  return posthogCapture('$screen', {
    $screen_name: screenName,
    ...properties
  });
};

/**
 * Capture web vitals metrics in PostHog
 * @param metrics Web vitals metrics to report
 * @returns Promise that resolves with the PostHog response
 */
export const posthogCaptureWebVitals = async (
  metrics?: Record<string, any>
): Promise<{ status: string }> => {
  return posthogCapture('$web_vitals', metrics);
};

/**
 * Capture app started event
 * @param properties Additional properties to include
 * @returns Promise that resolves with the PostHog response
 */
export const posthogCaptureAppStarted = async (
  properties?: Record<string, any>
): Promise<{ status: string }> => {
  return posthogCapture('app_started', properties);
};

/**
 * Capture app closed event
 * @param properties Additional properties to include
 * @returns Promise that resolves with the PostHog response
 */
export const posthogCaptureAppClosed = async (
  properties?: Record<string, any>
): Promise<{ status: string }> => {
  return posthogCapture('app_closed', properties);
};