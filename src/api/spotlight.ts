import { getHeaders } from '@/utils/headers';

interface CommandSuggestion {
  command: string;
}


export const getCommandSuggestion = async (
  intention: string
): Promise<CommandSuggestion[]> => {
  const response = await fetch('/api/spotlight/command-suggestion', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ intention }),
  });

  if (!response.ok) {
    throw new Error('Failed to get command suggestions');
  }

  return response.json();
};