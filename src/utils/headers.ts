import { 
  Session
} from '@supabase/supabase-js';

export const getAuthToken = (): string | null => {
  try {
    const session = localStorage.getItem('sb-wvrqibywooomchmcyzvd-auth-token');
    if (session) {
      const { access_token } = JSON.parse(session) as Session;
      return access_token;
    }
    return null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
};

export const getHeaders = (): HeadersInit => {
  const token = getAuthToken();
  return {
    "Content-Type": "application/json",
    "Authorization": token ? `Bearer ${token}` : '',
  };
};