import { ChevronDown, ChevronUp, File } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;

export const TemplateParameter: React.FC<{ jsonObjects: string[] }> = ({ jsonObjects }) => {
  const [showJsonData, setShowJsonData] = useState(false);
  const { theme } = useTheme();

  const customStyle = {
    backgroundColor: 'transparent',
    margin: 0,
    padding: '0.2rem 0.5rem',
    fontSize: '0.875rem',
    color: theme === "dark" ? "#f2f2f2CC" : "#000000"
  };

  if (!jsonObjects || jsonObjects.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 border border-gray-300 dark:border-gray-800/50 rounded-md">
      <div
        className="flex justify-between items-center p-1 bg-gray-200 dark:bg-transparent cursor-pointer"
        onClick={() => setShowJsonData(!showJsonData)}
      >
        <span className="flex items-center font-medium text-xs">
          <File className='h-3 w-3 mx-1' />
          Template ({jsonObjects.length})
        </span>
        {showJsonData ? (
          <ChevronUp className="dark:text-gray-500 h-4 w-4 mx-1" />
        ) : (
          <ChevronDown className="dark:text-gray-500 h-4 w-4 mx-1" />
        )}
      </div>
      {showJsonData && (
        <div className="p-3 dark:bg-transparent rounded-b-md overflow-auto">
          {jsonObjects.map((jsonObj, index) => (
            <div key={index} className="mb-2 last:mb-0">
              <div className="rounded-md overflow-x-auto">
                <SyntaxHighlighter
                  language={'json'}
                  style={oneDark}
                  customStyle={customStyle}
                  wrapLines={true}
                  lineNumberStyle={{
                    minWidth: '1em',
                    paddingRight: '0.5em',
                    color: '#606366',
                    textAlign: 'right',
                    userSelect: 'none',
                    marginRight: '0.5rem',
                    borderRight: '1px solid #404040',
                  }}
                  codeTagProps={{
                    style: {
                      fontSize: '0.875rem',
                      fontFamily: 'Monaco, Menlo, monospace',
                    }
                  }}
                >
                  {jsonObj}
                </SyntaxHighlighter>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};