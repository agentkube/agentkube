export const calculateAge = (creationTimestamp: string | undefined): string => {
  if (!creationTimestamp) return 'N/A';

  const created = new Date(creationTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days > 0) return `${days}d`;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours > 0) return `${hours}h`;

  const minutes = Math.floor(diffMs / (1000 * 60));
  return `${minutes}m`;
};