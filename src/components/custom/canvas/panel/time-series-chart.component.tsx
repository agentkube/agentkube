import React, { useEffect, useRef, useState, useMemo } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface TimeSeriesDataPoint {
  timestamp: number;
  value: number;
}

export interface TimeSeriesSeries {
  label: string;
  data: TimeSeriesDataPoint[];
  color?: string;
  strokeWidth?: number;
  fill?: boolean;
  fillOpacity?: number;
}

export interface TimeSeriesChartProps {
  series: TimeSeriesSeries[];
  width?: number;
  height?: number;
  title?: string;
  yAxisLabel?: string;
  xAxisLabel?: string;
  isDarkMode?: boolean;
  showLegend?: boolean;
  showGrid?: boolean;
  enableZoom?: boolean;
  onTimeRangeSelect?: (start: number, end: number) => void;
  yAxisUnit?: string;
  thresholds?: Array<{
    value: number;
    color: string;
    label?: string;
  }>;
  className?: string;
}

const defaultColors = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
];

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  series,
  width = 800,
  height = 400,
  title,
  yAxisLabel,
  xAxisLabel,
  isDarkMode = false,
  showLegend = false,
  showGrid = true,
  enableZoom = true,
  onTimeRangeSelect,
  yAxisUnit = '',
  thresholds = [],
  className = '',
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const [visibleSeries, setVisibleSeries] = useState<boolean[]>([]);

  const chartData = useMemo(() => {
    if (!series.length) return [new Float64Array(), new Float64Array()];

    const allTimestamps = new Set<number>();
    series.forEach(s => {
      s.data.forEach(point => allTimestamps.add(point.timestamp));
    });

    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
    
    const data: (Float64Array | (number | null)[])[] = [new Float64Array(sortedTimestamps)];

    series.forEach(s => {
      const timestampToValue = new Map(s.data.map(point => [point.timestamp, point.value]));
      const values: (number | null)[] = sortedTimestamps.map(ts => timestampToValue.get(ts) ?? null);
      data.push(values);
    });

    return data as uPlot.AlignedData;
  }, [series]);

  const chartOptions = useMemo((): uPlot.Options => {
    const textColor = isDarkMode ? '#e5e7eb' : '#374151';
    const gridColor = isDarkMode ? '#374151' : '#e5e7eb';

    const seriesConfig: uPlot.Series[] = [
      {}, // x-axis (timestamps)
      ...series.map((s, index) => ({
        label: s.label,
        stroke: s.color || defaultColors[index % defaultColors.length],
        width: s.strokeWidth || 2,
        fill: s.fill ? (s.color || defaultColors[index % defaultColors.length]) : undefined,
        fillOpacity: s.fillOpacity || 0.1,
        show: visibleSeries[index] !== false,
      }))
    ];

    return {
      width,
      height,
      series: seriesConfig,
      axes: [
        {
          label: xAxisLabel,
          labelSize: 14,
          labelFont: 'system-ui',
          stroke: textColor,
          grid: {
            show: showGrid,
            stroke: gridColor,
            width: 1,
          },
          ticks: {
            show: true,
            stroke: gridColor,
          },
          values: (_, vals) => vals.map(v => {
            const date = new Date(v * 1000);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }),
          rotate: Math.PI / 4, // 45 degree rotation
          space: 80, // More space between labels
        },
        {
          label: yAxisLabel,
          labelSize: 14,
          labelFont: 'system-ui',
          stroke: textColor,
          grid: {
            show: showGrid,
            stroke: gridColor,
            width: 1,
          },
          ticks: {
            show: true,
            stroke: gridColor,
          },
          values: (_, vals) => vals.map(v => `${v}${yAxisUnit}`),
        },
      ],
      plugins: [
        {
          hooks: {
            init: (u) => {
              if (thresholds.length > 0) {
                thresholds.forEach(threshold => {
                  const line = document.createElement('div');
                  line.style.position = 'absolute';
                  line.style.left = '0';
                  line.style.right = '0';
                  line.style.height = '1px';
                  line.style.backgroundColor = threshold.color;
                  line.style.pointerEvents = 'none';
                  line.style.zIndex = '1';
                  
                  const yPos = u.valToPos(threshold.value, 'y');
                  line.style.top = `${yPos}px`;
                  
                  if (u.root.parentElement) {
                    u.root.parentElement.appendChild(line);
                  }
                });
              }
            }
          }
        }
      ],
      cursor: {
        show: true,
        sync: {
          key: 'timeseries',
        },
      },
      select: enableZoom ? {
        show: true,
        over: true,
        left: 0,
        width: 0,
        top: 0,
        height: 0,
      } : undefined,
      hooks: {
        setSelect: enableZoom && onTimeRangeSelect ? [
          (u) => {
            const min = u.posToVal(u.select.left, 'x');
            const max = u.posToVal(u.select.left + u.select.width, 'x');
            onTimeRangeSelect(min, max);
          }
        ] : undefined,
      },
      scales: {
        x: {
          time: true,
        },
      },
    };
  }, [series, width, height, isDarkMode, showGrid, enableZoom, onTimeRangeSelect, yAxisLabel, xAxisLabel, yAxisUnit, thresholds, visibleSeries]);

  useEffect(() => {
    if (series.length > 0 && visibleSeries.length === 0) {
      setVisibleSeries(series.map(() => true));
    }
  }, [series]);

  useEffect(() => {
    if (!chartRef.current || !chartData || chartData.length < 2) return;

    if (plotRef.current) {
      plotRef.current.destroy();
    }

    // Get the actual container width
    const containerWidth = chartRef.current.offsetWidth || width;
    const responsiveOptions = {
      ...chartOptions,
      width: containerWidth,
    };

    plotRef.current = new uPlot(responsiveOptions, chartData, chartRef.current);

    // Handle window resize
    const handleResize = () => {
      if (plotRef.current && chartRef.current) {
        const newWidth = chartRef.current.offsetWidth;
        plotRef.current.setSize({ width: newWidth, height });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (plotRef.current) {
        plotRef.current.destroy();
        plotRef.current = null;
      }
    };
  }, [chartData, chartOptions, height]);

  const toggleSeries = (index: number) => {
    const newVisibility = [...visibleSeries];
    newVisibility[index] = !newVisibility[index];
    setVisibleSeries(newVisibility);
    
    if (plotRef.current) {
      plotRef.current.setSeries(index + 1, { show: newVisibility[index] });
    }
  };

  return (
    <div className={`time-series-chart w-full overflow-hidden ${className}`}>
      <style>{`
        .uplot .u-tooltip {
          font-size: 10px !important;
          line-height: 1.2 !important;
          padding: 4px 6px !important;
        }
        .uplot .u-tooltip .u-tooltip-content {
          font-size: 10px !important;
        }
        .u-legend {
          font-size: 10px !important;
        }
      `}</style>
      {title && (
        <div className={`text-sm mb-4 truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
          {title}
        </div>
      )}
      
      <div className="relative w-full overflow-hidden">
        <div ref={chartRef} className="uplot-chart w-full" />
        
        {showLegend && series.length > 0 && (
          <div className="flex flex-wrap gap-1 sm:gap-1 mt-4 text-xs">
            {series.map((s, index) => (
              <div
                key={s.label}
                className={`flex items-center gap-1 sm:gap-2 cursor-pointer min-w-0 ${
                  visibleSeries[index] === false ? 'opacity-50' : ''
                }`}
                onClick={() => toggleSeries(index)}
              >
                <div
                  className="w-2 h-2 sm:w-3 sm:h-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.color || defaultColors[index % defaultColors.length] }}
                />
                <span className={`truncate ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeSeriesChart;