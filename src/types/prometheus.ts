// types/prometheus.ts

// Metric labels type
export interface MetricLabels {
  __name__?: string;
  job?: string;
  instance?: string;
  [key: string]: string | undefined;
}

// Sample value type [timestamp, value]
export type SampleValue = [number, string];

// Vector result type for instant queries
export interface InstantSample {
  metric: MetricLabels;
  value: SampleValue;
}

// Matrix result type for range queries
export interface RangeSample {
  metric: MetricLabels;
  values: SampleValue[];
}

// Unified result type that can handle both instant and range queries
export interface PrometheusResult {
  metric: MetricLabels;
  value?: SampleValue;    // For instant queries
  values?: SampleValue[]; // For range queries
}

// Response data structure
export interface PrometheusData {
  resultType: 'vector' | 'matrix' | 'scalar' | 'string';
  result: PrometheusResult[];
}

// Complete Prometheus response
export interface PrometheusResponse {
  status: 'success' | 'error';
  data?: PrometheusData;
  errorType?: string;
  error?: string;
  warnings?: string[];
}

// Chart suggestion types
export type ChartType = 'time-series' | 'bar' | 'gauge' | 'table' | 'tree' | 'pie';

export interface ChartSuggestion {
  type: ChartType;
  reason: string;
}

// Complete API response including chart suggestion
export interface PromQLExecuteResponse {
  status: 'success' | 'error';
  data: PrometheusResponse;
  suggestedChart: ChartSuggestion;
}

// Example transformation helper
export function transformPromResultToChartData(response: PrometheusResponse): any[] {
  if (!response.data || !response.data.result) {
    return [];
  }

  switch (response.data.resultType) {
    case 'vector':
      return response.data.result.map(result => ({
        name: Object.entries(result.metric)
          .filter(([key]) => key !== '__name__')
          .map(([key, value]) => `${key}=${value}`)
          .join(', '),
        value: Number(result.value?.[1] || 0)
      }));

    case 'matrix':
      return response.data.result.flatMap(result => 
        (result.values || []).map(([timestamp, value]) => ({
          timestamp: new Date(timestamp * 1000),
          value: Number(value),
          ...result.metric
        }))
      );

    default:
      return [];
  }
}