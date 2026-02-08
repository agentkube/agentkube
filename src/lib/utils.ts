import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(input: string | number): string {
  const date = new Date(input)
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export function absoluteUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_APP_URL}${path}`
}

/**
 * Format a timestamp to relative time (e.g., "5m ago", "2h ago", "1d ago")
 * Handles ISO 8601 strings, Unix timestamps (seconds), and millisecond timestamps
 * 
 * @param input - ISO 8601 string, Unix timestamp (seconds), or milliseconds
 * @returns Human-readable relative time string
 */
export function formatTimeAgo(input: string | number | null | undefined): string {
  if (!input) return 'Unknown';
  
  let timestamp: number;
  
  if (typeof input === 'string') {
    // ISO 8601 string (e.g., "2026-01-08T06:30:00Z")
    const date = new Date(input);
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }
    timestamp = date.getTime();
  } else if (typeof input === 'number') {
    // Check if it's Unix seconds or milliseconds
    // Unix timestamps in seconds will be around 1.7 billion (10 digits)
    // Milliseconds will be around 1.7 trillion (13 digits)
    timestamp = input > 9999999999 ? input : input * 1000;
  } else {
    return 'Unknown';
  }
  
  const now = Date.now();
  const diffMs = now - timestamp;
  
  // Handle future dates
  if (diffMs < 0) {
    return 'Just now';
  }
  
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  
  if (diffSeconds < 60) {
    return diffSeconds <= 5 ? 'Just now' : `${diffSeconds}s ago`;
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return diffDays === 1 ? '1d ago' : `${diffDays}d ago`;
  } else if (diffWeeks < 4) {
    return diffWeeks === 1 ? '1w ago' : `${diffWeeks}w ago`;
  } else if (diffMonths < 12) {
    return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
  } else {
    return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
  }
}

/**
 * Format a timestamp to a full readable date with time
 * 
 * @param input - ISO 8601 string, Unix timestamp (seconds), or milliseconds
 * @returns Formatted date string (e.g., "Jan 8, 2026 at 12:30 PM")
 */
export function formatTimestamp(input: string | number | null | undefined): string {
  if (!input) return 'Unknown';
  
  let date: Date;
  
  if (typeof input === 'string') {
    date = new Date(input);
  } else if (typeof input === 'number') {
    // Handle Unix timestamps (seconds vs milliseconds)
    const timestamp = input > 9999999999 ? input : input * 1000;
    date = new Date(timestamp);
  } else {
    return 'Unknown';
  }
  
  if (isNaN(date.getTime())) {
    return 'Invalid date';
  }
  
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
