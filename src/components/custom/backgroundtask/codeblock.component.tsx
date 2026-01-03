import React, { useState } from 'react';
import { Copy, CheckCheck, SquareTerminal } from 'lucide-react';
import { useTerminal } from '@/contexts/useTerminal';
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
  const { openTerminalWithCommand } = useTerminal();

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
          {(language === 'bash' || content.trim().startsWith('kubectl')) && (
            <button
              onClick={() => openTerminalWithCommand(content, undefined, false)}
              className="px-2 py-1 transition-all rounded-[0.3rem] ml-1 bg-transparent hover:bg-muted text-foreground/70"
              title="Send to Terminal"
            >
              <SquareTerminal size={16} />
            </button>
          )}
          <button
            onClick={handleCopy}
            className="px-2 py-1 transition-all rounded-[0.3rem] ml-1 bg-transparent hover:bg-muted text-foreground/70"
          >
            {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      <div className="px-4 overflow-x-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700/30 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50 [&_pre::-webkit-scrollbar]:w-1.5 [&_pre::-webkit-scrollbar]:h-1.5 [&_pre::-webkit-scrollbar-track]:bg-transparent [&_pre::-webkit-scrollbar-thumb]:bg-gray-700/30 [&_pre::-webkit-scrollbar-thumb]:rounded-full [&_pre::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
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