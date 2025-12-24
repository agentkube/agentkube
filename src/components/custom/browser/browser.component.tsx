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
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { openExternalUrl } from '@/api/external';

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
  const hasInitiatedNavigation = useRef(false); // Track if we've already initiated auto-navigation
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
  // Zoom level state (1.0 = 100%)
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 3.0;
  const ZOOM_STEP = 0.1;

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

  // Get container bounds for positioning the EMBEDDED webview
  // For embedded webviews, we need position relative to the main window, not the screen
  const getContainerBounds = useCallback(async () => {
    if (!containerRef.current) return null;

    const rect = containerRef.current.getBoundingClientRect();

    // For embedded webviews, the position is relative to the main window's content area
    // We just need the rect position within the window (no need for window.outerPosition)
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }, []);


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

    // Also update on window resize
    const handleWindowChange = () => {
      if (isActive) {
        updateBounds();
      }
    };

    window.addEventListener('resize', handleWindowChange);
    // Also listen for scroll events in case the container moves
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [sessionId, isActive, state.webviewCreated, getContainerBounds]);

  // Show/hide webview based on active state
  useEffect(() => {
    if (!state.webviewCreated) return;

    const toggleVisibility = async () => {
      try {
        if (isActive) {
          // Update bounds when showing (move back to correct position)
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
          await invoke('show_browser_webview', { sessionId });
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

          setState(prev => {
            // Skip if same URL (avoid duplicates)
            if (prev.url === newUrl) {
              return prev;
            }
            return {
              ...prev,
              url: newUrl,
              displayUrl: newUrl,
            };
          });

          // Only update history if NOT navigating via back/forward
          if (!isNavigatingHistory.current) {
            const currentIndex = historyIndexRef.current;

            setHistory(prevHistory => {
              // Check if we're at the current position and URL matches
              if (prevHistory[currentIndex] === newUrl) {
                return prevHistory;
              }

              // Truncate forward history and add new URL
              const newHistory = prevHistory.slice(0, currentIndex + 1);

              // Only add if different from last entry
              if (newHistory[newHistory.length - 1] !== newUrl) {
                newHistory.push(newUrl);

                // Update index for the new entry
                const newIndex = newHistory.length - 1;
                setHistoryIndex(newIndex);
                historyIndexRef.current = newIndex;
              }

              return newHistory;
            });
          } else {
            // Reset the navigation flag after back/forward
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

  // Auto-navigate to initialUrl when component mounts with a URL
  useEffect(() => {
    if (initialUrl && !hasInitiatedNavigation.current && !state.webviewCreated) {
      hasInitiatedNavigation.current = true;
      // Small delay to ensure the container is ready
      const timer = setTimeout(() => {
        navigate(initialUrl);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [initialUrl, state.webviewCreated, navigate]);

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
    openExternalUrl(state.url);
  }, [state.url]);

  // Zoom in
  const zoomIn = useCallback(async () => {
    if (!state.webviewCreated) return;
    const newZoom = Math.min(zoomLevel + ZOOM_STEP, MAX_ZOOM);
    setZoomLevel(newZoom);
    try {
      await invoke('browser_set_zoom', { sessionId, zoomLevel: newZoom });
    } catch (err) {
      console.error('Failed to zoom in:', err);
    }
  }, [sessionId, state.webviewCreated, zoomLevel]);

  // Zoom out
  const zoomOut = useCallback(async () => {
    if (!state.webviewCreated) return;
    const newZoom = Math.max(zoomLevel - ZOOM_STEP, MIN_ZOOM);
    setZoomLevel(newZoom);
    try {
      await invoke('browser_set_zoom', { sessionId, zoomLevel: newZoom });
    } catch (err) {
      console.error('Failed to zoom out:', err);
    }
  }, [sessionId, state.webviewCreated, zoomLevel]);

  // Reset zoom to 100%
  const resetZoom = useCallback(async () => {
    if (!state.webviewCreated) return;
    setZoomLevel(1.0);
    try {
      await invoke('browser_set_zoom', { sessionId, zoomLevel: 1.0 });
    } catch (err) {
      console.error('Failed to reset zoom:', err);
    }
  }, [sessionId, state.webviewCreated]);

  // Restart browser - close and recreate the webview
  const restartBrowser = useCallback(async () => {
    const urlToRestore = state.url || state.displayUrl;

    // First, try to close existing webview
    if (state.webviewCreated) {
      try {
        await invoke('close_browser_webview', { sessionId });
      } catch {
        // Ignore close errors - webview might already be gone
      }
    }

    // Reset state
    setState(prev => ({
      ...prev,
      webviewCreated: false,
      isLoading: true,
      error: null,
    }));

    // Wait a bit for cleanup
    await new Promise(resolve => setTimeout(resolve, 100));

    // Recreate webview if we have a URL
    if (urlToRestore) {
      try {
        const bounds = await getContainerBounds();
        if (bounds) {
          await invoke('create_browser_webview', {
            sessionId,
            initialUrl: urlToRestore,
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          });
          setState(prev => ({
            ...prev,
            webviewCreated: true,
            url: urlToRestore,
            displayUrl: urlToRestore,
            error: null,
          }));
        }
      } catch (err) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: `Failed to restart browser: ${err}`,
        }));
      }
    } else {
      setState(prev => ({
        ...prev,
        isLoading: false,
      }));
    }
  }, [sessionId, state.url, state.displayUrl, state.webviewCreated, getContainerBounds]);

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

      // Zoom in: Cmd/Ctrl + Plus or Cmd/Ctrl + =
      if ((e.metaKey || e.ctrlKey) && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        zoomIn();
      }

      // Zoom out: Cmd/Ctrl + Minus
      if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault();
        zoomOut();
      }

      // Reset zoom: Cmd/Ctrl + 0
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, refresh, zoomIn, zoomOut, resetZoom]);

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

          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 mx-1 px-1 border-x border-border/50">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={zoomOut}
                    disabled={zoomLevel <= MIN_ZOOM}
                    className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-card text-foreground">
                  <p>Zoom out (⌘-)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={resetZoom}
                    className="px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent rounded transition-colors min-w-[40px] text-center"
                  >
                    {Math.round(zoomLevel * 100)}%
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-card text-foreground">
                  <p>Reset zoom (⌘0)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={zoomIn}
                    disabled={zoomLevel >= MAX_ZOOM}
                    className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-card text-foreground">
                  <p>Zoom in (⌘+)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

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

      {/* Content area - the embedded webview is positioned over this */}
      <div ref={containerRef} className="flex-1 relative" style={{ zIndex: 0 }}>
        {state.error ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-background">
            <Globe className="h-12 w-12 mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">Connection Failed</h3>
            <p className="text-sm text-center max-w-md mb-4">{state.error}</p>
            <div className="flex gap-3">
              <button
                onClick={() => navigate(state.url)}
                className="px-4 py-2 text-sm bg-accent hover:bg-accent/80 rounded transition-colors"
              >
                Retry
              </button>
              <button
                onClick={restartBrowser}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors"
              >
                Restart Browser
              </button>
            </div>
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
        {/* The embedded native Webview is rendered over this area by Tauri */}
      </div>
    </div>
  );
};

export default BrowserTab;
