import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useCluster } from '@/contexts/clusterContext';
import { kubeProxyRequest } from '@/api/cluster';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, RotateCw, Copy, Check, ChevronDown, ChevronRight, ZoomIn, ZoomOut, ScrollText, Play, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TimeRangePicker, TimeRange, getDefaultTimeRange } from './time-range-picker';

export interface LoggingTabProps {
  sessionId: string;
  isActive: boolean;
  initialQuery?: string;
  onClose?: () => void;
}

interface LogEntry {
  timestamp: string;
  line: string;
  labels: Record<string, string>;
  id: string;
  duplicates?: number; // Count of successive duplicate lines (Grafana-style)
}

interface LoggingConfig {
  namespace: string;
  service: string; // Format: service-name:port (e.g., loki:3100)
}

interface LoggingSettings {
  showTime: boolean;
  showUniqueLabels: boolean;
  wrapLines: boolean;
  prettifyJson: boolean;
  showBgColors: boolean;
  deduplication: 'None' | 'Exact' | 'Numbers' | 'Signature';
}

// Color palettes for syntax highlighting
const COLORS = {
  timestamp: "text-foreground/80",
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

// Field row component for expanded log view with copy feedback
const FieldRow = ({ fieldKey, fieldValue }: { fieldKey: string, fieldValue: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(fieldValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center hover:bg-white/5 transition-colors group/row">
      <div className="w-10 flex-shrink-0 flex justify-center opacity-0 group-hover/row:opacity-100 transition-opacity gap-1 px-2">
        <ZoomIn className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-foreground" />
        <ZoomOut className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-foreground" />
      </div>
      <div className="w-48 flex-shrink-0 py-2 px-3 border-r border-white/5 text-sky-300/90 font-medium truncate" title={fieldKey}>
        {fieldKey}
      </div>
      <div className="flex-1 py-2 px-3 text-slate-300 break-all">
        {fieldValue}
      </div>
      <div className="w-8 flex-shrink-0 flex justify-center opacity-0 group-hover/row:opacity-100 transition-opacity">
        <button onClick={handleCopy} className="p-0.5 rounded hover:bg-white/10">
          {copied ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-foreground" />
          )}
        </button>
      </div>
    </div>
  );
};

const LogRow = ({ log, settings }: { log: LogEntry, settings: LoggingSettings }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const level = detectLevel(log.line);

  const handleCopyLogLine = () => {
    navigator.clipboard.writeText(log.line);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const extractedJson = useMemo(() => {
    try {
      const jsonMatch = log.line.match(/(\{.*\})/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      if (log.line.trim().startsWith('{')) return JSON.parse(log.line);
    } catch (e) { }
    return null;
  }, [log.line]);

  // Styles with conditional background - border always shown, bg optional
  const borderStyles = {
    error: 'border-l-rose-500',
    warn: 'border-l-orange-500',
    info: 'border-l-blue-500/50',
    debug: 'border-l-indigo-500/50',
    success: 'border-l-emerald-500',
    unknown: 'border-l-transparent'
  };

  const bgStyles = {
    error: 'bg-rose-500/5 hover:bg-rose-500/10',
    warn: 'bg-orange-500/5 hover:bg-orange-500/10',
    info: 'bg-blue-500/5 hover:bg-blue-500/10',
    debug: 'hover:bg-muted/50',
    success: 'bg-emerald-500/5 hover:bg-emerald-500/10',
    unknown: 'hover:bg-muted/50'
  };

  const levelBadges = {
    error: <Badge variant="destructive" className="h-4 px-1 text-[10px] uppercase text-red-300">Error</Badge>,
    warn: <Badge variant="outline" className="h-4 px-1 text-[10px] text-orange-400 border-orange-400/30 bg-orange-400/10 uppercase">Warn</Badge>,
    info: <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 uppercase">Info</Badge>,
    success: <Badge variant="outline" className="h-4 px-1 text-[10px] text-emerald-400 border-emerald-400/30 bg-emerald-400/10 uppercase">OK</Badge>,
    debug: <Badge variant="outline" className="h-4 px-1 text-[10px] uppercase">Debug</Badge>,
    unknown: null
  };

  return (
    <div className={cn(
      "group flex flex-col my-0.5 font-mono text-xs border-b border-border/10 last:border-0 transition-colors border-l-4 hover:bg-white/5",
      borderStyles[level],
      settings.showBgColors && bgStyles[level]
    )}>
      <div className="flex items-center px-2 py-1.5 gap-2 w-full">
        <Button variant="ghost" size="icon" className="h-5 w-5 rounded-sm flex-shrink-0 opacity-50 hover:opacity-100" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </Button>

        {/* Timestamp Column */}
        {settings.showTime && (
          <div className={cn("select-none text-[11px] w-24 flex-shrink-0 tabular-nums", COLORS.timestamp)}>
            {log.timestamp.split('T')[1]?.replace('Z', '').substring(0, 12)}
          </div>
        )}

        {/* Log Type Column */}
        <div className="flex items-center gap-1 w-20 flex-shrink-0">
          {levelBadges[level]}
          {/* Grafana-style duplicate count badge */}
          {log.duplicates && log.duplicates > 0 && (
            <Badge
              variant="outline"
              className="h-4 px-1 text-[10px] bg-yellow-500/10 text-yellow-400 border-yellow-400/30"
              title={`${log.duplicates} successive duplicate${log.duplicates > 1 ? 's' : ''} hidden`}
            >
              {log.duplicates}x
            </Badge>
          )}
        </div>

        {/* Body Column */}
        <div className="flex-1 min-w-0">
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

        {/* Copy log line button */}
        <button
          onClick={handleCopyLogLine}
          className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
          title="Copy log line"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="px-10 pb-4 text-[11px] space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="border border-white/10 rounded-md bg-black/20 overflow-hidden">
            <div className="px-3 py-2 bg-white/5 border-b border-white/10 font-medium text-muted-foreground flex items-center">
              Fields
            </div>
            <div className="divide-y divide-white/5">
              {Object.entries(log.labels).map(([key, value]) => (
                <FieldRow key={key} fieldKey={key} fieldValue={value} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const LoggingTab: React.FC<LoggingTabProps> = ({
  sessionId,
  isActive,
  initialQuery,
}) => {
  const { currentContext } = useCluster();

  // State
  const [query, setQuery] = useState<string>(initialQuery || '');
  const [limit, setLimit] = useState<number>(50);
  const [timeRange, setTimeRange] = useState<TimeRange>(getDefaultTimeRange());
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
    showBgColors: false,
    deduplication: 'None'
  });

  // Loki Configuration - stored in localStorage per cluster
  const DEFAULT_LOKI_CONFIG: LoggingConfig = {
    namespace: 'monitoring',
    service: 'loki:3100'
  };

  const [config, setConfig] = useState<LoggingConfig>(DEFAULT_LOKI_CONFIG);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [tempConfig, setTempConfig] = useState<LoggingConfig>(DEFAULT_LOKI_CONFIG);

  // Load Loki config from localStorage
  useEffect(() => {
    if (!currentContext) return;
    try {
      const savedConfig = localStorage.getItem(`${currentContext.name}.lokiConfig`);
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        setConfig(parsedConfig);
        setTempConfig(parsedConfig);
      } else {
        setConfig(DEFAULT_LOKI_CONFIG);
        setTempConfig(DEFAULT_LOKI_CONFIG);
      }
    } catch (err) {
      console.error('Error loading Loki config:', err);
    }
  }, [currentContext]);

  const handleSaveConfig = () => {
    if (!currentContext) return;
    try {
      localStorage.setItem(`${currentContext.name}.lokiConfig`, JSON.stringify(tempConfig));
      setConfig(tempConfig);
      setIsConfigOpen(false);
      toast.success('Loki configuration saved');
    } catch (err) {
      console.error('Error saving Loki config:', err);
      toast.error('Failed to save configuration');
    }
  };

  // Settings Handlers
  const toggleSetting = (key: keyof LoggingSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const setDeduplication = (mode: LoggingSettings['deduplication']) => {
    setSettings(prev => ({ ...prev, deduplication: mode }));
  };

  // Deduplication helper functions (Grafana-style)
  // Exact: Remove ISO datetimes to compare log content without timestamps
  const normalizeForExact = (line: string): string => {
    // Remove ISO 8601 datetime patterns (e.g., 2026-01-25T13:09:12+05:30, 2026-01-25 13:09:12.123Z)
    return line
      .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '')
      // Also remove common log timestamp formats
      .replace(/\d{2}:\d{2}:\d{2}(?:\.\d+)?/g, '')
      .replace(/\d{4}\/\d{2}\/\d{2}/g, '')
      .replace(/\d{2}\/\d{2}\/\d{4}/g, '');
  };

  // Numbers: Strip all numbers (durations, IPs, latencies, etc.)
  const normalizeForNumbers = (line: string): string => {
    return line.replace(/\d+/g, '');
  };

  // Signature: Strip all letters and numbers, keep only punctuation and whitespace
  const normalizeForSignature = (line: string): string => {
    return line.replace(/[a-zA-Z0-9]/g, '');
  };

  // Get normalization function based on strategy
  const getNormalizer = (strategy: LoggingSettings['deduplication']) => {
    switch (strategy) {
      case 'Exact':
        return normalizeForExact;
      case 'Numbers':
        return normalizeForNumbers;
      case 'Signature':
        return normalizeForSignature;
      default:
        return (line: string) => line;
    }
  };

  // Grafana-style SUCCESSIVE deduplication logic
  // This deduplicates consecutive/successive lines that match, not ALL matching lines
  useEffect(() => {
    if (settings.deduplication === 'None') {
      // Show all logs without duplicate counts
      setDisplayedLogs(logs);
    } else {
      const normalize = getNormalizer(settings.deduplication);
      const deduped: LogEntry[] = [];

      logs.forEach((log, index) => {
        const normalizedLine = normalize(log.line);

        if (index === 0) {
          // First log is always added
          deduped.push({ ...log });
        } else {
          // Compare with the PREVIOUS log (successive deduplication)
          const previousLog = deduped[deduped.length - 1];
          const previousNormalized = normalize(previousLog.line);

          if (normalizedLine === previousNormalized) {
            // Increment duplicate count on the previous entry
            previousLog.duplicates = (previousLog.duplicates || 0) + 1;
          } else {
            // Different log, add it (no duplicates count set)
            deduped.push({ ...log });
          }
        }
      });

      setDisplayedLogs(deduped);
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
      const proxyPath = `api/v1/namespaces/${config.namespace}/services/${config.service}/proxy/loki/api/v1/query_range`;

      // Convert time range to nanoseconds for Loki
      const startNs = timeRange.from.getTime() * 1000000;
      const endNs = timeRange.to.getTime() * 1000000;

      const params = new URLSearchParams({
        query: query,
        limit: limit.toString(),
        start: startNs.toString(),
        end: endNs.toString(),
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
        toast.error("No logs found", { description: "Query returned no results or invalid format." });
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      toast.error("Error", { description: "Failed to fetch logs" });
    } finally {
      setLoading(false);
    }
  }, [currentContext, config, query, limit, timeRange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      fetchLogs();
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-background"
      style={{ display: isActive ? 'flex' : 'none' }}
    >
      {/* Query Bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-card/30 border-b border-border">
        <ScrollText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none text-muted-foreground/50">
            <span className="font-mono text-[10px] font-bold bg-muted/50 px-1 py-0.5 rounded">LogQL</span>
          </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-14 font-mono text-xs bg-background/50 border-border/50 h-7"
            placeholder='{container="kube-apiserver"}'
          />
        </div>
        {/* Time Range Picker */}
        <TimeRangePicker
          value={timeRange}
          onChange={setTimeRange}
        />

        {/* Limit Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
              {limit} lines
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[80px]">
            {[20, 50, 100, 250, 500, 1000].map((l) => (
              <DropdownMenuItem key={l} onClick={() => setLimit(l)} className="text-xs">
                {l} lines {limit === l && <Check className="ml-auto h-3 w-3" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={fetchLogs}
                disabled={loading}
                size="sm"
                className="h-7 px-3 text-xs"
              >
                {loading ? <RotateCw className="h-3 w-3 animate-spin" /> : <><Play className="h-3 w-3" /> Run query</>}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Execute LogQL</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => {
                  setTempConfig(config);
                  setIsConfigOpen(true);
                }}
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Loki Configuration</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Loki Configuration Dialog */}
      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Loki Configuration</DialogTitle>
            <DialogDescription>
              Configure the Loki service endpoint for log queries.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase">Namespace</label>
              <Input
                value={tempConfig.namespace}
                onChange={(e) => setTempConfig({ ...tempConfig, namespace: e.target.value })}
                placeholder="monitoring"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase">Service Address</label>
              <Input
                value={tempConfig.service}
                onChange={(e) => setTempConfig({ ...tempConfig, service: e.target.value })}
                placeholder="loki:3100"
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Format: service-name:port</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveConfig}>
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 px-3 py-1.5 bg-card/20 border-b border-border text-[10px] select-none">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Time</span>
          <Switch checked={settings.showTime} onCheckedChange={() => toggleSetting('showTime')} className="scale-[0.6] origin-left" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Wrap</span>
          <Switch checked={settings.wrapLines} onCheckedChange={() => toggleSetting('wrapLines')} className="scale-[0.6] origin-left" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">JSON</span>
          <Switch checked={settings.prettifyJson} onCheckedChange={() => toggleSetting('prettifyJson')} className="scale-[0.6] origin-left" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Colorize</span>
          <Switch checked={settings.showBgColors} onCheckedChange={() => toggleSetting('showBgColors')} className="scale-[0.6] origin-left" />
        </div>

        <div className="h-3 w-px bg-border/50" />

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Dedup</span>
          <div className="flex items-center bg-muted/30 rounded p-0.5">
            {([
              { mode: 'None' as const, title: 'No de-duplication' },
              { mode: 'Exact' as const, title: 'De-duplication of successive lines that are identical, ignoring ISO datetimes' },
              { mode: 'Numbers' as const, title: 'De-duplication of successive lines that are identical when ignoring numbers (e.g., IP addresses, latencies)' },
              { mode: 'Signature' as const, title: 'De-duplication of successive lines that have identical punctuation and whitespace' },
            ]).map(({ mode, title }) => (
              <button
                key={mode}
                onClick={() => setDeduplication(mode)}
                title={title}
                className={cn(
                  "px-2 py-0.5 rounded-sm transition-all text-[10px]",
                  settings.deduplication === mode
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {stats && (
          <div className="ml-auto flex items-center gap-3 text-muted-foreground/70">
            <span>Dedup: {displayedLogs.reduce((sum, log) => sum + (log.duplicates || 0), 0)}</span>
            <span>{stats.summary?.execTime?.toFixed(3)}s</span>
            <span>{Math.round((stats.summary?.totalBytesProcessed || 0) / 1024)} KB</span>
          </div>
        )}
      </div>

      {/* Log Content */}
      <ScrollArea className="flex-1">
        {/* Header Row */}
        {displayedLogs.length > 0 && (
          <div className="flex items-center px-2 py-1.5 gap-2 w-full bg-muted/50 backdrop-blur-md border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider sticky top-0 z-10">
            <div className="w-5 flex-shrink-0" /> {/* Expand button space */}
            {settings.showTime && <div className="w-24 flex-shrink-0">Timestamp</div>}
            <div className="w-20 flex-shrink-0">Type</div>
            <div className="flex-1">Body</div>
            <div className="w-8 flex-shrink-0" /> {/* Copy button space */}
          </div>
        )}
        <div className="flex flex-col min-w-full">
          {displayedLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground opacity-50">
              {loading ? <RotateCw className="h-8 w-8 mb-3 animate-spin opacity-30" /> : <Search className="h-8 w-8 mb-3" />}
              <p className="text-xs">{loading ? "Fetching logs..." : "No logs. Run a query to fetch log entries."}</p>
            </div>
          ) : (
            displayedLogs.map((log) => (
              <LogRow key={log.id} log={log} settings={settings} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default LoggingTab;
