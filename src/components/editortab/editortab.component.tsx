import React, { useState, useEffect } from 'react';
import { CustomMonacoEditor } from '@/components/custom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import {
  Save,
  FileText,
  PanelRight,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { homeDir, join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import '@/styles/markdown.css';
import { CodeBlock } from '@/components/custom/codeblock/codeblock.component';

export interface EditorTabProps {
  sessionId: string;
  isActive: boolean;
  filePath?: string;
  initialContent?: string;
  onClose?: () => void;
  onSave?: (content: string) => Promise<void>;
  onUnsavedChange?: (hasUnsaved: boolean) => void;
}

const EditorTab: React.FC<EditorTabProps> = ({
  sessionId, // Kept for consistency/identity
  isActive,
  filePath = 'Untitled.md',
  initialContent = '',
  onClose,
  onSave,
  onUnsavedChange
}) => {
  const [content, setContent] = useState<string>(initialContent);
  const [savedContent, setSavedContent] = useState<string>(initialContent); // Track last saved content
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [editorTheme] = useState<string>('vitesse-dark'); // Set default theme to 'vitesse-dark' for Shiki compatibility
  const [resolvedFilePath, setResolvedFilePath] = useState<string | null>(null); // Track the resolved absolute path

  // Check if content has unsaved changes
  const hasUnsavedChanges = content !== savedContent;

  // Notify parent of unsaved changes
  useEffect(() => {
    onUnsavedChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChange]);

  // Determine if marked is markdown based on extension
  const isMarkdown = filePath?.toLowerCase().endsWith('.md') ?? false;

  // Handle content change
  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setContent(value);
    }
  };

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (onSave) {
        await onSave(content);
      } else {
        // If it's a real file (not Untitled), save it to disk
        if (filePath && filePath !== 'Untitled.md') {
          // Use the resolved path if available, otherwise use the original filePath
          const pathToWrite = resolvedFilePath || filePath;
          await writeTextFile(pathToWrite, content);
        } else {
          // Mock save for Untitled
          console.log('Saving Untitled content:', content);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      setSavedContent(content); // Update saved content tracker
      toast.success('File saved successfully');
    } catch (error) {
      console.error('Failed to save:', error);
      toast.error(`Failed to save: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Load file content if empty and filePath is provided
  useEffect(() => {
    const loadContent = async () => {
      if (!content && filePath && filePath !== 'Untitled.md') {
        try {
          let pathToRead = filePath;

          // Handle ~ expansion
          if (pathToRead.startsWith('~/') || pathToRead === '~') {
            const home = await homeDir();
            pathToRead = pathToRead.replace(/^~(?=$|\/)/, home);
          }

          // Pre-resolve path to avoid "Forbidden path" errors for relative paths
          let finalPath = pathToRead;
          const isAbsolute = pathToRead.startsWith('/') || pathToRead.match(/^[a-zA-Z]:\\/);
          const isHomeRelative = pathToRead.startsWith('~/') || pathToRead === '~';

          let loadedContent;

          if (isAbsolute || isHomeRelative) {
            // Already absolute or explicitly home-relative
            if (isHomeRelative) {
              const home = await homeDir();
              finalPath = pathToRead.replace(/^~(?=$|\/)/, home);
            }
            try {
              loadedContent = await readTextFile(finalPath);
            } catch (e) {
              console.error(`Failed to read ${finalPath}:`, e);
              throw e;
            }
          } else {
            // Try resolving relative path against CWD first, then Home
            try {
              const cwd = await invoke<string>('get_cwd');
              finalPath = await join(cwd, pathToRead);
              console.log(`Attempting to read from CWD: ${finalPath}`);
              loadedContent = await readTextFile(finalPath);
            } catch (cwdError) {
              console.warn(`Failed to read from CWD (${finalPath}), trying Home fallback:`, cwdError);
              // Fallback to Home
              let home;
              try {
                home = await homeDir();
                finalPath = await join(home, pathToRead);
                console.log(`Attempting to read from Home: ${finalPath}`);
                loadedContent = await readTextFile(finalPath);
              } catch (homeError) {
                console.warn(`Failed to read from Home (${finalPath}), trying .agentkube fallback`, homeError);
                // Fallback to ~/.agentkube/
                try {
                  if (!home) home = await homeDir();
                  finalPath = await join(home, '.agentkube', pathToRead);
                  console.log(`Attempting to read from .agentkube: ${finalPath}`);
                  loadedContent = await readTextFile(finalPath);
                } catch (agentKubeError) {
                  console.error(`Failed to read from .agentkube (${finalPath}):`, agentKubeError);
                  throw agentKubeError;
                }
              }
            }
          }

          console.log(`Successfully read file: ${finalPath}`);
          setContent(loadedContent);
          setResolvedFilePath(finalPath); // Store the resolved path for saving
        } catch (error) {
          console.error('Failed to load file content:', error);
          toast.error(`Failed to load ${filePath}: ${error}`);
        }
      }
    };
    loadContent();
  }, [filePath, content]); // Dep on content is fine here as we check !content

  // Keyboard shortcut for save (Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, content, handleSave]);

  return (
    <div
      className="flex flex-col h-full bg-background"
      style={{ display: isActive ? 'flex' : 'none' }}
    >
      {/* Header Bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-card/30 border-b border-border">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-2 bg-background/50 rounded border border-border/50 px-3 py-1 flex-1 max-w-2xl">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm text-foreground truncate select-none">{filePath}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="h-8 w-8 p-0"
            title="Save (Cmd+S)"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            )}
          </Button>

          {isMarkdown && (
            <Button
              variant={isPreviewOpen ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setIsPreviewOpen(!isPreviewOpen)}
              className="h-8 w-8 p-0"
              title="Toggle Markdown Preview"
            >
              <PanelRight className={`h-4 w-4 ${isPreviewOpen ? 'text-primary' : 'text-muted-foreground'}`} />
            </Button>
          )}


        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Editor Pane */}
        <div
          className={`h-full transition-all duration-300 ease-in-out ${isMarkdown && isPreviewOpen ? 'w-1/2' : 'w-full'}`}
        >
          <div className="h-full w-full">
            <CustomMonacoEditor
              value={content}
              onChange={handleEditorChange}
              theme={editorTheme}
              height="100%"
            />
          </div>
        </div>

        {/* Preview Pane */}
        {isMarkdown && isPreviewOpen && (
          <div className="w-1/2 h-full border-l border-border bg-background overflow-y-auto p-6">
            <article className="markdown-preview text-foreground max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code(props) {
                    const { children, className, node, ...rest } = props as any;
                    const match = /language-(\w+)/.exec(className || '');
                    const language = match ? match[1] : '';
                    const inline = !className;

                    // Handle undefined/null children
                    const code = children ? String(children).replace(/\n$/, '') : '';

                    return !inline ? (
                      <CodeBlock language={language}>
                        {code}
                      </CodeBlock>
                    ) : (
                      <code className={className} {...rest}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {content}
              </ReactMarkdown>
            </article>
          </div>
        )}
      </div>
    </div >
  );
};

export default EditorTab;
