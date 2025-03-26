import React, { useState, useEffect } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { securityChatStream } from '@/api/chat';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import SecurityCodeBlock from '../security-codeblock/security-codeblock.component';
import ReactMarkdown from 'react-markdown';

interface SecuritySuggestionProps {
  yamlContent: string;
  misconfiguration: any;
}

const SecuritySuggestion: React.FC<SecuritySuggestionProps> = ({ yamlContent, misconfiguration }) => {
  const [suggestion, setSuggestion] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [hasFetched, setHasFetched] = useState<boolean>(false);
  const [codeBlock, setCodeBlock] = useState<string>('');

  // Extract code block from markdown response
  useEffect(() => {
    if (suggestion) {
      const codeBlockRegex = /```yaml\s*([\s\S]*?)```/g;
      const matches = [...suggestion.matchAll(codeBlockRegex)];
      
      if (matches.length > 0) {
        setCodeBlock(matches[0][1].trim());
      } else {
        setCodeBlock('');
      }
    }
  }, [suggestion]);

  const fetchSuggestion = async () => {
    if (isLoading || hasFetched) return;
    
    setIsLoading(true);
    setSuggestion('');
    setCodeBlock('');
    
    let responseText = '';
    
    try {
      await securityChatStream(
        {
          message: `Provide only the YAML to add to fix this security issue`,
          manifest_content: yamlContent,
          vulnerability_context: {
            severity: misconfiguration.Severity,
            description: misconfiguration.Description,
            code_snippet: misconfiguration.CauseMetadata?.Code?.Lines ? 
              misconfiguration.CauseMetadata.Code.Lines.map((line: any) => line.Content).join('\n') : ''
          }
        },
        {
          onToken: (token) => {
            responseText += token;
            setSuggestion(responseText);
          },
          onComplete: () => {
            setIsLoading(false);
            setHasFetched(true);
          },
          onError: (error) => {
            console.error('Error getting security suggestion:', error);
            setIsLoading(false);
            setSuggestion('Failed to generate security suggestions. Please try again.');
          }
        }
      );
    } catch (error) {
      console.error('Error streaming security suggestion:', error);
      setIsLoading(false);
      setSuggestion('Failed to generate security suggestions. Please try again.');
    }
  };

  const handleClick = () => {
    if (!hasFetched) {
      fetchSuggestion();
    }
    setIsExpanded(!isExpanded);
  };

  // Custom renderer for code blocks - we'll use our SecurityCodeBlock component
  const customRenderers = {
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      if (!inline && match) {
        return (
          <SecurityCodeBlock 
            code={String(children).replace(/\n$/, '')} 
            language={match[1]} 
          />
        );
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
  };

  return (
    <div className="mt-4">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="outline" 
            className="w-full flex justify-between rounded-[0.4rem] items-center bg-gray-100 hover:bg-gray-200 border border-gray-400"
            onClick={handleClick}
          >
            <div className="flex items-center">
              <Sparkles className="w-4 h-4 mr-2 text-green-500" />
              {isLoading ? 'Generating suggestions...' : 'View remediation suggestions'}
            </div>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-[0.4rem] border border-gray-300">
            {isLoading ? (
              <div className="flex justify-center items-center py-4">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span>Generating suggestions...</span>
              </div>
            ) : suggestion ? (
              <div>
                {codeBlock ? (
                  <div>
                    {/* Show brief explanation text before code block */}
                    <div className="p-3 text-sm">
                      {suggestion.split('```')[0].trim()}
                    </div>
                    
                    {/* Render the code block using SecurityCodeBlock */}
                    <SecurityCodeBlock code={codeBlock} language="yaml" />
                  </div>
                ) : (
                  /* Fallback to rendering markdown if no code block detected */
                  <div className="p-4 text-sm">
                    <ReactMarkdown components={customRenderers as any}>
                      {suggestion}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-sm">Click to generate remediation suggestions.</div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default SecuritySuggestion;