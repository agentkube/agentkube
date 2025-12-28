import React, { useState } from 'react';
import { Copy, CheckCheck } from 'lucide-react';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';

// Cast Prism to the appropriate React component type
const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;

interface CodeBlockProps {
  language?: string;
  content: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  language = 'plaintext',
  content
}) => {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Custom styles for syntax highlighter
  const customStyle = {
    backgroundColor: 'transparent',
    margin: 0,
    padding: '0.5rem 0',
    fontSize: '0.75rem',
    color: theme === "dark" ? "#f2f2f2CC" : "#000000"
  };

  return (
    <div className="relative my-4 rounded-xl bg-muted/50 border border-border">
      <div className="flex justify-between px-2 py-1 border-border">
        <div className="px-4 py-1 text-xs text-muted-foreground flex items-center">
          <span className="text-xs text-foreground/70">
            {language}
          </span>
        </div>
        <div className="flex">
          <button
            onClick={handleCopy}
            className="px-2 py-1 transition-all rounded-[0.3rem] ml-2 bg-transparent hover:bg-muted text-foreground/70"
          >
            {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      <div className="px-4 overflow-x-auto">
        <SyntaxHighlighter
          language={language}
          style={oneDark}
          customStyle={customStyle}
          showLineNumbers={false}
          wrapLines={true}
          codeTagProps={{
            style: {
              fontSize: '0.75rem',
              fontFamily: 'Monaco, Menlo, monospace',
            }
          }}
        >
          {content}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};