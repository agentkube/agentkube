import React, { useState } from 'react';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';

interface SecurityCodeBlockProps {
  code: string;
  language?: string;
  highlightedLines?: number[];
  startLine?: number;
}

const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;

const SecurityCodeBlock: React.FC<SecurityCodeBlockProps> = ({
  code,
  language = 'yaml',
  highlightedLines = [],
  startLine = 1,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const customStyle = {
    backgroundColor: 'transparent',
    margin: 0,
    padding: '0.5rem 0',
    fontSize: '0.875rem',
  };

  const lineProps = (lineNumber: number) => {
    const style = {
      display: 'block',
      // backgroundColor: highlightedLines.includes(lineNumber) ? 'rgba(255, 229, 100, 0.2)' : 'transparent',
      backgroundColor: 'transparent',
      padding: '0 1rem',
    };
    return { style };
  };

  return (
    <div className="my-2 border border-gray-400/40 dark:border-gray-500/20 rounded-lg">
      <div className="flex justify-between items-center px-3 py-1 text-gray-400 bg-gray-200/80 dark:bg-transparent  rounded-t-[0.4rem]">
        <span className="text-xs font-mono">yaml</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded-[0.3rem] transition-colors"
            aria-label="Copy code"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>
      </div>
      <div className="bg-gray-200 dark:bg-transparent rounded-b-[0.4rem] overflow-hidden">
        <SyntaxHighlighter
          language={language}
          style={oneDark}
          customStyle={customStyle}
          showLineNumbers={true}
          wrapLines={true}
          lineProps={lineProps}
          startingLineNumber={startLine}
          lineNumberStyle={{
            minWidth: '1em',
            paddingRight: '1em',
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
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

export default SecurityCodeBlock;