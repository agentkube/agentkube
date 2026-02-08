import { TimeSeriesSeries } from './time-series-chart.component';

export const generateMockTimeSeriesData = (
  startTime: Date = new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
  endTime: Date = new Date(),
  intervalMinutes: number = 5
): TimeSeriesSeries[] => {
  const timestamps: number[] = [];
  const current = new Date(startTime);
  
  while (current <= endTime) {
    timestamps.push(Math.floor(current.getTime() / 1000));
    current.setMinutes(current.getMinutes() + intervalMinutes);
  }

  return [
    {
      label: 'CPU Usage (%)',
      color: '#3b82f6',
      data: timestamps.map(timestamp => ({
        timestamp,
        value: Math.random() * 100
      }))
    },
    {
      label: 'Memory Usage (%)',
      color: '#ef4444',
      data: timestamps.map(timestamp => ({
        timestamp,
        value: 30 + Math.random() * 60
      }))
    },
    {
      label: 'Network I/O (MB/s)',
      color: '#10b981',
      data: timestamps.map(timestamp => ({
        timestamp,
        value: Math.random() * 50
      }))
    },
    {
      label: 'Disk Usage (%)',
      color: '#f59e0b',
      data: timestamps.map(timestamp => ({
        timestamp,
        value: 20 + Math.random() * 40
      }))
    }
  ];
};

export const generateSystemMetricsData = (): TimeSeriesSeries[] => {
  return generateMockTimeSeriesData();
};

export const generateApplicationMetricsData = (): TimeSeriesSeries[] => {
  const startTime = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago
  const endTime = new Date();
  const timestamps: number[] = [];
  const current = new Date(startTime);
  
  while (current <= endTime) {
    timestamps.push(Math.floor(current.getTime() / 1000));
    current.setMinutes(current.getMinutes() + 2);
  }

  return [
    {
      label: 'Requests/sec',
      color: '#8b5cf6',
      data: timestamps.map(timestamp => ({
        timestamp,
        value: 100 + Math.random() * 500
      }))
    },
    {
      label: 'Response Time (ms)',
      color: '#06b6d4',
      data: timestamps.map(timestamp => ({
        timestamp,
        value: 50 + Math.random() * 200
      }))
    },
    {
      label: 'Error Rate (%)',
      color: '#dc2626',
      data: timestamps.map(timestamp => ({
        timestamp,
        value: Math.random() * 5
      }))
    }
  ];
};

export const generateKubernetesMetricsData = (): TimeSeriesSeries[] => {
  const startTime = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 hours ago
  const endTime = new Date();
  const timestamps: number[] = [];
  const current = new Date(startTime);
  
  while (current <= endTime) {
    timestamps.push(Math.floor(current.getTime() / 1000));
    current.setMinutes(current.getMinutes() + 1);
  }

  return [
    {
      label: 'Pod Count',
      color: '#84cc16',
      data: timestamps.map(timestamp => ({
        timestamp,
        value: Math.floor(5 + Math.random() * 15)
      }))
    },
    {
      label: 'Container Restarts',
      color: '#f97316',
      data: timestamps.map(timestamp => ({
        timestamp,
        value: Math.floor(Math.random() * 3)
      }))
    },
    {
      label: 'Node CPU Usage (%)',
      color: '#6366f1',
      data: timestamps.map(timestamp => ({
        timestamp,
        value: 40 + Math.random() * 50
      }))
    }
  ];
};