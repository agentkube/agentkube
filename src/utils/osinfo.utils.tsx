import { platform, arch, type, version, locale, hostname } from '@tauri-apps/plugin-os';

/**
 * Generates a recognizable instance name with device information
 * Note: This is a synchronous implementation that uses available information
 * without awaiting any promises
 */
export const generateInstanceName = (): string => {
  try {
    const userAgent = navigator.userAgent;
    
    let osName = 'Unknown';
    if (userAgent.includes('Windows')) {
      osName = 'Windows';
    } else if (userAgent.includes('Mac')) {
      osName = 'macOS';
    } else if (userAgent.includes('Linux')) {
      osName = 'Linux';
    }

    let archName = 'Unknown';
    if (userAgent.includes('x64') || userAgent.includes('x86_64')) {
      archName = 'x64';
    } else if (userAgent.includes('arm') || userAgent.includes('ARM')) {
      archName = 'ARM';
    }

    let deviceName = 'Unknown';
    if (userAgent.includes('Macintosh')) {
      deviceName = 'Mac';
    } else if (userAgent.includes('Windows')) {
      deviceName = 'PC';
    } else if (userAgent.includes('Linux')) {
      deviceName = 'Linux';
    } else if (userAgent.includes('Android')) {
      deviceName = 'Android';
    }
    
  
    let browserName = 'Unknown';
    if (userAgent.includes('Chrome')) {
      browserName = 'Chrome';
    } else if (userAgent.includes('Firefox')) {
      browserName = 'Firefox';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      browserName = 'Safari';
    } else if (userAgent.includes('Edge')) {
      browserName = 'Edge';
    }
    
    const dateString = new Date().toISOString().slice(0, 10);
    
    const randomId = Math.random().toString(36).substring(2, 8);
    
    return `${deviceName}-${osName}-${browserName}-${dateString}-${randomId}`;
  } catch (error) {
    console.error('Error generating instance name:', error);
    
    const randomId = Math.random().toString(36).substring(2, 15);
    return `system-${randomId}`;
  }
};
