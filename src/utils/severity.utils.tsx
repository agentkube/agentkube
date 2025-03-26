interface SeverityColors {
  text: string;
  border: string;
  background: string;
}

export const getSeverityColors = (severity: string): SeverityColors => {
  switch (severity.toUpperCase()) {
    case 'CRITICAL':
      return {
        text: 'text-red-700',
        border: 'border-red-500 dark:border-red-500/20',
        background: 'bg-red-100 dark:bg-red-600/20'
      };
    case 'HIGH':
      return {
        text: 'text-red-700',
        border: 'border-red-300 dark:border-red-300/20',
        background: 'bg-red-50 dark:bg-red-300/20'
      };
    case 'MEDIUM':
      return {
        text: 'text-yellow-800 dark:text-yellow-500/50',
        border: 'border-yellow-300 dark:border-yellow-300/20',
        background: 'bg-yellow-50 dark:bg-yellow-300/20'
      };
    case 'LOW':
      return {
        text: 'text-blue-700',
        border: 'border-blue-300 dark:border-blue-300/20',
        background: 'bg-blue-50 dark:bg-blue-300/20'
      };
    default:
      return {
        text: 'text-green-700',
        border: 'border-green-300 dark:border-green-300/20',
        background: 'bg-green-100 dark:bg-green-800/20'
      };
  }
};
