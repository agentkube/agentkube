// utils/time-formatter.utils.ts
export const formatAge = (timestamp: string): string => {
  try {
    // Remove "IST" and handle the timezone offset
    const cleanTimestamp = timestamp.replace(' IST', '');
    const date = new Date(cleanTimestamp);
    
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }

    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return `${diffInSeconds}s`;
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours}h`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d`;
  } catch (error) {
    console.error('Error parsing date:', error);
    return 'Invalid date';
  }
};