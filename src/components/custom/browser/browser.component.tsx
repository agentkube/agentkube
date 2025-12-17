import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Star,
  Globe,
  Loader2,
  ExternalLink,
  Copy,
  X,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

export interface BrowserTabProps {
  sessionId: string;
  isActive: boolean;
  initialUrl?: string;
  onClose?: () => void;
  onUrlChange?: (url: string) => void;
}

interface BrowserState {
  url: string;
  displayUrl: string;
  isLoading: boolean;
  isFavorite: boolean;
  error: string | null;
  webviewCreated: boolean;
}

interface BrowserUrlChangedEvent {
  session_id: string;
  url: string;
}

interface BrowserLoadingEvent {
  session_id: string;
  is_loading: boolean;
}

const BrowserTab: React.FC<BrowserTabProps> = ({
  sessionId,
  isActive,
  initialUrl,
  onUrlChange,
}) => {
  const urlInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNavigatingHistory = useRef(false); // Track if we're navigating via back/forward
  const historyIndexRef = useRef(initialUrl ? 0 : -1); // Ref to avoid stale closure
  const [state, setState] = useState<BrowserState>({
    url: initialUrl || '',
    displayUrl: initialUrl || '',
    isLoading: false,
    isFavorite: false,
    error: null,
    webviewCreated: false,
  });
  const [history, setHistory] = useState<string[]>(initialUrl ? [initialUrl] : []);
  const [historyIndex, setHistoryIndex] = useState(initialUrl ? 0 : -1);

  // Keep ref in sync with state
  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  // Format URL with protocol if missing
  const formatUrl = (input: string): string => {
    let url = input.trim();
    if (!url) return '';

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.') || url.startsWith('localhost')) {
        url = `https://${url}`;
      } else {
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      }
    }

    return url;
  };

  // Get container bounds for positioning the webview
  const getContainerBounds = useCallback(async () => {
    if (!containerRef.current) return null;

    const rect = containerRef.current.getBoundingClientRect();
    const mainWindow = await getCurrentWindow();
    const scaleFactor = await mainWindow.scaleFactor();

    // Get the window's outer position to calculate absolute screen position
    const windowPos = await mainWindow.outerPosition();

    return {
      x: windowPos.x / scaleFactor + rect.left,
      y: windowPos.y / scaleFactor + rect.top + 30, // Account for title bar
      width: rect.width,
      height: rect.height,
    };
  }, []);

  // Webview is created only when user navigates (in navigate function)
  // No automatic creation on mount

  // Update webview bounds when container size changes or tab becomes active
  useEffect(() => {
    if (!state.webviewCreated || !containerRef.current) return;

    const updateBounds = async () => {
      const bounds = await getContainerBounds();
      if (!bounds) return;

      try {
        await invoke('update_browser_bounds', {
          sessionId,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        });
      } catch (err) {
        console.error('Failed to update webview bounds:', err);
      }
    };

    if (isActive) {
      updateBounds();
    }

    const resizeObserver = new ResizeObserver(() => {
      if (isActive) {
        updateBounds();
      }
    });

    resizeObserver.observe(containerRef.current);

    // Also update on window move/resize
    const handleWindowChange = () => {
      if (isActive) {
        updateBounds();
      }
    };

    window.addEventListener('resize', handleWindowChange);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowChange);
    };
  }, [sessionId, isActive, state.webviewCreated, getContainerBounds]);

  // Show/hide webview based on active state
  useEffect(() => {
    if (!state.webviewCreated) return;

    const toggleVisibility = async () => {
      try {
        if (isActive) {
          await invoke('show_browser_webview', { sessionId });
          // Update bounds when showing
          const bounds = await getContainerBounds();
          if (bounds) {
            await invoke('update_browser_bounds', {
              sessionId,
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height,
            });
          }
        } else {
          await invoke('hide_browser_webview', { sessionId });
        }
      } catch (err) {
        console.error('Failed to toggle webview visibility:', err);
      }
    };

    toggleVisibility();
  }, [sessionId, isActive, state.webviewCreated, getContainerBounds]);

  // Listen for URL changes from the backend
  useEffect(() => {
    let unlistenUrl: UnlistenFn | undefined;
    let unlistenLoading: UnlistenFn | undefined;

    const setupListeners = async () => {
      unlistenUrl = await listen<BrowserUrlChangedEvent>('browser-url-changed', (event) => {
        if (event.payload.session_id === sessionId) {
          const newUrl = event.payload.url;
          console.log('URL changed:', newUrl, 'isNavigatingHistory:', isNavigatingHistory.current, 'historyIndex:', historyIndexRef.current);

          setState(prev => ({
            ...prev,
            url: newUrl,
            displayUrl: newUrl,
          }));

          // Only update history if NOT navigating via back/forward
          if (!isNavigatingHistory.current) {
            // Use ref for current index to avoid stale closure
            const currentIndex = historyIndexRef.current;

            setHistory(prevHistory => {
              // Truncate forward history and add new URL
              const newHistory = prevHistory.slice(0, currentIndex + 1);
              if (newHistory[newHistory.length - 1] !== newUrl) {
                newHistory.push(newUrl);
              }
              return newHistory;
            });
            setHistoryIndex(currentIndex + 1);
            historyIndexRef.current = currentIndex + 1;
          } else {
            // Reset the navigation flag
            isNavigatingHistory.current = false;
          }

          onUrlChange?.(newUrl);
        }
      });

      unlistenLoading = await listen<BrowserLoadingEvent>('browser-loading', (event) => {
        if (event.payload.session_id === sessionId) {
          setState(prev => ({
            ...prev,
            isLoading: event.payload.is_loading,
            error: null,
          }));
        }
      });
    };

    setupListeners();

    return () => {
      unlistenUrl?.();
      unlistenLoading?.();
    };
  }, [sessionId, onUrlChange]);

  // Cleanup webview on unmount
  useEffect(() => {
    return () => {
      if (state.webviewCreated) {
        invoke('close_browser_webview', { sessionId }).catch(err => {
          console.error('Failed to close webview:', err);
        });
      }
    };
  }, [sessionId, state.webviewCreated]);

  // Navigate to URL
  const navigate = useCallback(async (url: string) => {
    const formattedUrl = formatUrl(url);
    if (!formattedUrl) return;

    setState(prev => ({
      ...prev,
      url: formattedUrl,
      displayUrl: formattedUrl,
      isLoading: true,
      error: null,
    }));

    try {
      // If webview doesn't exist, create it with the URL
      if (!state.webviewCreated) {
        const bounds = await getContainerBounds();
        if (bounds) {
          await invoke('create_browser_webview', {
            sessionId,
            initialUrl: formattedUrl,
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          });
          setState(prev => ({ ...prev, webviewCreated: true }));
        }
      } else {
        // Navigate existing webview
        await invoke('browser_navigate', {
          sessionId,
          url: formattedUrl,
        });
      }
    } catch (err) {
      console.error('Navigation failed:', err);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: `Navigation failed: ${err}`,
      }));
    }
  }, [sessionId, state.webviewCreated, getContainerBounds]);

  // Handle URL input submit
  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (state.displayUrl.trim()) {
      navigate(state.displayUrl);
    }
  };

  // Handle URL input change
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setState(prev => ({ ...prev, displayUrl: e.target.value }));
  };

  // Go back in history
  const goBack = useCallback(async () => {
    if (historyIndex > 0) {
      try {
        isNavigatingHistory.current = true;
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        historyIndexRef.current = newIndex;
        await invoke('browser_go_back', { sessionId });
      } catch (err) {
        console.error('Failed to go back:', err);
        isNavigatingHistory.current = false;
      }
    }
  }, [sessionId, historyIndex]);

  // Go forward in history
  const goForward = useCallback(async () => {
    if (historyIndex < history.length - 1) {
      try {
        isNavigatingHistory.current = true;
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        historyIndexRef.current = newIndex;
        await invoke('browser_go_forward', { sessionId });
      } catch (err) {
        console.error('Failed to go forward:', err);
        isNavigatingHistory.current = false;
      }
    }
  }, [sessionId, historyIndex, history.length]);

  // Refresh page
  const refresh = useCallback(async () => {
    if (!state.url) return;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      await invoke('browser_reload', { sessionId });
    } catch (err) {
      console.error('Failed to reload:', err);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: `Reload failed: ${err}`,
      }));
    }
  }, [sessionId, state.url]);

  // Toggle favorite
  const toggleFavorite = useCallback(() => {
    setState(prev => ({ ...prev, isFavorite: !prev.isFavorite }));
  }, []);

  // Copy URL to clipboard
  const copyUrl = useCallback(() => {
    navigator.clipboard.writeText(state.url);
  }, [state.url]);

  // Open in external browser
  const openExternal = useCallback(() => {
    window.open(state.url, '_blank');
  }, [state.url]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        urlInputRef.current?.focus();
        urlInputRef.current?.select();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault();
        refresh();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, refresh]);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  return (
    <div
      className="flex flex-col h-full bg-background"
      style={{ display: isActive ? 'flex' : 'none' }}
    >
      {/* Navigation bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-card/30 border-b border-border">
        {/* Navigation buttons */}
        <div className="flex items-center gap-0.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={goBack}
                  disabled={!canGoBack}
                  className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card text-foreground">
                <p>Back</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={goForward}
                  disabled={!canGoForward}
                  className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card text-foreground">
                <p>Forward</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={refresh}
                  className="p-1.5 rounded hover:bg-accent transition-colors"
                >
                  {state.isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                  ) : (
                    <RotateCw className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card text-foreground">
                <p>Refresh (⌘R)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* URL bar */}
        <form onSubmit={handleUrlSubmit} className="flex-1 flex items-center">
          <div className="flex-1 flex items-center bg-background/50 rounded border border-border/50 px-2 py-1 gap-2">
            <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <input
              ref={urlInputRef}
              type="text"
              value={state.displayUrl}
              onChange={handleUrlChange}
              onFocus={(e) => e.target.select()}
              placeholder="Enter URL or search..."
              className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
            />
            {state.displayUrl && (
              <button
                type="button"
                onClick={() => setState(prev => ({ ...prev, displayUrl: '' }))}
                className="p-0.5 hover:bg-accent rounded"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </form>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleFavorite}
                  className="p-1.5 rounded hover:bg-accent transition-colors"
                >
                  <Star
                    className={`h-3.5 w-3.5 ${state.isFavorite ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card text-foreground">
                <p>{state.isFavorite ? 'Remove from favorites' : 'Add to favorites'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={copyUrl}
                  className="p-1.5 rounded hover:bg-accent transition-colors"
                >
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card text-foreground">
                <p>Copy URL</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={openExternal}
                  className="p-1.5 rounded hover:bg-accent transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card text-foreground">
                <p>Open in external browser</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Content area - the native webview is positioned over this */}
      <div ref={containerRef} className="flex-1 relative">
        {state.error ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-background">
            <Globe className="h-12 w-12 mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">Connection Failed</h3>
            <p className="text-sm text-center max-w-md mb-1">{state.error}</p>
            <button
              onClick={() => navigate(state.url)}
              className="mt-4 px-4 py-2 text-sm bg-accent hover:bg-accent/80 rounded transition-colors"
            >
              Retry
            </button>
          </div>
        ) : !state.webviewCreated && !state.url ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-background">
            <Globe className="h-16 w-16 mb-4 opacity-30" />
            <h3 className="text-lg font-medium mb-2">Enter a URL to get started</h3>
            <p className="text-sm text-muted-foreground/60 mb-4">
              Type a URL in the address bar above and press Enter
            </p>
          </div>
        ) : null}
        {/* The native WebviewWindow overlays this area */}
      </div>
    </div>
  );
};

export default BrowserTab;
