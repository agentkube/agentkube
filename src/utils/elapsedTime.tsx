
export const formatElapsedTime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const milliseconds = Math.floor((ms % 1000) / 100);
  return `${seconds}.${milliseconds}s`;
};