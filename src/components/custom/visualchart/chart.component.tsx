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
import CrosshairPlugin from 'chartjs-plugin-crosshair';
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
  Filler,
  CrosshairPlugin
);

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
      plugins: {
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