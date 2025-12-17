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

export interface BrowserTabProps {
  sessionId: string;
  isActive: boolean;
  initialUrl?: string;
  onClose?: () => void;
}

interface BrowserState {
  url: string;
  displayUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  isFavorite: boolean;
  error: string | null;
}

const BrowserTab: React.FC<BrowserTabProps> = ({
  sessionId,
  isActive,
  initialUrl,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<BrowserState>({
    url: initialUrl || '',
    displayUrl: initialUrl || '',
    canGoBack: false,
    canGoForward: false,
    isLoading: !!initialUrl,
    isFavorite: false,
    error: null,
  });
  const [history, setHistory] = useState<string[]>(initialUrl ? [initialUrl] : []);
  const [historyIndex, setHistoryIndex] = useState(initialUrl ? 0 : -1);

  // Format URL with protocol if missing
  const formatUrl = (input: string): string => {
    let url = input.trim();
    if (!url) return '';

    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // Check if it looks like a URL or a search query
      if (url.includes('.') || url.startsWith('localhost')) {
        url = `https://${url}`;
      } else {
        // Treat as search query
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      }
    }

    return url;
  };

  // Navigate to URL
  const navigate = useCallback((url: string, addToHistory = true) => {
    const formattedUrl = formatUrl(url);
    if (!formattedUrl) return;

    setState(prev => ({
      ...prev,
      url: formattedUrl,
      displayUrl: formattedUrl,
      isLoading: true,
      error: null,
    }));

    if (addToHistory) {
      setHistory(prev => {
        // If historyIndex is -1 (no history), start fresh
        const sliceIndex = historyIndex < 0 ? 0 : historyIndex + 1;
        const newHistory = prev.slice(0, sliceIndex);
        newHistory.push(formattedUrl);
        return newHistory;
      });
      setHistoryIndex(prev => prev + 1);
    }
  }, [historyIndex]);

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
  const goBack = useCallback(() => {
    if (historyIndex > 0 && history.length > 1) {
      const newIndex = historyIndex - 1;
      const targetUrl = history[newIndex];
      setHistoryIndex(newIndex);
      setState(prev => ({
        ...prev,
        url: targetUrl,
        displayUrl: targetUrl,
        isLoading: true,
        error: null,
      }));
    }
  }, [historyIndex, history]);

  // Go forward in history
  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const targetUrl = history[newIndex];
      setHistoryIndex(newIndex);
      setState(prev => ({
        ...prev,
        url: targetUrl,
        displayUrl: targetUrl,
        isLoading: true,
        error: null,
      }));
    }
  }, [historyIndex, history]);

  // Refresh page
  const refresh = useCallback(() => {
    if (iframeRef.current && state.url) {
      setState(prev => ({ ...prev, isLoading: true }));
      iframeRef.current.src = state.url;
    }
  }, [state.url]);

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

  // Handle iframe load
  const handleIframeLoad = () => {
    setState(prev => ({ ...prev, isLoading: false, error: null }));
  };

  // Handle iframe error
  const handleIframeError = () => {
    setState(prev => ({
      ...prev,
      isLoading: false,
      error: 'Failed to load page. The website may be blocking embedded access.',
    }));
  };

  // Update navigation state
  useEffect(() => {
    setState(prev => ({
      ...prev,
      canGoBack: historyIndex > 0,
      canGoForward: historyIndex < history.length - 1,
    }));
  }, [historyIndex, history.length]);

  // Focus URL input when pressing Cmd/Ctrl + L
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
                  disabled={!state.canGoBack}
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
                  disabled={!state.canGoForward}
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

      {/* Content area */}
      <div className="flex-1 relative">
        {state.error ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Globe className="h-12 w-12 mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">Connection Failed</h3>
            <p className="text-sm text-center max-w-md mb-1">
              {state.error}
            </p>
            <p className="text-xs text-muted-foreground/60 mb-4">
              ERR_CONNECTION_REFUSED · <button className="hover:underline">Show Details</button>
            </p>
            <button
              onClick={refresh}
              className="px-4 py-2 text-sm bg-accent hover:bg-accent/80 rounded transition-colors"
            >
              Restart Browser
            </button>
          </div>
        ) : !state.url ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Globe className="h-16 w-16 mb-4 opacity-30" />
            <h3 className="text-lg font-medium mb-2">Enter a URL to get started</h3>
            <p className="text-sm text-muted-foreground/60 mb-4">
              Type a URL in the address bar above and press Enter
            </p>
          </div>
        ) : (
          <>
            {state.isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={state.url}
              className="w-full h-full border-none bg-white"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              title={`Browser - ${sessionId}`}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default BrowserTab;
