
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useCluster } from '@/contexts/clusterContext';
import { kubeProxyRequest } from '@/api/cluster';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, RotateCw, Download, Filter, Clock, Copy, Check, Terminal, ExternalLink, ChevronDown, ChevronRight, Eye, ZoomIn, ZoomOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface LogEntry {
  timestamp: string;
  line: string;
  labels: Record<string, string>;
  id: string;
}

interface LoggingConfig {
  namespace: string;
  service: string;
  port: number;
}

interface LoggingSettings {
  showTime: boolean;
  showUniqueLabels: boolean;
  wrapLines: boolean;
  prettifyJson: boolean;
  deduplication: 'None' | 'Exact' | 'Numbers' | 'Signature';
}

// Color palettes for syntax highlighting
const COLORS = {
  timestamp: "text-emerald-500/80",
  ip: "text-cyan-400 decoration-cyan-400/30 underline decoration-dotted underline-offset-4 cursor-pointer",
  string: "text-amber-300",
  number: "text-violet-400",
  boolean: "text-rose-400",
  key: "text-sky-300",
  method: "text-fuchsia-400 font-bold",
  statusSuccess: "text-emerald-400 font-bold",
  statusError: "text-rose-500 font-bold",
  bracket: "text-muted-foreground",
  keyword: "text-orange-400"
};

const PATTERNS = {
  ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  method: /\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/g,
  status: /\b([2-5]\d{2})\b/g,
  keyValue: /([\w\-_]+)=/g,
  quoted: /"([^"]+)"/g,
  severity: /\b(INFO|WARN|WARNING|ERROR|ERR|FATAL|DEBUG|TRACE)\b/i,
  k8sSeverity: /^[IWEF]\d{4}/
};

const detectLevel = (line: string): 'info' | 'warn' | 'error' | 'debug' | 'success' | 'unknown' => {
  if (line.match(/\b(ERROR|ERR|FATAL|CRITICAL)\b/) || line.match(/^[EF]\d{4}/)) return 'error';
  if (line.match(/\b(WARN|WARNING)\b/) || line.match(/^[W]\d{4}/)) return 'warn';
  if (line.match(/\b(INFO)\b/) || line.match(/^[I]\d{4}/)) return 'info';
  if (line.match(/\b(DEBUG|TRACE)\b/)) return 'debug';
  if (line.match(/\b(SUCCESS)\b/)) return 'success';
  return 'unknown';
};

const HighlightedText = ({ text, wrapLines }: { text: string, wrapLines: boolean }) => {
  // Check if the whole text is JSON
  const tryJson = useMemo(() => {
    try {
      if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
        return JSON.parse(text);
      }
    } catch (e) { return null; }
    // Try to find JSON object inside text
    const jsonMatch = text.match(/(\{.*\})/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1]); } catch (e) { }
    }
    return null;
  }, [text]);

  // If prettify is on, we prefer plain text if it's not JSON, handled in parent

  const parts = text.split(/(\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:GET|POST|PUT|DELETE|PATCH)\b|\b[2-5]\d{2}\b|"[^"]*"|[\w\-_]+=)/g);

  return (
    <span className={cn("break-all whitespace-pre-wrap", !wrapLines && "whitespace-nowrap")}>
      {parts.map((part, i) => {
        if (part.match(PATTERNS.ip)) return <span key={i} className={COLORS.ip}>{part}</span>;
        if (part.match(PATTERNS.method)) return <span key={i} className={COLORS.method}>{part}</span>;
        if (part.match(PATTERNS.status)) {
          const status = parseInt(part);
          const color = status >= 500 ? COLORS.statusError : status >= 400 ? COLORS.keyword : status >= 200 ? COLORS.statusSuccess : "";
          return <span key={i} className={color}>{part}</span>;
        }
        if (part.match(PATTERNS.quoted)) return <span key={i} className={COLORS.string}>{part}</span>;
        if (part.match(PATTERNS.keyValue)) return <span key={i} className={COLORS.key}>{part}</span>;
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
};

// Recursive JSON Viewer
const JsonViewer = ({ data, level = 0 }: { data: any, level?: number }) => {
  if (typeof data !== 'object' || data === null) {
    if (typeof data === 'string') return <span className={COLORS.string}>"{data}"</span>;
    if (typeof data === 'number') return <span className={COLORS.number}>{data}</span>;
    if (typeof data === 'boolean') return <span className={COLORS.boolean}>{data.toString()}</span>;
    return <span>{String(data)}</span>;
  }

  const isArray = Array.isArray(data);
  const isEmpty = Object.keys(data).length === 0;

  if (isEmpty) return <span className={COLORS.bracket}>{isArray ? '[]' : '{}'}</span>;

  return (
    <span className="font-mono">
      <span className={COLORS.bracket}>{isArray ? '[' : '{'}</span>
      <div style={{ paddingLeft: '1.2rem' }}>
        {Object.entries(data).map(([key, value], i, arr) => (
          <div key={key}>
            {!isArray && <span className={COLORS.key}>"{key}"</span>}
            {!isArray && <span className={COLORS.bracket}>: </span>}
            <JsonViewer data={value} level={level + 1} />
            {i < arr.length - 1 && <span className={COLORS.bracket}>,</span>}
          </div>
        ))}
      </div>
      <span className={COLORS.bracket}>{isArray ? ']' : '}'}</span>
    </span>
  );
};

const LogRow = ({ log, settings }: { log: LogEntry, settings: LoggingSettings }) => {
  const [expanded, setExpanded] = useState(false);
  const level = detectLevel(log.line);

  // Try extract JSON
  const extractedJson = useMemo(() => {
    try {
      const jsonMatch = log.line.match(/(\{.*\})/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      if (log.line.trim().startsWith('{')) return JSON.parse(log.line);
    } catch (e) { }
    return null;
  }, [log.line]);


  const styles = {
    error: 'border-l-rose-500 bg-rose-500/5 hover:bg-rose-500/10',
    warn: 'border-l-orange-500 bg-orange-500/5 hover:bg-orange-500/10',
    info: 'border-l-blue-500/50 bg-blue-500/5 hover:bg-blue-500/10',
    debug: 'border-l-indigo-500/50 hover:bg-muted/50',
    success: 'border-l-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10',
    unknown: 'border-l-transparent hover:bg-muted/50'
  };

  const levelBadges = {
    error: <Badge variant="destructive" className="h-4 px-1 text-[10px] uppercase">Error</Badge>,
    warn: <Badge variant="outline" className="h-4 px-1 text-[10px] text-orange-400 border-orange-400/30 bg-orange-400/10 uppercase">Warn</Badge>,
    info: <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 uppercase">Info</Badge>,
    success: <Badge variant="outline" className="h-4 px-1 text-[10px] text-emerald-400 border-emerald-400/30 bg-emerald-400/10 uppercase">OK</Badge>,
    debug: <Badge variant="outline" className="h-4 px-1 text-[10px] uppercase">Debug</Badge>,
    unknown: null
  };

  return (
    <div className={cn(
      "group flex flex-col my-0.5 font-mono text-xs border-b border-border/10 last:border-0 transition-colors border-l-2",
      styles[level]
    )}>
      {/* Header Info Row */}
      <div className="flex items-start px-2 py-1.5 gap-3 w-full">
        <Button variant="ghost" size="icon" className="h-5 w-5 rounded-sm flex-shrink-0 mt-0.5 opacity-50 hover:opacity-100" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </Button>

        {/* Timestamp & Level */}
        {settings.showTime && (
          <div className="flex flex-col gap-1.5 w-32 flex-shrink-0">
            <div className={cn("select-none text-[11px] opacity-60", COLORS.timestamp)}>
              {log.timestamp.split('T')[1].replace('Z', '')}
            </div>
            <div className="flex">
              {levelBadges[level]}
            </div>
          </div>
        )}

        {/* Content Preview */}
        <div className="flex-1 min-w-0 pr-2">
          {!expanded ? (
            <div className={cn("opacity-90 cursor-pointer overflow-hidden", !settings.wrapLines && "truncate")} onClick={() => setExpanded(true)}>
              {settings.prettifyJson && extractedJson ? (
                <div className="bg-black/20 p-2 rounded border border-white/5 overflow-x-auto"><JsonViewer data={extractedJson} /></div>
              ) : (
                <HighlightedText text={log.line} wrapLines={settings.wrapLines} />
              )}
            </div>
          ) : (
            <div className="w-full">
              {settings.prettifyJson && extractedJson ? (
                <div className="bg-black/20 p-2 rounded border border-white/5 overflow-x-auto"><JsonViewer data={extractedJson} /></div>
              ) : (
                <HighlightedText text={log.line} wrapLines={settings.wrapLines} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expanded Details Panel (Table View) */}
      {expanded && (
        <div className="px-10 pb-4 text-[11px] space-y-4 animate-in fade-in zoom-in-95 duration-200">

          <div className="border border-white/10 rounded-md bg-black/20 overflow-hidden">
            <div className="px-3 py-2 bg-white/5 border-b border-white/10 font-medium text-muted-foreground flex items-center">
              Fields
            </div>
            <div className="divide-y divide-white/5">
              {/* Fields from Labels */}
              {Object.entries(log.labels).map(([key, value]) => (
                <div key={key} className="flex items-center hover:bg-white/5 transition-colors group/row">
                  <div className="w-10 flex-shrink-0 flex justify-center opacity-0 group-hover/row:opacity-100 transition-opacity gap-1 px-2">
                    <ZoomIn className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-foreground" />
                    <ZoomOut className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-foreground" />
                  </div>
                  <div className="w-48 flex-shrink-0 py-2 px-3 border-r border-white/5 text-sky-300/90 font-medium truncate" title={key}>
                    {key}
                  </div>
                  <div className="flex-1 py-2 px-3 text-slate-300 break-all">
                    {value}
                  </div>
                  <div className="w-8 flex-shrink-0 flex justify-center opacity-0 group-hover/row:opacity-100">
                    <Copy className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => navigator.clipboard.writeText(value)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const LoggingPage = () => {
  const { currentContext } = useCluster();
  const { toast } = useToast();

  // State
  const [query, setQuery] = useState<string>('{container="kube-apiserver"}');
  const [limit, setLimit] = useState<number>(100);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [displayedLogs, setDisplayedLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [stats, setStats] = useState<any>(null);

  // Toolbar Settings
  const [settings, setSettings] = useState<LoggingSettings>({
    showTime: true,
    showUniqueLabels: false,
    wrapLines: true,
    prettifyJson: true,
    deduplication: 'None'
  });

  const [config, setConfig] = useState<LoggingConfig>({
    namespace: 'monitoring',
    service: 'loki',
    port: 3100
  });

  // Settings Handlers
  const toggleSetting = (key: keyof LoggingSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const setDeduplication = (mode: LoggingSettings['deduplication']) => {
    setSettings(prev => ({ ...prev, deduplication: mode }));
  };

  // Deduplication helper functions (Grafana Explore style)
  const normalizeForNumbers = (line: string): string => {
    // Strip all numbers (digits) from the line
    return line.replace(/\d+/g, '');
  };

  const normalizeForSignature = (line: string): string => {
    // Strip all letters and numbers, keeping only whitespace and punctuation
    return line.replace(/[a-zA-Z0-9]/g, '');
  };

  // Deduplication logic (client-side)
  useEffect(() => {
    if (settings.deduplication === 'None') {
      setDisplayedLogs(logs);
    } else if (settings.deduplication === 'Exact') {
      // Dedup by exact content line (excluding timestamp which is already separate)
      const seen = new Set<string>();
      const deduped = logs.filter(log => {
        const key = log.line;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setDisplayedLogs(deduped);
    } else if (settings.deduplication === 'Numbers') {
      // Strip numbers before matching - identifies patterns where only numeric values differ
      const seen = new Set<string>();
      const deduped = logs.filter(log => {
        const key = normalizeForNumbers(log.line);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setDisplayedLogs(deduped);
    } else if (settings.deduplication === 'Signature') {
      // Most aggressive: strip all alphanumerics, match only on punctuation and whitespace structure
      const seen = new Set<string>();
      const deduped = logs.filter(log => {
        const key = normalizeForSignature(log.line);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setDisplayedLogs(deduped);
    } else {
      setDisplayedLogs(logs);
    }
  }, [logs, settings.deduplication]);


  const parseLokiResponse = (data: any): LogEntry[] => {
    if (data.status !== 'success' || !data.data || !data.data.result) {
      return [];
    }

    const entries: LogEntry[] = [];

    data.data.result.forEach((stream: any) => {
      const labels = stream.stream;
      stream.values.forEach((value: [string, string], index: number) => {
        const timestampNano = value[0];
        const timestampMs = parseInt(timestampNano.substring(0, 13));

        entries.push({
          timestamp: new Date(timestampMs).toISOString(),
          line: value[1],
          labels,
          id: `${timestampNano}-${index}`
        });
      });
    });

    return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  };

  const fetchLogs = useCallback(async () => {
    if (!currentContext) return;

    setLoading(true);
    try {
      const proxyPath = `api/v1/namespaces/${config.namespace}/services/${config.service}:${config.port}/proxy/loki/api/v1/query_range`;

      const params = new URLSearchParams({
        query: query,
        limit: limit.toString(),
      });

      const response = await kubeProxyRequest(
        currentContext.name,
        `${proxyPath}?${params.toString()}`,
        'GET'
      );

      if (response && response.status === 'success') {
        const parsedLogs = parseLokiResponse(response);
        setLogs(parsedLogs);
        if (response.data?.stats) setStats(response.data.stats);
      } else {
        toast({ title: "No logs found", description: "Query returned no results or invalid format." });
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      toast({ title: "Error", description: "Failed to fetch logs", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [currentContext, config, query, limit, toast]);

  // Initial fetch
  useEffect(() => {
    if (currentContext) fetchLogs();
  }, [currentContext]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      fetchLogs();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] p-4 lg:p-6 space-y-4 max-w-[100vw] overflow-hidden">
      {/* Top Header & Query */}
      <div className="flex flex-col gap-4">
        {/* ... (Title and Query Input same as before, simplified for brevity in thought, strictly maintained in code) */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Terminal className="h-6 w-6 text-muted-foreground" />
            Logs Explorer
          </h1>
          <div className="flex items-center space-x-2">
            <Button onClick={fetchLogs} disabled={loading} className="bg-primary hover:bg-primary/90">
              <RotateCw className={cn("mr-2 h-4 w-4", loading ? "animate-spin" : "")} />
              Run Query
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full">
          <div className="relative flex-1 group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground/50 group-focus-within:text-foreground transition-colors">
              <span className="font-mono text-xs font-bold bg-muted/50 px-1.5 py-0.5 rounded">LogQL</span>
            </div>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-20 font-mono text-sm bg-background border-border/40 hover:border-border/80 focus-visible:ring-1 focus-visible:ring-offset-0 h-10"
              placeholder='{container="kube-apiserver"}'
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 border-border/40 text-muted-foreground">
                <Clock className="mr-2 h-4 w-4" />
                {limit} lines
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {[50, 100, 250, 500, 1000].map((l) => (
                <DropdownMenuItem key={l} onClick={() => setLimit(l)}>
                  {l} lines {limit === l && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Toolbar Controls */}
      <div className="flex flex-wrap items-center gap-6 p-2 bg-card rounded-md border border-border/40 text-xs select-none">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Time</span>
          <Switch checked={settings.showTime} onCheckedChange={() => toggleSetting('showTime')} className="scale-75 origin-left" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Unique labels</span>
          <Switch checked={settings.showUniqueLabels} onCheckedChange={() => toggleSetting('showUniqueLabels')} className="scale-75 origin-left" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Wrap lines</span>
          <Switch checked={settings.wrapLines} onCheckedChange={() => toggleSetting('wrapLines')} className="scale-75 origin-left" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Prettify JSON</span>
          <Switch checked={settings.prettifyJson} onCheckedChange={() => toggleSetting('prettifyJson')} className="scale-75 origin-left" />
        </div>

        <div className="h-4 w-px bg-white/10 mx-2" />

        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">Deduplication</span>
          <div className="flex items-center bg-black/40 rounded-md p-0.5 border border-white/5">
            {(['None', 'Exact', 'Numbers', 'Signature'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setDeduplication(mode)}
                className={cn(
                  "px-3 py-1 rounded-sm transition-all",
                  settings.deduplication === mode
                    ? "bg-white/10 text-white font-medium"
                    : "text-muted-foreground hover:text-white/80 hover:bg-white/5"
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Log Window */}
      <div className="flex-1 rounded-xl border border-border/40 bg-[#0c0c0c] text-slate-300 shadow-inner overflow-hidden flex flex-col relative">
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/5 backdrop-blur-sm text-[10px] font-medium text-muted-foreground uppercase tracking-wider select-none">
          <div className="flex items-center gap-6">
            {settings.showTime && <span>Timestamp</span>}
            <span>Message</span>
          </div>

          {stats && (
            <div className="flex items-center gap-4 opacity-70">
              <span title="Deduplication Count">Dedup: {logs.length - displayedLogs.length}</span>
              <span title="Process Time">{stats.summary?.execTime?.toFixed(3)}s</span>
              <span title="Data Size">{Math.round((stats.summary?.totalBytesProcessed || 0) / 1024)} KB</span>
              <span title="Lines">{stats.summary?.totalLinesProcessed || 0} Lines</span>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 h-full">
          <div className="flex flex-col min-w-full pb-4">
            {displayedLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground opacity-50">
                {loading ? <Terminal className="h-12 w-12 mb-4 animate-pulse opacity-20" /> : <Search className="h-12 w-12 mb-4" />}
                <p>{loading ? "Fetching logs..." : "No log entries found."}</p>
              </div>
            ) : (
              displayedLogs.map((log) => (
                <LogRow key={log.id} log={log} settings={settings} />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default LoggingPage;
