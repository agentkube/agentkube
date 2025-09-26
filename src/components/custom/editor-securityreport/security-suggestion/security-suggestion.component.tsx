import React, { useState, useEffect } from 'react';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { securityRemediationStream } from '@/api/remediation';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import SecurityCodeBlock from '../security-codeblock/security-codeblock.component';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/contexts/useAuth';
import { toast as sooner } from "sonner";

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
  const { user } = useAuth();

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

    // Check if user is authenticated and block the request if not
    if (!user || !user.isAuthenticated) {
      sooner("Sign In Required", {
        description: "This feature requires you to be signed in. Please sign in to continue using the AI assistant and access your free credits.",
      });
      return;
    }

    // Check if user has exceeded their usage limit
    if (user.usage_limit && (user.usage_count || 0) >= user.usage_limit) {
      sooner("Usage Limit Exceeded", {
        description: `You have reached your usage limit of ${user.usage_limit} requests. Please upgrade your plan to continue using the AI assistant.`,
      });
      return;
    }
    
    setIsLoading(true);
    setSuggestion('');
    setCodeBlock('');
    
    let responseText = '';
    
    try {
      await securityRemediationStream(
        {
          message: `Provide only the YAML to add to fix this security issue`,
          manifest_content: yamlContent,
          vulnerability_context: {
            severity: misconfiguration.Severity,
            description: misconfiguration.Description,
            code_snippet: misconfiguration.CauseMetadata?.Code?.Lines ? 
              misconfiguration.CauseMetadata.Code.Lines.map((line: any) => line.Content).join('\n') : ''
          },
          model: "openai/o3-mini" // TODO need to change the model
        },
        {
          onToken: (token) => {
            responseText += token;
            setSuggestion(responseText);
          },
          onComplete: (finalResponse) => {
            // Use the finalResponse parameter to ensure we have the complete text
            setIsLoading(false);
            setHasFetched(true);
            // Set the final response again to ensure we have the complete text
            setSuggestion(finalResponse);
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
            className="w-full flex justify-between rounded-[0.4rem] items-center bg-gray-100 hover:bg-gray-200 border border-gray-400/20"
            onClick={handleClick}
          >
            <div className="flex items-center">
              <Wand2 className="w-4 h-4 mr-2 text-green-500" />
              {isLoading ? 'Generating suggestions...' : 'View Remediation'}
            </div>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-[0.4rem]">
            {isLoading ? (
              <div className="flex justify-center items-center py-4">
                {/* <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span>Generating suggestions...</span> */}
              </div>
            ) : suggestion ? (
              <div>
                {codeBlock ? (
                  <div>
                    {/* Show brief explanation text before code block */}
                    <div className=" text-sm">
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