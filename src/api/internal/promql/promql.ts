// api/internal/prometheus/promql.ts
import { PrometheusResponse } from '@/types/prometheus';

export interface ExecutePromQLRequest {
  query: string;
  start?: string;
  end?: string;
  step?: string;
  timestamp?: string;
}

export interface ChartSuggestion {
  type: 'time-series' | 'bar' | 'gauge' | 'table' | 'tree' | 'pie';
  reason: string;
}

export interface PromQLResult {
  data: PrometheusResponse;
  suggestedChart: ChartSuggestion;
}

export interface ConvertResponse {
  promql: string;
  explanation: string;
  warnings?: string[];
}


export const executePromQL = async (query: string, options: Partial<ExecutePromQLRequest> = {}): Promise<PromQLResult> => {
  const response = await fetch('http://localhost:8083/api/v1/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      ...options
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to execute PromQL query: ${response.statusText}`);
  }

  return response.json();
};

export const txtToPromQL = async (query: string): Promise<ConvertResponse> => {
  const response = await fetch('http://localhost:8083/api/v1/convert', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to convert query: ${response.statusText}`);
  }

  return response.json();
};
