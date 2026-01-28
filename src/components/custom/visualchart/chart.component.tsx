import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
  ChartData,
  TooltipItem,
} from 'chart.js';
import {
  Line,
  Bar,
  Pie,
  Doughnut,
  PolarArea,
  Scatter,
} from 'react-chartjs-2';
import { cn } from '@/lib/utils';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Advanced Grafana-style crosshair state management
interface CrosshairState {
  x: number | null;
  isPinned: boolean;
  timestamp: string | null;
  syncGroup: string;
}

const crosshairStates = new Map<string, CrosshairState>();

// Advanced Grafana-style crosshair plugin
const advancedCrosshairPlugin = {
  id: 'crosshair',

  defaults: {
    enabled: true,
    syncGroup: 'default',
    showTimestamp: true,
    pinnable: true,
    color: 'rgba(59, 130, 246, 0.8)', // blue-500
    lineWidth: 1,
    lineDash: [5, 5]
  },

  beforeEvent(chart: any, args: any) {
    const event = args.event;
    const options = chart.options.plugins.crosshair || {};
    const syncGroup = options.syncGroup || 'default';

    // Initialize state for this sync group
    if (!crosshairStates.has(syncGroup)) {
      crosshairStates.set(syncGroup, {
        x: null,
        isPinned: false,
        timestamp: null,
        syncGroup
      });
    }

    const state = crosshairStates.get(syncGroup)!;

    // Handle click to pin/unpin
    if (event.type === 'click' && options.pinnable) {
      state.isPinned = !state.isPinned;
      chart.update('none'); // Update without animation
      return;
    }

    // Update crosshair position if not pinned
    if (!state.isPinned && event.type === 'mousemove') {
      if (event.x >= chart.chartArea.left && event.x <= chart.chartArea.right) {
        state.x = event.x;

        // Get timestamp from x-axis
        const xScale = chart.scales.x;
        if (xScale && chart.data.labels) {
          const index = Math.round(xScale.getValueForPixel(event.x));
          if (index >= 0 && index < chart.data.labels.length) {
            state.timestamp = chart.data.labels[index];
          }
        }
      } else {
        state.x = null;
        state.timestamp = null;
      }
    }

    // Clear on mouse leave
    if (event.type === 'mouseout' && !state.isPinned) {
      state.x = null;
      state.timestamp = null;
    }
  },

  afterDraw(chart: any) {
    const ctx = chart.ctx;
    const options = chart.options.plugins.crosshair || {};
    const syncGroup = options.syncGroup || 'default';
    const state = crosshairStates.get(syncGroup);

    if (!state || state.x === null) return;

    const { chartArea } = chart;
    const x = state.x;

    ctx.save();

    // Draw vertical crosshair line
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.lineWidth = options.lineWidth || 1;
    ctx.strokeStyle = state.isPinned
      ? 'rgba(34, 197, 94, 0.8)'  // green-500 when pinned
      : (options.color || 'rgba(59, 130, 246, 0.8)'); // blue-500 default
    ctx.setLineDash(options.lineDash || [5, 5]);
    ctx.stroke();

    // Draw timestamp annotation at the top
    if (options.showTimestamp && state.timestamp) {
      const text = state.timestamp;
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const textWidth = ctx.measureText(text).width;
      const padding = 6;
      const boxWidth = textWidth + padding * 2;
      const boxHeight = 20;
      const boxX = Math.max(chartArea.left, Math.min(x - boxWidth / 2, chartArea.right - boxWidth));
      const boxY = chartArea.top - boxHeight - 4;

      // Draw timestamp background
      ctx.fillStyle = state.isPinned
        ? 'rgba(34, 197, 94, 0.95)'  // green-500 when pinned
        : 'rgba(59, 130, 246, 0.95)'; // blue-500 default
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

      // Draw timestamp text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x, boxY + 4);
    }

    // Draw value indicators on Y-axis for each dataset
    if (chart.tooltip?._active?.length) {
      chart.tooltip._active.forEach((activeElement: any, index: number) => {
        const dataset = chart.data.datasets[activeElement.datasetIndex];
        const y = activeElement.element.y;
        const color = dataset.borderColor || dataset.backgroundColor || '#666';

        // Draw horizontal line to Y-axis
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(x, y);
        ctx.lineWidth = 1;
        ctx.strokeStyle = typeof color === 'string' ? color : '#666';
        ctx.setLineDash([3, 3]);
        ctx.globalAlpha = 0.3;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Draw dot at intersection
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = typeof color === 'string' ? color : '#666';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    // Draw pin indicator if pinned
    if (state.isPinned) {
      const pinSize = 12;
      const pinX = x;
      const pinY = chartArea.top - 28;

      ctx.fillStyle = 'rgba(34, 197, 94, 0.95)';
      ctx.beginPath();
      ctx.arc(pinX, pinY, pinSize / 2, 0, 2 * Math.PI);
      ctx.fill();

      // Draw pin icon (simplified)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pinX, pinY - 3);
      ctx.lineTo(pinX, pinY + 3);
      ctx.stroke();
    }

    ctx.restore();
  }
};

// Register the advanced crosshair plugin
ChartJS.register(advancedCrosshairPlugin);

export type ChartType = 'line' | 'area' | 'bar' | 'pie' | 'doughnut' | 'polarArea' | 'scatter';

export interface ChartDataPoint {
  x?: string | number;
  y?: number;
  label?: string;
  value?: number;
}

export interface ChartSeries {
  label: string;
  data: ChartDataPoint[] | number[];
  backgroundColor?: string | string[];
  borderColor?: string;
  borderWidth?: number;
  fill?: boolean | string;
  tension?: number;
  pointRadius?: number;
  pointHoverRadius?: number;
}

export interface GradientConfig {
  type: 'linear' | 'radial';
  colors: Array<{
    offset: number;
    color: string;
    opacity?: number;
  }>;
  direction?: 'horizontal' | 'vertical' | 'diagonal';
}

export interface ChartTheme {
  textColor: string;
  gridColor: string;
  backgroundColor: string;
  tooltipBg: string;
  tooltipTextColor: string;
}

export interface VisualChartProps {
  type: ChartType;
  data: ChartSeries[];
  labels?: string[];
  width?: number;
  height?: number;
  responsive?: boolean;
  maintainAspectRatio?: boolean;
  title?: string;
  subtitle?: string;
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  gradient?: GradientConfig;
  theme?: 'light' | 'dark' | 'auto';
  customTheme?: ChartTheme;
  animate?: boolean;
  animationDuration?: number;
  className?: string;
  onDataPointClick?: (dataPoint: ChartDataPoint, seriesIndex: number) => void;
  customOptions?: Partial<ChartOptions>;
  yAxisLabel?: string;
  xAxisLabel?: string;
  yAxisUnit?: string;
  formatValue?: (value: number) => string;
  formatTooltip?: (context: TooltipItem<any>) => string;
}

const DEFAULT_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
];


export const VisualChart: React.FC<VisualChartProps> = ({
  type,
  data,
  labels,
  width,
  height = 300,
  responsive = true,
  maintainAspectRatio = false,
  title,
  subtitle,
  showLegend = true,
  showGrid = true,
  showTooltip = true,
  gradient,
  theme = 'auto',
  customTheme,
  animate = true,
  animationDuration = 750,
  className,
  onDataPointClick,
  customOptions,
  yAxisLabel,
  xAxisLabel,
  yAxisUnit = '',
  formatValue,
  formatTooltip,
}) => {
  const chartRef = useRef<ChartJS<any>>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDark, setIsDark] = useState(false);


  // Detect theme
  useEffect(() => {
    const detectTheme = () => {
      if (theme === 'auto') {
        const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches ||
          document.documentElement.classList.contains('dark');
        setIsDark(isDarkMode);
      } else {
        setIsDark(theme === 'dark');
      }
    };

    detectTheme();
    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', detectTheme);
      return () => mediaQuery.removeEventListener('change', detectTheme);
    }
  }, [theme]);

  // Cleanup chart instance on unmount to prevent canvas reuse errors
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, []);

  // Generate gradient
  const createGradient = (canvas: HTMLCanvasElement, gradientConfig: GradientConfig) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    let gradient: CanvasGradient;

    if (gradientConfig.type === 'linear') {
      const { direction = 'vertical' } = gradientConfig;
      switch (direction) {
        case 'horizontal':
          gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
          break;
        case 'diagonal':
          gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
          break;
        default: // vertical
          gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      }
    } else {
      gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2
      );
    }

    gradientConfig.colors.forEach(colorStop => {
      const color = colorStop.opacity !== undefined
        ? `${colorStop.color}${Math.round(colorStop.opacity * 255).toString(16).padStart(2, '0')}`
        : colorStop.color;
      gradient.addColorStop(colorStop.offset, color);
    });

    return gradient;
  };

  // Get theme colors
  const getThemeColors = (): ChartTheme => {
    if (customTheme) return customTheme;

    return isDark ? {
      textColor: '#e5e7eb',
      gridColor: '#6b7280',
      backgroundColor: 'transparent',
      tooltipBg: 'rgba(11, 13, 19, 0.9)',
      tooltipTextColor: '#e5e7eb',
    } : {
      textColor: '#374151',
      gridColor: '#d1d5db',
      backgroundColor: 'transparent',
      tooltipBg: 'rgba(255, 255, 255, 0.9)',
      tooltipTextColor: '#374151',
    };
  };

  // Transform data for Chart.js
  const chartData = useMemo((): ChartData<any> => {
    const themeColors = getThemeColors();

    const datasets = data.map((series, index) => {
      const defaultColor = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      const canvas = canvasRef.current;

      let backgroundColor = series.backgroundColor || defaultColor;
      let borderColor = series.borderColor || defaultColor;

      // Apply gradient if specified and canvas is available
      if (gradient && canvas && (type === 'line' || type === 'area' || type === 'bar')) {
        const gradientFill = createGradient(canvas, gradient);
        if (gradientFill) {
          backgroundColor = gradientFill as any;
        }
      } else if (type === 'area' && !series.backgroundColor) {
        backgroundColor = `${defaultColor}33`; // 20% opacity
      }

      const baseConfig = {
        label: series.label,
        data: series.data,
        backgroundColor,
        borderColor,
        borderWidth: series.borderWidth || (type === 'line' || type === 'area' ? 2 : 1),
        fill: type === 'area' ? true : (series.fill ?? false),
        tension: series.tension || (type === 'line' || type === 'area' ? 0.4 : 0),
        pointRadius: series.pointRadius || 0,
        pointHoverRadius: series.pointHoverRadius || 0,
      };

      // Type-specific configurations
      switch (type) {
        case 'pie':
        case 'doughnut':
        case 'polarArea':
          return {
            ...baseConfig,
            backgroundColor: Array.isArray(series.backgroundColor)
              ? series.backgroundColor
              : DEFAULT_COLORS.slice(0, (series.data as number[]).length),
            borderWidth: 1,
            borderColor: themeColors.backgroundColor,
          };
        default:
          return baseConfig;
      }
    });

    return {
      labels: labels || [],
      datasets,
    };
  }, [data, labels, gradient, isDark, type, customTheme]);

  // Chart options
  const options = useMemo((): ChartOptions<any> => {
    const themeColors = getThemeColors();

    const baseOptions: ChartOptions<any> = {
      responsive,
      maintainAspectRatio,
      animation: animate ? {
        duration: animationDuration,
        easing: 'easeInOutQuart',
      } : false,
      interaction: {
        mode: 'index',  // Show all datasets at the same x-index
        intersect: false,  // Don't require exact intersection
        axis: 'x'  // Follow x-axis position
      },
      plugins: {
        // Advanced Grafana-style crosshair
        crosshair: {
          enabled: true,
          syncGroup: 'metrics',  // Sync all charts in the metrics view
          showTimestamp: true,    // Show time annotation
          pinnable: true,         // Click to pin/unpin
          color: 'rgba(59, 130, 246, 0.8)',  // Blue crosshair
          lineWidth: 1,
          lineDash: [5, 5]
        },
        title: {
          display: !!title,
          text: title,
          font: {
            size: 16,
            weight: 'bold',
          },
          color: themeColors.textColor,
        },
        subtitle: {
          display: !!subtitle,
          text: subtitle,
          font: {
            size: 12,
          },
          color: themeColors.textColor,
        },
        legend: {
          display: showLegend,
          labels: {
            color: themeColors.textColor,
            usePointStyle: true,
            padding: 20,
          },
          position: 'bottom' as const,
        },
        tooltip: {

          enabled: showTooltip,
          backgroundColor: themeColors.tooltipBg,
          titleColor: themeColors.tooltipTextColor,
          bodyColor: themeColors.tooltipTextColor,
          borderColor: themeColors.gridColor,
          cornerRadius: 4,
          displayColors: true,
          padding: 12,
          titleFont: {
            size: 14,
            weight: 'bold',
          },
          bodyFont: {
            size: 13,
          },
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          opacity: 0.95,
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (context: TooltipItem<any>) => {
              if (formatTooltip) {
                return formatTooltip(context);
              }

              const value = context.parsed.y ?? context.parsed;
              const formattedValue = formatValue ? formatValue(value) : `${value}${yAxisUnit}`;
              return `${context.dataset.label}: ${formattedValue}`;
            },
          },
        },
      },
      onClick: onDataPointClick ? (_event: any, elements: any[]) => {
        if (elements.length > 0) {
          const element = elements[0];
          const datasetIndex = element.datasetIndex;
          const index = element.index;
          const dataPoint = data[datasetIndex]?.data[index];
          if (dataPoint) {
            onDataPointClick(dataPoint as ChartDataPoint, datasetIndex);
          }
        }
      } : undefined,
    };

    // Add scales for chart types that support them
    if (['line', 'area', 'bar', 'scatter'].includes(type)) {
      baseOptions.scales = {
        x: {
          display: true,
          title: {
            display: !!xAxisLabel,
            text: xAxisLabel,
            color: themeColors.textColor,
          },
          grid: {
            display: showGrid,
            color: themeColors.gridColor,
            drawBorder: false,
          },
          ticks: {
            color: themeColors.textColor,
          },
        },
        y: {
          display: true,
          title: {
            display: !!yAxisLabel,
            text: yAxisLabel,
            color: themeColors.textColor,
          },
          grid: {
            display: showGrid,
            color: themeColors.gridColor,
            drawBorder: false,
          },
          ticks: {
            color: themeColors.textColor,
            callback: (value: any) => {
              const numValue = Number(value);
              return formatValue ? formatValue(numValue) : `${numValue}${yAxisUnit}`;
            },
          },
        },
      };
    }

    // Merge with custom options
    return { ...baseOptions, ...customOptions };
  }, [
    responsive,
    maintainAspectRatio,
    animate,
    animationDuration,
    title,
    subtitle,
    showLegend,
    showTooltip,
    showGrid,
    xAxisLabel,
    yAxisLabel,
    yAxisUnit,
    formatValue,
    formatTooltip,
    onDataPointClick,
    customOptions,
    isDark,
    customTheme,
    type,
    data,
  ]);

  // Render appropriate chart component  
  const renderChart = () => {
    const commonProps = {
      data: chartData,
      options,
      width,
      height: responsive ? undefined : height,
      ref: chartRef,
    };

    switch (type) {
      case 'line':
      case 'area':
        return <Line {...commonProps} />;
      case 'bar':
        return <Bar {...commonProps} />;
      case 'pie':
        return <Pie {...commonProps} />;
      case 'doughnut':
        return <Doughnut {...commonProps} />;
      case 'polarArea':
        return <PolarArea {...commonProps} />;
      case 'scatter':
        return <Scatter {...commonProps} />;
      default:
        return <Line {...commonProps} />;
    }
  };

  return (
    <div className={cn('relative w-full', className)}>
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
        width={width || 400}
        height={height}
      />
      {renderChart()}
    </div>
  );
};

export default VisualChart;