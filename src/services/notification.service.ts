/**
 * Notification Service
 * 
 * A reusable notification system with localStorage persistence.
 * Implements FIFO queue with max 10 notifications.
 */

export type NotificationType = 'investigation' | 'update' | 'warning' | 'success' | 'info' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  taskId?: string; // Optional task ID for investigation notifications
}

const STORAGE_KEY = 'agentkube_notifications';
const MAX_NOTIFICATIONS = 10;

/**
 * Get notifications from localStorage
 */
export function getNotifications(): Notification[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to parse notifications from localStorage:', e);
  }
  return [];
}

/**
 * Save notifications to localStorage
 */
function saveNotifications(notifications: Notification[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch (e) {
    console.error('Failed to save notifications to localStorage:', e);
  }
}

/**
 * Add a notification (FIFO queue with max 10)
 */
export function notify(
  type: NotificationType,
  title: string,
  message: string,
  taskId?: string
): Notification {
  const notifications = getNotifications();
  
  const newNotification: Notification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    title,
    message,
    timestamp: new Date().toISOString(),
    read: false,
    taskId,
  };
  
  // Add to beginning (newest first)
  notifications.unshift(newNotification);
  
  // Keep only MAX_NOTIFICATIONS (FIFO - remove oldest if over limit)
  const trimmed = notifications.slice(0, MAX_NOTIFICATIONS);
  
  saveNotifications(trimmed);
  
  // Dispatch custom event for components to react
  window.dispatchEvent(new CustomEvent('notification-added', { 
    detail: newNotification 
  }));
  
  return newNotification;
}

/**
 * Mark a notification as read
 */
export function markAsRead(id: string): void {
  const notifications = getNotifications();
  const updated = notifications.map(n => 
    n.id === id ? { ...n, read: true } : n
  );
  saveNotifications(updated);
  window.dispatchEvent(new CustomEvent('notifications-updated'));
}

/**
 * Mark all notifications as read
 */
export function markAllAsRead(): void {
  const notifications = getNotifications();
  const updated = notifications.map(n => ({ ...n, read: true }));
  saveNotifications(updated);
  window.dispatchEvent(new CustomEvent('notifications-updated'));
}

/**
 * Remove a notification
 */
export function removeNotification(id: string): void {
  const notifications = getNotifications();
  const updated = notifications.filter(n => n.id !== id);
  saveNotifications(updated);
  window.dispatchEvent(new CustomEvent('notifications-updated'));
}

/**
 * Clear all notifications
 */
export function clearAllNotifications(): void {
  saveNotifications([]);
  window.dispatchEvent(new CustomEvent('notifications-updated'));
}

/**
 * Format timestamp to relative time (e.g., "2 minutes ago")
 */
export function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
}
