import React, { useState, useMemo } from 'react';
import { format, subMinutes, subHours, subDays, subWeeks } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Clock, CalendarIcon, X, ChevronLeft, Search } from 'lucide-react';

export interface TimeRange {
  from: Date;
  to: Date;
  raw: {
    from: string;
    to: string;
  };
  label?: string;
}

interface QuickRange {
  label: string;
  from: string;
  to: string;
  section?: string;
}

const QUICK_RANGES: QuickRange[] = [
  { label: 'Last 5 minutes', from: 'now-5m', to: 'now' },
  { label: 'Last 15 minutes', from: 'now-15m', to: 'now' },
  { label: 'Last 30 minutes', from: 'now-30m', to: 'now' },
  { label: 'Last 1 hour', from: 'now-1h', to: 'now' },
  { label: 'Last 3 hours', from: 'now-3h', to: 'now' },
  { label: 'Last 6 hours', from: 'now-6h', to: 'now' },
  { label: 'Last 12 hours', from: 'now-12h', to: 'now' },
  { label: 'Last 24 hours', from: 'now-24h', to: 'now' },
  { label: 'Last 2 days', from: 'now-2d', to: 'now' },
  { label: 'Last 7 days', from: 'now-7d', to: 'now' },
  { label: 'Last 30 days', from: 'now-30d', to: 'now' },
  { label: 'Last 90 days', from: 'now-90d', to: 'now' },
];

// Parse relative time expressions like "now-5m", "now-1h", etc.
const parseRelativeTime = (expr: string, baseTime: Date = new Date()): Date => {
  if (expr === 'now') return baseTime;

  const match = expr.match(/^now-(\d+)([mhdw])$/);
  if (!match) return baseTime;

  const [, amount, unit] = match;
  const num = parseInt(amount);

  switch (unit) {
    case 'm': return subMinutes(baseTime, num);
    case 'h': return subHours(baseTime, num);
    case 'd': return subDays(baseTime, num);
    case 'w': return subWeeks(baseTime, num);
    default: return baseTime;
  }
};

// Format date to relative or absolute string
const formatTimeDisplay = (timeRange: TimeRange): string => {
  if (timeRange.label) return timeRange.label;

  const fromStr = timeRange.raw.from.startsWith('now')
    ? timeRange.raw.from
    : format(timeRange.from, 'MMM d, yyyy HH:mm');
  const toStr = timeRange.raw.to.startsWith('now')
    ? timeRange.raw.to
    : format(timeRange.to, 'MMM d, yyyy HH:mm');

  return `${fromStr} to ${toStr}`;
};

interface TimeRangePickerProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  className?: string;
}

type ViewMode = 'main' | 'calendar-from' | 'calendar-to';

export const TimeRangePicker: React.FC<TimeRangePickerProps> = ({
  value,
  onChange,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [searchQuery, setSearchQuery] = useState('');

  // Local state for editing
  const [fromInput, setFromInput] = useState(value.raw.from);
  const [toInput, setToInput] = useState(value.raw.to);
  const [selectedFromDate, setSelectedFromDate] = useState<Date | undefined>(value.from);
  const [selectedToDate, setSelectedToDate] = useState<Date | undefined>(value.to);

  // Filter quick ranges based on search
  const filteredRanges = useMemo(() => {
    if (!searchQuery) return QUICK_RANGES;
    return QUICK_RANGES.filter(range =>
      range.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  // Handle quick range selection
  const handleQuickRangeSelect = (range: QuickRange) => {
    const now = new Date();
    const from = parseRelativeTime(range.from, now);
    const to = parseRelativeTime(range.to, now);

    onChange({
      from,
      to,
      raw: { from: range.from, to: range.to },
      label: range.label,
    });
    setFromInput(range.from);
    setToInput(range.to);
    setOpen(false);
  };

  // Apply custom time range
  const handleApplyTimeRange = () => {
    const now = new Date();
    let from: Date;
    let to: Date;

    // Parse from input
    if (fromInput.startsWith('now')) {
      from = parseRelativeTime(fromInput, now);
    } else if (selectedFromDate) {
      from = selectedFromDate;
    } else {
      from = new Date(fromInput);
    }

    // Parse to input
    if (toInput.startsWith('now') || toInput === 'now') {
      to = parseRelativeTime(toInput, now);
    } else if (selectedToDate) {
      to = selectedToDate;
    } else {
      to = new Date(toInput);
    }

    onChange({
      from,
      to,
      raw: { from: fromInput, to: toInput },
    });
    setOpen(false);
  };

  // Handle calendar date selection
  const handleFromDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedFromDate(date);
      setFromInput(format(date, "yyyy-MM-dd'T'HH:mm:ss"));
      setViewMode('main');
    }
  };

  const handleToDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedToDate(date);
      setToInput(format(date, "yyyy-MM-dd'T'HH:mm:ss"));
      setViewMode('main');
    }
  };

  // Reset to initial values when popover opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setFromInput(value.raw.from);
      setToInput(value.raw.to);
      setSelectedFromDate(value.from);
      setSelectedToDate(value.to);
      setViewMode('main');
      setSearchQuery('');
    }
    setOpen(isOpen);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5",
            className
          )}
        >
          <Clock className="h-3.5 w-3.5" />
          <span className="max-w-[180px] truncate">{formatTimeDisplay(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 bg-popover border-border shadow-2xl"
        align="end"
        sideOffset={8}
      >
        {viewMode === 'main' ? (
          <div className="flex min-h-[360px]">
            {/* Left Panel - Calendar */}
            <div className="border-r border-border p-3 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Select a time range</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              <Calendar
                mode="range"
                selected={{
                  from: selectedFromDate,
                  to: selectedToDate,
                }}
                onSelect={(range) => {
                  setSelectedFromDate(range?.from);
                  setSelectedToDate(range?.to);
                  if (range?.from) {
                    setFromInput(format(range.from, "yyyy-MM-dd'T'HH:mm:ss"));
                  }
                  if (range?.to) {
                    setToInput(format(range.to, "yyyy-MM-dd'T'HH:mm:ss"));
                  }
                }}
                numberOfMonths={1}
                className="rounded-md"
              />
            </div>

            {/* Middle Panel - Absolute Time Range */}
            <div className="w-[280px] border-r border-border flex flex-col">
              <div className="p-3 border-b border-border">
                <span className="text-sm font-medium">Absolute time range</span>
              </div>

              <div className="p-3 space-y-4 flex-1">
                {/* From Input */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    From
                  </label>
                  <div className="relative">
                    <Input
                      value={fromInput}
                      onChange={(e) => setFromInput(e.target.value)}
                      placeholder="now-5m"
                      className="h-8 text-sm pr-8 bg-background/50 border-border/50 font-mono"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                      onClick={() => setViewMode('calendar-from')}
                    >
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                {/* To Input */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    To
                  </label>
                  <div className="relative">
                    <Input
                      value={toInput}
                      onChange={(e) => setToInput(e.target.value)}
                      placeholder="now"
                      className="h-8 text-sm pr-8 bg-background/50 border-border/50 font-mono"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                      onClick={() => setViewMode('calendar-to')}
                    >
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                {/* Apply Button */}
                <Button
                  className="w-full h-8 text-sm"
                  onClick={handleApplyTimeRange}
                >
                  Apply time range
                </Button>

                {/* Help Text */}
                <div className="mt-4 p-3 bg-muted/30 rounded-md border border-border/50">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Enter relative time expressions like <code className="bg-muted px-1 py-0.5 rounded text-[10px] font-mono">now-5m</code>, <code className="bg-muted px-1 py-0.5 rounded text-[10px] font-mono">now-1h</code>, or <code className="bg-muted px-1 py-0.5 rounded text-[10px] font-mono">now-7d</code>.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Panel - Quick Ranges */}
            <div className="w-[180px] flex flex-col">
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search quick ranges"
                    className="h-7 text-xs pl-7 bg-background/50 border-border/50"
                  />
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-1">
                  {filteredRanges.map((range) => (
                    <button
                      key={range.label}
                      onClick={() => handleQuickRangeSelect(range)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                        "hover:bg-primary/10 hover:text-primary",
                        value.label === range.label && "bg-primary/20 text-primary font-medium"
                      )}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        ) : (
          /* Calendar View for From/To Selection */
          <div className="p-3 min-w-[280px]">
            <div className="flex items-center gap-2 mb-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode('main')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">
                {viewMode === 'calendar-from' ? 'Select start date' : 'Select end date'}
              </span>
            </div>

            <Calendar
              mode="single"
              selected={viewMode === 'calendar-from' ? selectedFromDate : selectedToDate}
              onSelect={viewMode === 'calendar-from' ? handleFromDateSelect : handleToDateSelect}
              className="rounded-md"
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

// Export default time range (last 1 hour)
export const getDefaultTimeRange = (): TimeRange => {
  const now = new Date();
  return {
    from: subHours(now, 1),
    to: now,
    raw: { from: 'now-1h', to: 'now' },
    label: 'Last 1 hour',
  };
};

export default TimeRangePicker;
