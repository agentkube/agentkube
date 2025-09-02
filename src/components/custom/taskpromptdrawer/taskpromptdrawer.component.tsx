import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { SideDrawer, DrawerHeader, DrawerContent } from "@/components/ui/sidedrawer.custom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Edit, Copy, Check, Eye, ArrowUpRight, Logs } from 'lucide-react';
import { InvestigationTaskDetails, ResourceContext } from '@/types/task';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { nord } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CSSProperties } from 'react';
import { SiKubernetes } from '@icons-pack/react-simple-icons';

const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;

interface TaskPromptDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  promptDetails: InvestigationTaskDetails | null;
  promptLoading: boolean;
}

const TaskPromptDrawer: React.FC<TaskPromptDrawerProps> = ({
  isOpen,
  onClose,
  promptDetails,
  promptLoading
}) => {
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  const customStyle: CSSProperties = {
    padding: '0.5rem',
    borderRadius: '0.5rem',
    background: 'transparent',
    fontSize: '0.75rem'
  };

  const handleEditPrompt = () => {
    if (promptDetails) {
      setEditedPrompt(promptDetails.prompt);
      setIsEditingPrompt(true);
    }
  };

  const handleSavePrompt = () => {
    setIsEditingPrompt(false);
  };

  const handleCancelEdit = () => {
    setIsEditingPrompt(false);
    setEditedPrompt('');
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy content:', err);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const extractResourceContent = (resourceContentJson: string): string => {
    try {
      const parsed = JSON.parse(resourceContentJson);
      return parsed.resourceContent || resourceContentJson;
    } catch {
      return resourceContentJson;
    }
  };

  const isPromptModified = promptDetails && editedPrompt !== promptDetails.prompt;

  return (
    <SideDrawer
      isOpen={isOpen}
      onClose={onClose}
      offsetTop="-top-2"
    >
      <DrawerHeader onClose={onClose}>
        <div className="py-1">
          <div className='flex items-center space-x-2'>
            <div className='flex items-center gap-1'>
              <h3 className="font-[Anton] uppercase text-md text-gray-800 dark:text-gray-500/40 tracking-wide">
                Investigation Prompt
              </h3>
            </div>
          </div>
        </div>
      </DrawerHeader>

      <DrawerContent>
        <div className="p-6 space-y-4">
          {promptLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div>
              <span className="ml-2 text-sm text-gray-500">Loading prompt details...</span>
            </div>
          ) : promptDetails ? (
            <>
              <div className="flex justify-between">
                <div>
                  <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">Task ID</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                    {promptDetails.task_id}
                  </p>
                </div>

                {promptDetails.model && (
                  <div className="">
                    <h4 className="font-medium text-right text-xs uppercase text-gray-900 dark:text-gray-500">Model</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                      {promptDetails.model}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">Original Prompt</h4>
                  <div className="flex items-center gap-2">
                    {!isEditingPrompt && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={handleEditPrompt}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>

                {isEditingPrompt ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <textarea
                        value={editedPrompt}
                        onChange={(e) => setEditedPrompt(e.target.value)}
                        className="w-full h-32 p-3 text-sm border rounded-lg bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter your investigation prompt..."
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleSavePrompt}
                        className="h-7 px-3 text-xs"
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelEdit}
                        className="h-7 px-3 text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="bg-gray-800 dark:bg-gray-800/20 rounded-lg overflow-hidden border">
                      <button
                        onClick={() => handleCopy(promptDetails.prompt || '')}
                        className="absolute top-2 right-2 p-2 rounded-lg bg-neutral-700/20 dark:bg-gray-500/10 hover:bg-gray-600 text-gray-200/60 hover:text-white z-10"
                        aria-label="Copy prompt"
                      >
                        {copied ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <SyntaxHighlighter
                        language="text"
                        style={nord}
                        customStyle={customStyle}
                        wrapLines={true}
                        showLineNumbers={false}
                      >
                        {promptDetails.prompt || 'No prompt available'}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                )}
              </div>

              {promptDetails.context && (
                <div className="space-y-2 border border-gray-200 dark:border-gray-800 rounded-lg">
                  <div className='bg-gray-200 dark:bg-gray-700/20 py-1.5 px-4'>
                    <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">Context</h4>
                  </div>
                  <div className="py-2 px-3">
                    <div className="text-sm space-y-2">
                      <div className='flex justify-between'>
                        <span className='dark:text-gray-500'>Cluster</span>
                        {promptDetails.context.kubecontext && (
                          <div className='flex items-center gap-1 text-gray-700 dark:text-gray-300'>
                            <span className="font-medium"><SiKubernetes className='h-4 w-4' /></span> {promptDetails.context.kubecontext}
                          </div>
                        )}
                      </div>
                      <div className='flex justify-between'>
                        <span className='dark:text-gray-500'>Namespace</span>
                        {promptDetails.context.namespace && (
                          <div className='text-gray-700 dark:text-gray-300 cursor-pointer text-blue-500 dark:hover:text-blue-400'>
                            {promptDetails.context.namespace}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {promptDetails.resource_context && promptDetails.resource_context.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">Resource Context</h4>
                  <div className="space-y-2">
                    {promptDetails.resource_context.map((resource: ResourceContext, index) => (
                      <div key={index} className="bg-transparent rounded-lg border border-gray-200 dark:border-gray-800">
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value={`resource-${index}`} className="border-0">
                            <AccordionTrigger className="px-2 py-2 hover:no-underline">
                              <div className="flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400">
                                <SiKubernetes className='h-4 w-4' /> {resource.resource_name}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-2 pb-2">
                              <div className="relative">
                                <button
                                  onClick={() => handleCopy(extractResourceContent(resource.resource_content))}
                                  className="absolute top-2 right-2 p-2 rounded-lg bg-neutral-700/20 dark:bg-gray-500/10 hover:bg-gray-600 text-gray-200/60 hover:text-white z-10"
                                  aria-label="Copy resource content"
                                >
                                  {copied ? (
                                    <Check className="w-3 h-3" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                                <div className="max-h-48 overflow-y-auto rounded-b-lg shadow-lg
                                  [&::-webkit-scrollbar]:w-1.5 
                                  [&::-webkit-scrollbar-track]:bg-transparent 
                                  [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
                                  [&::-webkit-scrollbar-thumb]:rounded-full
                                  [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
                                  <SyntaxHighlighter
                                    language="yaml"
                                    style={nord}
                                    customStyle={customStyle}
                                    wrapLines={true}
                                    showLineNumbers={true}
                                    lineNumberStyle={{
                                      color: '#262625',
                                    }}
                                  >
                                    {extractResourceContent(resource.resource_content)}
                                  </SyntaxHighlighter>
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">Log Context</h4>
                {promptDetails.log_context && promptDetails.log_context.length > 0 ? (
                  <div className="space-y-2">
                    {promptDetails.log_context.map((log, index) => (
                      <div key={index} className="bg-transparent dark:bg-transparent rounded-lg border border-gray-200 dark:border-gray-800">
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value={`log-${index}`} className="border-0">
                            <AccordionTrigger className="px-3 py-2 hover:no-underline">
                              <div className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                                <Logs className='h-4 w-4' /> {log.log_name}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-3 pb-3">
                              <div className="relative">
                                <button
                                  onClick={() => handleCopy(log.log_content)}
                                  className="absolute top-2 right-2 p-2 rounded-lg bg-neutral-700/80 hover:bg-gray-600 text-gray-200/60 hover:text-white z-10"
                                  aria-label="Copy log content"
                                >
                                  {copied ? (
                                    <Check className="w-3 h-3" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                                <div className='max-h-48 overflow-y-auto rounded-b-lg shadow-lg
                              [&::-webkit-scrollbar]:w-1.5 
                              [&::-webkit-scrollbar-track]:bg-transparent 
                              [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
                              [&::-webkit-scrollbar-thumb]:rounded-full
                              [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50'>
                                  <SyntaxHighlighter
                                    language="text"
                                    style={nord}
                                    customStyle={customStyle}
                                    wrapLines={true}
                                    showLineNumbers={false}
                                  >
                                    {log.log_content}
                                  </SyntaxHighlighter>
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-200 dark:bg-transparent rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-700 dark:text-gray-300">No log context provided</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Log context will appear here if provided in the investigation request</p>
                    </div>
                  </div>
                )}
              </div>

              {promptDetails.created_at && (
                <div className="space-y-2">
                  <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">Created</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(promptDetails.created_at)}
                  </p>
                </div>
              )}

              {isPromptModified && (
                <div className="pt-4">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                    Re-Investigate Task
                    <ArrowUpRight className="w-4 h-4 mr-2" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <Eye className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No prompt details available</p>
            </div>
          )}
        </div>
      </DrawerContent>
    </SideDrawer>
  );
};

export default TaskPromptDrawer;