import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  X,
  ChevronDown,
  Filter,
  Search,
  Code2,
  Wand2,
  HelpCircle,
  Braces,
  Hash,
  ArrowRight,
  Copy,
  Check,
  Trash2,
  GripVertical,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { kubeProxyRequest } from '@/api/cluster';

// =============================================================================
// Types
// =============================================================================

type LabelOperator = '=' | '!=' | '=~' | '!~';
type LineFilterOperator = '|=' | '!=' | '|~' | '!~';
type ParserType = 'json' | 'logfmt' | 'pattern' | 'regexp' | 'unpack';
type AggregationFunction = 'count_over_time' | 'rate' | 'bytes_over_time' | 'bytes_rate' |
  'sum' | 'avg' | 'min' | 'max' | 'stddev' | 'stdvar' | 'count' | 'topk' | 'bottomk';

interface LabelMatcher {
  id: string;
  label: string;
  operator: LabelOperator;
  value: string;
}

interface LineFilter {
  id: string;
  operator: LineFilterOperator;
  value: string;
}

interface ParserExpression {
  id: string;
  type: ParserType;
  expression?: string; // For pattern/regexp
}

interface LabelFilter {
  id: string;
  label: string;
  operator: string;
  value: string;
}

interface Operation {
  id: string;
  type: 'line_filter' | 'parser' | 'label_filter' | 'line_format' | 'label_format';
  data: LineFilter | ParserExpression | LabelFilter | { expression: string };
}

interface QueryBuilderState {
  labelMatchers: LabelMatcher[];
  operations: Operation[];
}

interface LokiConfig {
  namespace: string;
  service: string;
}

interface LogQLBuilderProps {
  value: string;
  onChange: (query: string) => void;
  onClose?: () => void;
  clusterName?: string;
  lokiConfig?: LokiConfig;
}

// =============================================================================
// Constants
// =============================================================================

const LABEL_OPERATORS: { value: LabelOperator; label: string; description: string }[] = [
  { value: '=', label: '=', description: 'Equals' },
  { value: '!=', label: '!=', description: 'Not equals' },
  { value: '=~', label: '=~', description: 'Regex match' },
  { value: '!~', label: '!~', description: 'Regex not match' },
];

const LINE_FILTER_OPERATORS: { value: LineFilterOperator; label: string; description: string }[] = [
  { value: '|=', label: '|=', description: 'Contains string' },
  { value: '!=', label: '!=', description: 'Does not contain' },
  { value: '|~', label: '|~', description: 'Matches regex' },
  { value: '!~', label: '!~', description: 'Does not match regex' },
];

const PARSERS: { type: ParserType; label: string; description: string; hasExpression: boolean }[] = [
  { type: 'json', label: 'JSON', description: 'Parse JSON structured logs', hasExpression: false },
  { type: 'logfmt', label: 'Logfmt', description: 'Parse logfmt key=value pairs', hasExpression: false },
  { type: 'pattern', label: 'Pattern', description: 'Parse using pattern matching', hasExpression: true },
  { type: 'regexp', label: 'Regexp', description: 'Parse using regular expression', hasExpression: true },
  { type: 'unpack', label: 'Unpack', description: 'Unpack packed labels', hasExpression: false },
];

const COMMON_LABELS = [
  'namespace', 'app', 'pod', 'container', 'job', 'instance',
  'component', 'service', 'level', 'stream', 'node', 'cluster'
];

const QUERY_PATTERNS = [
  {
    name: 'Basic stream selector',
    description: 'Select logs by label',
    query: '{namespace="default"}',
  },
  {
    name: 'Filter by content',
    description: 'Find logs containing text',
    query: '{namespace="default"} |= "error"',
  },
  {
    name: 'JSON parsing',
    description: 'Parse JSON logs and filter',
    query: '{namespace="default"} | json | level="error"',
  },
  {
    name: 'Rate query',
    description: 'Count logs per second',
    query: 'rate({namespace="default"}[5m])',
  },
  {
    name: 'Error rate by app',
    description: 'Count errors grouped by app',
    query: 'sum by (app) (rate({namespace="default"} |= "error" [5m]))',
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

const generateId = () => Math.random().toString(36).substring(2, 9);

const parseQuery = (query: string): QueryBuilderState => {
  const state: QueryBuilderState = {
    labelMatchers: [],
    operations: [],
  };

  if (!query.trim()) return state;

  // Parse stream selector {label="value"}
  const streamMatch = query.match(/\{([^}]*)\}/);
  if (streamMatch) {
    const labelsStr = streamMatch[1];
    // Match label="value" patterns with various operators
    const labelRegex = /(\w+)(=~|!~|!=|=)"([^"]*)"/g;
    let match;
    while ((match = labelRegex.exec(labelsStr)) !== null) {
      state.labelMatchers.push({
        id: generateId(),
        label: match[1],
        operator: match[2] as LabelOperator,
        value: match[3],
      });
    }
  }

  // Parse pipeline operations (|= "text", | json, etc.)
  const pipelineStart = query.indexOf('}');
  if (pipelineStart > -1) {
    const pipeline = query.substring(pipelineStart + 1).trim();

    // Parse line filters |= "text"
    const lineFilterRegex = /(\|=|!=|\|~|!~)\s*"([^"]*)"/g;
    let lineMatch;
    while ((lineMatch = lineFilterRegex.exec(pipeline)) !== null) {
      state.operations.push({
        id: generateId(),
        type: 'line_filter',
        data: {
          id: generateId(),
          operator: lineMatch[1] as LineFilterOperator,
          value: lineMatch[2],
        },
      });
    }

    // Parse parsers | json, | logfmt
    const parserRegex = /\|\s*(json|logfmt|unpack)/g;
    let parserMatch;
    while ((parserMatch = parserRegex.exec(pipeline)) !== null) {
      state.operations.push({
        id: generateId(),
        type: 'parser',
        data: {
          id: generateId(),
          type: parserMatch[1] as ParserType,
        },
      });
    }
  }

  return state;
};

const buildQuery = (state: QueryBuilderState): string => {
  if (state.labelMatchers.length === 0) return '';

  // Build stream selector
  const labels = state.labelMatchers
    .filter(m => m.label && m.value)
    .map(m => `${m.label}${m.operator}"${m.value}"`)
    .join(', ');

  let query = `{${labels}}`;

  // Build pipeline
  for (const op of state.operations) {
    switch (op.type) {
      case 'line_filter':
        const lf = op.data as LineFilter;
        if (lf.value) {
          query += ` ${lf.operator} "${lf.value}"`;
        }
        break;
      case 'parser':
        const parser = op.data as ParserExpression;
        if (parser.expression) {
          query += ` | ${parser.type} \`${parser.expression}\``;
        } else {
          query += ` | ${parser.type}`;
        }
        break;
      case 'label_filter':
        const labelFilter = op.data as LabelFilter;
        if (labelFilter.label && labelFilter.value) {
          query += ` | ${labelFilter.label}${labelFilter.operator}"${labelFilter.value}"`;
        }
        break;
      case 'line_format':
        const lineFormat = op.data as { expression: string };
        if (lineFormat.expression) {
          query += ` | line_format \`${lineFormat.expression}\``;
        }
        break;
    }
  }

  return query;
};

// =============================================================================
// Sub Components
// =============================================================================

interface LabelMatcherRowProps {
  matcher: LabelMatcher;
  availableLabels: string[];
  loadingLabels: boolean;
  availableValues: string[];
  loadingValues: boolean;
  onChange: (id: string, updates: Partial<LabelMatcher>) => void;
  onRemove: (id: string) => void;
  onLabelSelect: (label: string) => void;
  isOnly: boolean;
}

const LabelMatcherRow: React.FC<LabelMatcherRowProps> = ({
  matcher,
  availableLabels,
  loadingLabels,
  availableValues,
  loadingValues,
  onChange,
  onRemove,
  onLabelSelect,
  isOnly,
}) => {
  const [labelOpen, setLabelOpen] = useState(false);
  const [valueOpen, setValueOpen] = useState(false);

  const handleLabelSelect = (label: string) => {
    onChange(matcher.id, { label, value: '' }); // Reset value when label changes
    onLabelSelect(label); // Trigger fetching values for this label
    setLabelOpen(false);
  };

  return (
    <div className="flex items-center gap-1 group">
      <GripVertical className="h-3 w-3 text-muted-foreground/30 cursor-grab" />

      {/* Label selector */}
      <Popover open={labelOpen} onOpenChange={setLabelOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 min-w-[100px] justify-between text-xs font-mono bg-muted/30"
          >
            {matcher.label || 'Select label'}
            {loadingLabels ? (
              <Loader2 className="h-3 w-3 ml-1 animate-spin" />
            ) : (
              <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search labels..." className="h-8 text-xs" />
            <CommandList>
              {loadingLabels ? (
                <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading labels...
                </div>
              ) : availableLabels.length === 0 ? (
                <CommandEmpty>No labels found. Check Loki connection.</CommandEmpty>
              ) : (
                <CommandGroup heading={`${availableLabels.length} labels`}>
                  {availableLabels.map((label) => (
                    <CommandItem
                      key={label}
                      value={label}
                      onSelect={() => handleLabelSelect(label)}
                      className="text-xs font-mono"
                    >
                      {label}
                      {matcher.label === label && (
                        <Check className="ml-auto h-3 w-3 text-primary" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Operator selector */}
      <Select
        value={matcher.operator}
        onValueChange={(value) => onChange(matcher.id, { operator: value as LabelOperator })}
      >
        <SelectTrigger className="h-7 w-28 text-xs font-mono bg-muted/30">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LABEL_OPERATORS.map((op) => (
            <SelectItem key={op.value} value={op.value} className="text-xs font-mono">
              <div className="flex items-center gap-2">
                <span>{op.value}</span>
                <span className="text-muted-foreground text-[10px]">{op.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value selector/input */}
      <Popover open={valueOpen} onOpenChange={(open) => {
        setValueOpen(open);
        // Fetch values when opening if we have a label
        if (open && matcher.label) {
          onLabelSelect(matcher.label);
        }
      }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 min-w-[140px] justify-between text-xs font-mono bg-muted/30"
            disabled={!matcher.label}
          >
            <span className="truncate max-w-[100px]">
              {matcher.value || 'Select value'}
            </span>
            {loadingValues ? (
              <Loader2 className="h-3 w-3 ml-1 animate-spin" />
            ) : (
              <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <div className="p-2 border-b">
            <Input
              value={matcher.value}
              onChange={(e) => onChange(matcher.id, { value: e.target.value })}
              placeholder="Enter value or select below..."
              className="h-7 text-xs font-mono"
            />
          </div>
          <Command>
            <CommandInput placeholder="Search values..." className="h-8 text-xs" />
            <CommandList className="max-h-[200px]">
              {loadingValues ? (
                <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading values...
                </div>
              ) : availableValues.length === 0 ? (
                <CommandEmpty>No values found for "{matcher.label}"</CommandEmpty>
              ) : (
                <CommandGroup heading={`${availableValues.length} values`}>
                  {availableValues.map((value) => (
                    <CommandItem
                      key={value}
                      value={value}
                      onSelect={() => {
                        onChange(matcher.id, { value });
                        setValueOpen(false);
                      }}
                      className="text-xs font-mono"
                    >
                      <span className="truncate">{value}</span>
                      {matcher.value === value && (
                        <Check className="ml-auto h-3 w-3 text-primary flex-shrink-0" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Remove button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-6 w-6 text-muted-foreground hover:text-destructive", isOnly && "opacity-0 pointer-events-none")}
        onClick={() => onRemove(matcher.id)}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
};

interface OperationCardProps {
  operation: Operation;
  onChange: (id: string, updates: Partial<Operation>) => void;
  onRemove: (id: string) => void;
}

const OperationCard: React.FC<OperationCardProps> = ({ operation, onChange, onRemove }) => {
  const getOperationTitle = () => {
    switch (operation.type) {
      case 'line_filter': return 'Line filter';
      case 'parser': return 'Parser';
      case 'label_filter': return 'Label filter';
      case 'line_format': return 'Line format';
      default: return 'Operation';
    }
  };

  const getOperationIcon = () => {
    switch (operation.type) {
      case 'line_filter': return <Filter className="h-3 w-3" />;
      case 'parser': return <Braces className="h-3 w-3" />;
      case 'label_filter': return <Hash className="h-3 w-3" />;
      default: return <Code2 className="h-3 w-3" />;
    }
  };

  return (
    <div className="rounded-md border border-border/50 bg-card/50 overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1.5 bg-muted/30 border-b border-border/30">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {getOperationIcon()}
          <span className="font-medium">{getOperationTitle()}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(operation.id)}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      <div className="p-2">
        {operation.type === 'line_filter' && (
          <div className="flex items-center gap-2">
            <Select
              value={(operation.data as LineFilter).operator}
              onValueChange={(value) =>
                onChange(operation.id, {
                  data: { ...operation.data, operator: value } as LineFilter
                })
              }
            >
              <SelectTrigger className="h-7 w-16 text-xs font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINE_FILTER_OPERATORS.map((op) => (
                  <SelectItem key={op.value} value={op.value} className="text-xs font-mono">
                    {op.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={(operation.data as LineFilter).value}
              onChange={(e) =>
                onChange(operation.id, {
                  data: { ...operation.data, value: e.target.value } as LineFilter
                })
              }
              placeholder="Filter text..."
              className="h-7 text-xs font-mono flex-1"
            />
          </div>
        )}

        {operation.type === 'parser' && (
          <div className="space-y-2">
            <Select
              value={(operation.data as ParserExpression).type}
              onValueChange={(value) =>
                onChange(operation.id, {
                  data: { ...operation.data, type: value } as ParserExpression
                })
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARSERS.map((parser) => (
                  <SelectItem key={parser.type} value={parser.type} className="text-xs">
                    <div className="flex flex-col">
                      <span>{parser.label}</span>
                      <span className="text-muted-foreground text-[10px]">{parser.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {PARSERS.find(p => p.type === (operation.data as ParserExpression).type)?.hasExpression && (
              <Input
                value={(operation.data as ParserExpression).expression || ''}
                onChange={(e) =>
                  onChange(operation.id, {
                    data: { ...operation.data, expression: e.target.value } as ParserExpression
                  })
                }
                placeholder="Enter expression..."
                className="h-7 text-xs font-mono"
              />
            )}
          </div>
        )}

        {operation.type === 'label_filter' && (
          <div className="flex items-center gap-2">
            <Input
              value={(operation.data as LabelFilter).label}
              onChange={(e) =>
                onChange(operation.id, {
                  data: { ...operation.data, label: e.target.value } as LabelFilter
                })
              }
              placeholder="Label..."
              className="h-7 text-xs font-mono w-24"
            />
            <Select
              value={(operation.data as LabelFilter).operator}
              onValueChange={(value) =>
                onChange(operation.id, {
                  data: { ...operation.data, operator: value } as LabelFilter
                })
              }
            >
              <SelectTrigger className="h-7 w-14 text-xs font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LABEL_OPERATORS.map((op) => (
                  <SelectItem key={op.value} value={op.value} className="text-xs font-mono">
                    {op.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={(operation.data as LabelFilter).value}
              onChange={(e) =>
                onChange(operation.id, {
                  data: { ...operation.data, value: e.target.value } as LabelFilter
                })
              }
              placeholder="Value..."
              className="h-7 text-xs font-mono flex-1"
            />
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Main Component
// =============================================================================

export const LogQLBuilder: React.FC<LogQLBuilderProps> = ({
  value,
  onChange,
  onClose,
  clusterName,
  lokiConfig,
}) => {
  const [state, setState] = useState<QueryBuilderState>(() => parseQuery(value));
  const [copied, setCopied] = useState(false);
  const [showPatterns, setShowPatterns] = useState(false);

  // Loki data state
  const [availableLabels, setAvailableLabels] = useState<string[]>([]);
  const [labelValues, setLabelValues] = useState<Record<string, string[]>>({});
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [loadingLabelValues, setLoadingLabelValues] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Fetch available labels from Loki
  const fetchLabels = useCallback(async () => {
    if (!clusterName || !lokiConfig) {
      console.log('No cluster or loki config available for fetching labels');
      return;
    }

    setLoadingLabels(true);
    setConnectionError(null);

    try {
      const proxyPath = `api/v1/namespaces/${lokiConfig.namespace}/services/${lokiConfig.service}/proxy/loki/api/v1/labels`;
      const response = await kubeProxyRequest(clusterName, proxyPath, 'GET');

      if (response && response.status === 'success' && Array.isArray(response.data)) {
        setAvailableLabels(response.data.sort());
      } else {
        setAvailableLabels([]);
        setConnectionError('Failed to fetch labels from Loki');
      }
    } catch (error) {
      console.error('Error fetching Loki labels:', error);
      setConnectionError('Connection to Loki failed');
      setAvailableLabels([]);
    } finally {
      setLoadingLabels(false);
    }
  }, [clusterName, lokiConfig]);

  // Fetch values for a specific label
  const fetchLabelValues = useCallback(async (labelName: string) => {
    if (!clusterName || !lokiConfig || !labelName) return;

    // Check if we already have values cached
    if (labelValues[labelName] && labelValues[labelName].length > 0) {
      return;
    }

    setLoadingLabelValues(labelName);

    try {
      const proxyPath = `api/v1/namespaces/${lokiConfig.namespace}/services/${lokiConfig.service}/proxy/loki/api/v1/label/${labelName}/values`;
      const response = await kubeProxyRequest(clusterName, proxyPath, 'GET');

      if (response && response.status === 'success' && Array.isArray(response.data)) {
        setLabelValues(prev => ({
          ...prev,
          [labelName]: response.data.sort()
        }));
      }
    } catch (error) {
      console.error(`Error fetching values for label ${labelName}:`, error);
    } finally {
      setLoadingLabelValues(null);
    }
  }, [clusterName, lokiConfig, labelValues]);

  // Fetch labels on mount and when config changes
  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  // Rebuild query when state changes
  useEffect(() => {
    const newQuery = buildQuery(state);
    if (newQuery !== value) {
      onChange(newQuery);
    }
  }, [state]);

  // Re-parse when external value changes significantly
  useEffect(() => {
    const currentBuiltQuery = buildQuery(state);
    if (value !== currentBuiltQuery && value.trim()) {
      setState(parseQuery(value));
    }
  }, [value]);

  const addLabelMatcher = useCallback(() => {
    setState(prev => ({
      ...prev,
      labelMatchers: [
        ...prev.labelMatchers,
        { id: generateId(), label: '', operator: '=', value: '' }
      ],
    }));
  }, []);

  const updateLabelMatcher = useCallback((id: string, updates: Partial<LabelMatcher>) => {
    setState(prev => ({
      ...prev,
      labelMatchers: prev.labelMatchers.map(m =>
        m.id === id ? { ...m, ...updates } : m
      ),
    }));
  }, []);

  const removeLabelMatcher = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      labelMatchers: prev.labelMatchers.filter(m => m.id !== id),
    }));
  }, []);

  const addOperation = useCallback((type: Operation['type']) => {
    let data: Operation['data'];

    switch (type) {
      case 'line_filter':
        data = { id: generateId(), operator: '|=' as LineFilterOperator, value: '' };
        break;
      case 'parser':
        data = { id: generateId(), type: 'json' as ParserType };
        break;
      case 'label_filter':
        data = { id: generateId(), label: '', operator: '=', value: '' };
        break;
      case 'line_format':
        data = { expression: '' };
        break;
      default:
        return;
    }

    setState(prev => ({
      ...prev,
      operations: [...prev.operations, { id: generateId(), type, data }],
    }));
  }, []);

  const updateOperation = useCallback((id: string, updates: Partial<Operation>) => {
    setState(prev => ({
      ...prev,
      operations: prev.operations.map(op =>
        op.id === id ? { ...op, ...updates } : op
      ),
    }));
  }, []);

  const removeOperation = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      operations: prev.operations.filter(op => op.id !== id),
    }));
  }, []);

  const applyPattern = useCallback((query: string) => {
    setState(parseQuery(query));
    setShowPatterns(false);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  const previewQuery = useMemo(() => buildQuery(state), [state]);

  // Ensure at least one label matcher exists
  useEffect(() => {
    if (state.labelMatchers.length === 0) {
      addLabelMatcher();
    }
  }, []);

  return (
    <div className="w-[600px] max-h-[500px] overflow-hidden flex flex-col bg-background border border-border rounded-lg shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">LogQL Builder</span>
          <Badge variant="outline" className="text-[10px] uppercase">Visual</Badge>
          {availableLabels.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0">
              {availableLabels.length} labels
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={fetchLabels}
                  disabled={loadingLabels}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", loadingLabels && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh labels from Loki</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setShowPatterns(!showPatterns)}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Query patterns</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Connection Error */}
      {connectionError && (
        <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/20 text-xs text-destructive flex items-center gap-2">
          <span>{connectionError}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-xs"
            onClick={fetchLabels}
          >
            Retry
          </Button>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Query Patterns Panel */}
          {showPatterns && (
            <div className="rounded-md border border-border/50 bg-muted/20 p-2 space-y-2">
              <div className="text-xs font-medium text-muted-foreground mb-2">Query Patterns</div>
              {QUERY_PATTERNS.map((pattern, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-card/50 hover:bg-card cursor-pointer border border-transparent hover:border-primary/30 transition-colors"
                  onClick={() => applyPattern(pattern.query)}
                >
                  <div className="text-xs font-medium">{pattern.name}</div>
                  <div className="text-[10px] text-muted-foreground">{pattern.description}</div>
                  <code className="text-[10px] font-mono text-primary/80 mt-1 block">{pattern.query}</code>
                </div>
              ))}
            </div>
          )}

          {/* Stream Selector Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Braces className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Label filters</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={addLabelMatcher}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add label
              </Button>
            </div>

            <div className="space-y-1.5 pl-5">
              {state.labelMatchers.map((matcher) => (
                <LabelMatcherRow
                  key={matcher.id}
                  matcher={matcher}
                  availableLabels={availableLabels}
                  loadingLabels={loadingLabels}
                  availableValues={labelValues[matcher.label] || []}
                  loadingValues={loadingLabelValues === matcher.label}
                  onChange={updateLabelMatcher}
                  onRemove={removeLabelMatcher}
                  onLabelSelect={fetchLabelValues}
                  isOnly={state.labelMatchers.length === 1}
                />
              ))}
            </div>
          </div>

          {/* Operations Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Operations</span>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                    <Plus className="h-3 w-3 mr-1" />
                    Add operation
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-1" align="end">
                  <div className="space-y-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs h-7"
                      onClick={() => addOperation('line_filter')}
                    >
                      <Filter className="h-3 w-3 mr-2" />
                      Line filter
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs h-7"
                      onClick={() => addOperation('parser')}
                    >
                      <Braces className="h-3 w-3 mr-2" />
                      Parser
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs h-7"
                      onClick={() => addOperation('label_filter')}
                    >
                      <Hash className="h-3 w-3 mr-2" />
                      Label filter
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs h-7"
                      onClick={() => addOperation('line_format')}
                    >
                      <Code2 className="h-3 w-3 mr-2" />
                      Line format
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {state.operations.length > 0 ? (
              <div className="space-y-2 pl-5">
                {state.operations.map((operation) => (
                  <OperationCard
                    key={operation.id}
                    operation={operation}
                    onChange={updateOperation}
                    onRemove={removeOperation}
                  />
                ))}
              </div>
            ) : (
              <div className="pl-5 text-xs text-muted-foreground/60 py-2">
                No operations added. Add line filters, parsers, or label filters.
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Query Preview Footer */}
      <div className="border-t border-border bg-muted/20 p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 overflow-hidden">
            <code className="text-[11px] font-mono text-foreground/80 block truncate">
              {previewQuery || '{...}'}
            </code>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LogQLBuilder;
