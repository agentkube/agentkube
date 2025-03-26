import React from 'react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  color?: 'primary' | 'white';
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className,
  color = 'primary'
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  const colorClasses = {
    primary: 'text-primary',
    white: 'text-white'
  };

  return (
    <div
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-solid border-current border-r-transparent',
        sizeClasses[size],
        colorClasses[color],
        className
      )}
      role="status"
      aria-label="loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};

// Additional loading variants you might find useful
export const LoadingDots: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn("flex space-x-1", className)}>
      {[1, 2, 3].map((dot) => (
        <div
          key={dot}
          className="w-2 h-2 bg-current rounded-full animate-pulse"
          style={{
            animationDelay: `${dot * 100}ms`
          }}
        />
      ))}
    </div>
  );
};

// Loading overlay for full-screen or container loading states
export const LoadingOverlay: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg flex flex-col items-center space-y-4">
        <LoadingSpinner size="lg" />
        {message && <p className="text-gray-700">{message}</p>}
      </div>
    </div>
  );
};

export default LoadingSpinner;