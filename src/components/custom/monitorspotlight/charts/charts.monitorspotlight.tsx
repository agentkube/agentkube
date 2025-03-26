import React from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, AreaChart, Area, CartesianGrid } from 'recharts';
import { MetricsPerNamespace } from "@/types/cluster";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface ChartProps {
  metrics: MetricsPerNamespace[];
  selectedNamespaces: string[];
}

export interface PodMetricsProps extends ChartProps {
  selectedPod?: string;
  onPodSelect?: (pod: string) => void;
  pods?: string[];
}

interface ChartConfig {
  title: string;
  type: 'namespace' | 'pod';
  component: React.FC<ChartProps | PodMetricsProps>;
}

const MetricsLegend: React.FC = () => (
  <div className="flex items-center gap-4">
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-sm" style={{
        background: "repeating-linear-gradient(45deg, #BCF0DA, #BCF0DA 2px, #057A55 2px, #057A55 4px)"
      }} />
      <span className="text-xs text-gray-600">Request</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-sm" style={{
        background: "repeating-linear-gradient(45deg, #FDE68A, #FDE68A 2px, #D97706 2px, #D97706 4px)"
      }} />
      <span className="text-xs text-gray-600">Limit</span>
    </div>
  </div>
);

const PodSelect: React.FC<{
  pods?: string[];
  selectedPod?: string;
  onSelect?: (pod: string) => void;
}> = ({ pods, selectedPod, onSelect }) => {
  if (!pods || !onSelect) return null;
  
  return (
    <Select value={selectedPod} onValueChange={onSelect}>
      <SelectTrigger className="w-[200px] bg-gray-50 border border-gray-400 rounded-[0.5rem]">
        <SelectValue placeholder="Select Pod" />
      </SelectTrigger>
      <SelectContent>
        {pods.map((pod) => (
          <SelectItem key={pod} value={pod}>
            {pod}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const ChartContainer: React.FC<{
  title: string;
  children: React.ReactNode;
  podSelector?: React.ReactNode;
}> = ({ title, children, podSelector }) => (
  <div className="flex flex-col">
    <div className="flex items-center justify-between">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="flex items-center gap-4">
        {podSelector}
        <MetricsLegend />
      </div>
    </div>
    <div className="h-56 flex mt-2">
      {children}
    </div>
  </div>
);

// Original MemoryChart for namespaces
const MemoryChart: React.FC<ChartProps> = ({ metrics, selectedNamespaces }) => {
  const chartData = metrics
    .filter(metric => selectedNamespaces.includes(metric.name))
    .map(metric => ({
      name: metric.name,
      value: parseFloat(metric.metrics.memory.request),
      limit: parseFloat(metric.metrics.memory.limit)
    }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -30, bottom: 0 }}>
        <defs>
          <pattern id="stripe-pattern" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="#BCF0DA" />
            <line x1="0" y1="0" x2="0" y2="4" stroke="#057A55" strokeWidth="2" />
          </pattern>
          <pattern id="limit-pattern" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="#FDE68A" />
            <line x1="0" y1="0" x2="0" y2="4" stroke="#D97706" strokeWidth="2" />
          </pattern>
        </defs>
        <XAxis dataKey="name" fontSize={12} tick={{ fill: '#666' }} />
        <YAxis fontSize={12} tick={{ fill: '#666' }} />
        <Tooltip
          contentStyle={{
            cursor: "pointer",
            background: '#f9fafb',
            border: '2px solid #e0e0e0',
            borderRadius: '8px',
            fontSize: '12px'
          }}
          formatter={(value: number) => `${value.toFixed(2)} MiB`}
        />
        <Bar
          dataKey="value"
          name="Request"
          fill="url(#stripe-pattern)"
          stroke="#057A55"
          strokeWidth={1}
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="limit"
          name="Limit"
          fill="url(#limit-pattern)"
          stroke="#D97706"
          strokeWidth={1}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

// Pod-specific Memory Chart
const PodMemoryChart: React.FC<PodMetricsProps> = ({ metrics, selectedNamespaces, selectedPod, onPodSelect, pods }) => {
  console.log(selectedPod, onPodSelect, pods)
  const chartData = metrics
    .filter(metric => selectedNamespaces.includes(metric.name))
    .map(metric => ({
      name: metric.name,
      usage: parseFloat(metric.metrics.memory.request || '0'),
      limit: parseFloat(metric.metrics.memory.limit)
    }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -30, bottom: 0 }}>
        <defs>
          <linearGradient id="memoryGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10B981" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" fontSize={12} tick={{ fill: '#666' }} />
        <YAxis fontSize={12} tick={{ fill: '#666' }} />
        <Tooltip
          contentStyle={{
            background: '#f9fafb',
            border: '2px solid #e0e0e0',
            borderRadius: '8px',
            fontSize: '12px'
          }}
          formatter={(value: number) => `${value.toFixed(2)} MiB`}
        />
        <Area 
          type="monotone" 
          dataKey="usage" 
          stroke="#10B981" 
          fill="url(#memoryGradient)"
          name="Usage"
        />
        <Area 
          type="monotone" 
          dataKey="limit" 
          stroke="#F59E0B" 
          fill="none" 
          strokeDasharray="5 5"
          name="Limit"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

// Original CPU Chart for namespaces
const CpuChart: React.FC<ChartProps> = ({ metrics, selectedNamespaces }) => {
  const chartData = metrics
    .filter(metric => selectedNamespaces.includes(metric.name))
    .map(metric => ({
      name: metric.name,
      value: parseFloat(metric.metrics.cpu.request),
      limit: parseFloat(metric.metrics.cpu.limit)
    }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -30, bottom: 5 }}>
        <defs>
          <pattern id="cpu-stripe-pattern" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="#BCF0DA" />
            <line x1="0" y1="0" x2="0" y2="4" stroke="#057A55" strokeWidth="2" />
          </pattern>
          <pattern id="cpu-limit-pattern" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="#FDE68A" />
            <line x1="0" y1="0" x2="0" y2="4" stroke="#D97706" strokeWidth="2" />
          </pattern>
        </defs>
        <XAxis dataKey="name" fontSize={12} tick={{ fill: '#666' }} />
        <YAxis fontSize={12} tick={{ fill: '#666' }} />
        <Tooltip
          contentStyle={{
            cursor: "pointer",
            background: '#f9fafb',
            border: '2px solid #e0e0e0',
            borderRadius: '8px',
            fontSize: '12px'
          }}
          formatter={(value: number) => `${value.toFixed(2)} Units`}
        />
        <Bar
          dataKey="value"
          name="Request"
          fill="url(#cpu-stripe-pattern)"
          stroke="#057A55"
          strokeWidth={1}
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="limit"
          name="Limit"
          fill="url(#cpu-limit-pattern)"
          stroke="#D97706"
          strokeWidth={1}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

// Pod-specific CPU Chart
const PodCpuChart: React.FC<PodMetricsProps> = ({ metrics, selectedNamespaces, selectedPod, onPodSelect, pods }) => {
  console.log(selectedPod, onPodSelect, pods)
  const chartData = metrics
    .filter(metric => selectedNamespaces.includes(metric.name))
    .map(metric => ({
      name: metric.name,
      usage: parseFloat(metric.metrics.cpu.request || '0'),
      limit: parseFloat(metric.metrics.cpu.limit)
    }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -30, bottom: 0 }}>
        <defs>
          <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" fontSize={12} tick={{ fill: '#666' }} />
        <YAxis fontSize={12} tick={{ fill: '#666' }} />
        <Tooltip
          contentStyle={{
            background: '#f9fafb',
            border: '2px solid #e0e0e0',
            borderRadius: '8px',
            fontSize: '12px'
          }}
          formatter={(value: number) => `${value.toFixed(2)} Units`}
        />
        <Area 
          type="monotone" 
          dataKey="usage" 
          stroke="#3B82F6" 
          fill="url(#cpuGradient)"
          name="Usage"
        />
        <Area 
          type="monotone" 
          dataKey="limit" 
          stroke="#F59E0B" 
          fill="none" 
          strokeDasharray="5 5"
          name="Limit"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

// Network Traffic Chart

export const charts: ChartConfig[] = [
  {
    title: "Memory Usage by Namespace (MiB)",
    type: 'namespace',
    component: ({ metrics, selectedNamespaces }) => (
      <ChartContainer title="Memory Usage by Namespace (MiB)">
        <MemoryChart metrics={metrics} selectedNamespaces={selectedNamespaces} />
      </ChartContainer>
    )
  },
  {
    title: "CPU Usage by Namespace",
    type: 'namespace',
    component: ({ metrics, selectedNamespaces }) => (
      <ChartContainer title="CPU Usage by Namespace">
        <CpuChart metrics={metrics} selectedNamespaces={selectedNamespaces} />
      </ChartContainer>
    )
  },
  {
    title: "Pod Memory Usage (Beta)",
    type: 'pod',
    component: ({ metrics, selectedNamespaces, selectedPod, onPodSelect, pods }: PodMetricsProps) => (
      <ChartContainer 
        title="Pod Memory Usage (Beta)"
        podSelector={
          <PodSelect 
            pods={pods} 
            selectedPod={selectedPod} 
            onSelect={onPodSelect}
          />
        }
      >
        <PodMemoryChart 
          metrics={metrics} 
          selectedNamespaces={selectedNamespaces}
          selectedPod={selectedPod}
          onPodSelect={onPodSelect}
          pods={pods}
        />
      </ChartContainer>
    )
  },
  {
    title: "Pod CPU Usage (Beta)",
    type: 'pod',
    component: ({ metrics, selectedNamespaces, selectedPod, onPodSelect, pods }: PodMetricsProps) => (
      <ChartContainer 
        title="Pod CPU Usage (Beta)"
        podSelector={
          <PodSelect 
            pods={pods} 
            selectedPod={selectedPod} 
            onSelect={onPodSelect}
          />
        }
      >
        <PodCpuChart 
          metrics={metrics} 
          selectedNamespaces={selectedNamespaces}
          selectedPod={selectedPod}
          onPodSelect={onPodSelect}
          pods={pods}
        />
      </ChartContainer>
    )
  },
];