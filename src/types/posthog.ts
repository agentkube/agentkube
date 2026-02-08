/**
 * Basic response from PostHog capture API
 */
export interface PostHogCaptureResponse {
  status: string; // 'Ok' if successful
}

/**
 * Properties that can be sent with PostHog events
 */
export interface PostHogEventProperties {
  [key: string]: any;
  
  // Optional default properties that PostHog captures
  $timestamp?: string;
  $os?: string;
  $os_version?: string;
  $browser?: string;
  $browser_version?: string;
  $device_type?: string;
  $current_url?: string;
  $host?: string;
  $pathname?: string;
  $screen_height?: number;
  $screen_width?: number;
  $viewport_height?: number;
  $viewport_width?: number;
  $lib?: string;
  $lib_version?: string;
  $search_engine?: string;
  $referrer?: string;
  $referring_domain?: string;
  $active_feature_flags?: string[];
  $event_type?: string;
  $utm_source?: string;
  $utm_medium?: string;
  $utm_campaign?: string;
  $utm_term?: string;
  $utm_content?: string;
  $gclid?: string;
  $gad_source?: string;
  $gclsrc?: string;
  $dclid?: string;
  $wbraid?: string;
  $gbraid?: string;
  $fbclid?: string;
  $msclkid?: string;
  $twclid?: string;
  $la_fat_id?: string;
  $mc_cid?: string;
  $igshid?: string;
  $ttclid?: string;
  $plugins_succeeded?: string[];
  $plugins_failed?: string[];
  $plugins_deferred?: string[];
  $ip?: string;
  
  // Special property for anonymous events
  $process_person_profile?: boolean;
}

/**
 * Web vitals metrics that can be sent with $web_vitals events
 */
export interface WebVitalsMetrics {
  CLS?: number; // Cumulative Layout Shift
  FID?: number; // First Input Delay
  LCP?: number; // Largest Contentful Paint
  FCP?: number; // First Contentful Paint
  TTFB?: number; // Time to First Byte
  INP?: number; // Interaction to Next Paint
  [key: string]: any; // Allow for other metrics
}