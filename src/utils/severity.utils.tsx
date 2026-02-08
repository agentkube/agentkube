interface SeverityColors {
  text: string;
  border: string;
  background: string;
}

export const getSeverityColors = (severity: string): SeverityColors => {
  switch (severity.toUpperCase()) {
    case 'CRITICAL':
      return {
        text: 'text-red-600',
        border: 'border-none dark:border-none',
        background: 'bg-red-100 dark:bg-red-600/20'
      };
    case 'HIGH':
      return {
        text: 'text-red-700',
        border: 'border-none dark:border-none',
        background: 'bg-red-50 dark:bg-red-500/10'
      };
    case 'MEDIUM':
      return {
        text: 'text-yellow-600 dark:text-yellow-500',
        border: 'border-none dark:border-none',
        background: 'bg-yellow-50 dark:bg-yellow-300/20'
      };
    case 'LOW':
      return {
        text: 'text-blue-600',
        border: 'border-none dark:border-none',
        background: 'bg-blue-50 dark:bg-blue-600/20'
      };
    default:
      return {
        text: 'text-green-700',
        border: 'border-none dark:border-none',
        background: 'bg-green-100 dark:bg-green-800/20'
      };
  }
};
