export const formatTableOutput = (output: string) => {
  const lines = output.split('\n');
  
  return (
    <div className="font-mono whitespace-pre">
      {lines.map((line, index) => {
        if (index === 0 && line.includes('NAMESPACE')) {
          // Header row
          return (
            <div key={index} className="font-bold text-blue-600 dark:text-blue-400">
              {line}
            </div>
          );
        } else if (line.trim() && line.includes('   ')) {
          // Data rows - apply colors using regex replacement
          let processedLine = line;
          const parts = line.split(/(\s+)/); // Split but keep separators
          
          return (
            <div key={index}>
              {parts.map((part, partIndex) => {
                if (part.trim() && partIndex < 12) { // Only color actual content, not spaces
                  const columnIndex = Math.floor(partIndex / 2);
                  const colors = [
                    'text-purple-600 dark:text-purple-400',
                    'text-green-600 dark:text-green-400',
                    'text-blue-600 dark:text-blue-400',
                    'text-orange-600 dark:text-orange-400',
                    'text-red-600 dark:text-red-400',
                    'text-gray-600 dark:text-gray-400'
                  ];
                  return (
                    <span key={partIndex} className={colors[columnIndex] || 'text-gray-600 dark:text-gray-400'}>
                      {part}
                    </span>
                  );
                }
                return <span key={partIndex}>{part}</span>;
              })}
            </div>
          );
        }
        return <div key={index}>{line}</div>;
      })}
    </div>
  );
};