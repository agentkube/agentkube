"use client"

import { useEffect, useState } from 'react';
import { Activity, TrendingDown, TrendingUp } from "lucide-react"
import {
  CartesianGrid,
  Dot,
  Line,
  LineChart,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  LabelList,
  Area,
  AreaChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  Label,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer
} from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import ChartHeader from "./chartheader.component";

type ThemeType = 'blue' | 'orange' | 'green' | 'yellow' | 'gray' | 'neutral';

// Theme colors
const themeColors: Record<ThemeType, string[]> = {
  blue: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'],
  orange: ['#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa'],
  green: ['#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0'],
  yellow: ['#eab308', '#f59e0b', '#fbbf24', '#fcd34d', '#fde047'],
  gray: ['#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6'],
  neutral: ['#525252', '#737373', '#a3a3a3', '#d4d4d4', '#e5e5e5']
};

// Chart 1: CPU Usage by Node
const cpuUsageData = [
  { node: "node-1", usage: 75 },
  { node: "node-2", usage: 65 },
  { node: "node-3", usage: 82 },
  { node: "node-4", usage: 58 },
  { node: "node-5", usage: 45 },
]

export function ChartLineDotsColors() {
  const [currentTheme, setCurrentTheme] = useState<ThemeType>('orange');

  const themedCpuUsageData = cpuUsageData.map((item, index) => ({
    ...item,
    fill: themeColors[currentTheme][index] || themeColors[currentTheme][0]
  }));

  const cpuUsageConfig = {
    usage: {
      label: "CPU Usage %",
      color: themeColors[currentTheme][0],
    },
  } satisfies ChartConfig

  return (
    <Card className="min-w-[400px]">
      <ChartHeader
        title="CPU Usage by Node"
        description="Real-time Kubernetes cluster metrics"
        onThemeChange={(theme) => setCurrentTheme(theme as ThemeType)}
        onExport={() => console.log('Export chart')}
        onViewDetails={() => console.log('View details')}
      />
      <CardContent className="w-full">
        <ChartContainer config={cpuUsageConfig} className="h-[200px] w-full">
          <LineChart
            accessibilityLayer
            data={themedCpuUsageData}
            margin={{
              top: 24,
              left: 24,
              right: 24,
            }}
          >
            <CartesianGrid vertical={false} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="line"
                  nameKey="usage"
                  hideLabel
                />
              }
            />
            <Line
              dataKey="usage"
              type="natural"
              stroke={themeColors[currentTheme][0]}
              strokeWidth={2}
              dot={({ payload, ...props }) => {
                return (
                  <Dot
                    key={payload.node}
                    r={5}
                    cx={props.cx}
                    cy={props.cy}
                    fill={payload.fill}
                    stroke={payload.fill}
                  />
                )
              }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Average CPU usage: 65% <TrendingUp className="h-4 w-4" />
        </div>
        <div className="text-muted-foreground leading-none">
          Monitoring 5 Kubernetes nodes in the cluster
        </div>
      </CardFooter>
    </Card>
  )
}

// Chart 2: Memory Usage by Namespace
const memoryUsageData = [
  { namespace: "kube-system", used: 2.4, available: 1.6 },
  { namespace: "monitoring", used: 3.2, available: 2.8 },
  { namespace: "ingress-nginx", used: 1.8, available: 2.2 },
  { namespace: "default", used: 1.2, available: 2.8 },
  { namespace: "cert-manager", used: 0.8, available: 1.2 },
  { namespace: "prometheus", used: 4.1, available: 1.9 },
]

export function ChartBarStacked() {
  const [currentTheme, setCurrentTheme] = useState<ThemeType>('orange');

  const memoryUsageConfig = {
    used: {
      label: "Used (GB)",
      color: themeColors[currentTheme][0],
    },
    available: {
      label: "Available (GB)",
      color: themeColors[currentTheme][1],
    },
  } satisfies ChartConfig

  return (
    <Card className="w-full">
      <ChartHeader
        title="Memory Usage by Namespace"
        description="Current memory allocation across K8s namespaces"
        onThemeChange={(theme) => setCurrentTheme(theme as ThemeType)}
        onExport={() => console.log('Export chart')}
        onViewDetails={() => console.log('View details')}
      />
      <CardContent className="w-full">
        <ChartContainer config={memoryUsageConfig} className='h-[200px] w-full'>
          <BarChart accessibilityLayer data={memoryUsageData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="namespace"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value.slice(0, 8)}
            />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="used"
              stackId="a"
              fill={themeColors[currentTheme][0]}
              radius={[0, 0, 4, 4]}
            />
            <Bar
              dataKey="available"
              stackId="a"
              fill={themeColors[currentTheme][1]}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Total memory usage: 13.5GB <TrendingUp className="h-4 w-4" />
        </div>
        <div className="text-muted-foreground leading-none">
          Prometheus monitoring across 6 active namespaces
        </div>
      </CardFooter>
    </Card>
  )
}

// Chart 3: Pod Status Distribution
const podStatusData = [
  { status: "Running", count: 147 },
  { status: "Pending", count: 12 },
  { status: "Failed", count: 8 },
  { status: "Succeeded", count: 23 },
  { status: "Unknown", count: 4 },
  { status: "CrashLoopBackOff", count: 3 },
]

export function ChartBarLabelCustom() {
  const [currentTheme, setCurrentTheme] = useState<ThemeType>('orange');

  const podStatusConfig = {
    count: {
      label: "Pod Count",
      color: themeColors[currentTheme][0],
    },
    label: {
      color: "var(--background)",
    },
  } satisfies ChartConfig

  return (
    <Card className="min-w-[400px]">
      <ChartHeader
        title="Pod Status Distribution"
        description="Current pod states across all namespaces"
        onThemeChange={(theme) => setCurrentTheme(theme as ThemeType)}
        onExport={() => console.log('Export chart')}
        onViewDetails={() => console.log('View details')}
      />
      <CardContent className="w-full">
        <ChartContainer config={podStatusConfig} className="h-[200px] w-full">
          <BarChart
            accessibilityLayer
            data={podStatusData}
            layout="vertical"
            margin={{
              right: 16,
            }}
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="status"
              type="category"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value.slice(0, 8)}
              hide
            />
            <XAxis dataKey="count" type="number" hide />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Bar
              dataKey="count"
              layout="vertical"
              fill={themeColors[currentTheme][0]}
              radius={4}
            >
              <LabelList
                dataKey="status"
                position="insideLeft"
                offset={8}
                className="fill-white"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          197 total pods running <TrendingUp className="h-4 w-4" />
        </div>
        <div className="text-muted-foreground leading-none">
          Kubernetes cluster health monitored by Prometheus
        </div>
      </CardFooter>
    </Card>
  )
}

// Chart 4: Network Traffic (Area Step Chart)
const networkTrafficData = [
  { month: "January", ingress: 1860 },
  { month: "February", ingress: 3050 },
  { month: "March", ingress: 2370 },
  { month: "April", ingress: 730 },
  { month: "May", ingress: 2090 },
  { month: "June", ingress: 2140 },
]

export function ChartNetworkTrafficStep() {
  const [currentTheme, setCurrentTheme] = useState<ThemeType>('blue');

  const networkTrafficConfig = {
    ingress: {
      label: "Ingress Traffic (GB)",
      color: themeColors[currentTheme][0],
      icon: Activity,
    },
  } satisfies ChartConfig

  return (
    <Card className="w-full">
      <ChartHeader
        title="Network Traffic - Ingress"
        description="Monthly ingress traffic across all services"
        onThemeChange={(theme) => setCurrentTheme(theme as ThemeType)}
        onExport={() => console.log('Export chart')}
        onViewDetails={() => console.log('View details')}
      />
      <CardContent className="w-full">
        <ChartContainer config={networkTrafficConfig} className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              accessibilityLayer
              data={networkTrafficData}
              margin={{
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => value.slice(0, 3)}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Area
                dataKey="ingress"
                type="step"
                fill={themeColors[currentTheme][0]}
                fillOpacity={0.4}
                stroke={themeColors[currentTheme][0]}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
      <CardFooter>
        <div className="flex w-full items-start gap-2 text-sm">
          <div className="grid gap-2">
            <div className="flex items-center gap-2 leading-none font-medium">
              Network usage up by 8.4% this month <TrendingUp className="h-4 w-4" />
            </div>
            <div className="text-muted-foreground flex items-center gap-2 leading-none">
              Kubernetes ingress controller metrics
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}

// Chart 5: Service Health Radar
const serviceHealthData = [
  { metric: "Availability", frontend: 98, backend: 95 },
  { metric: "Response Time", frontend: 92, backend: 88 },
  { metric: "Error Rate", frontend: 94, backend: 91 },
  { metric: "Throughput", frontend: 89, backend: 93 },
  { metric: "CPU Usage", frontend: 85, backend: 82 },
  { metric: "Memory Usage", frontend: 87, backend: 89 },
]

export function ChartServiceHealthRadar() {
  const [currentTheme, setCurrentTheme] = useState<ThemeType>('yellow');

  const serviceHealthConfig = {
    frontend: {
      label: "Frontend Services",
      color: themeColors[currentTheme][0],
    },
    backend: {
      label: "Backend Services",
      color: themeColors[currentTheme][1],
    },
  } satisfies ChartConfig

  return (
    <Card className="min-w-[400px]">
      <ChartHeader
        title="Service Health Metrics"
        description="Performance comparison across service types"
        onThemeChange={(theme) => setCurrentTheme(theme as ThemeType)}
        onExport={() => console.log('Export chart')}
        onViewDetails={() => console.log('View details')}
      />
      <CardContent className="max-w-[500px] mx-auto pb-0">
        <ChartContainer
          config={serviceHealthConfig}
          // h-[200px] w-full
          className="mx-auto aspect-square max-h-[250px]"
        >
          <RadarChart data={serviceHealthData}>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <PolarAngleAxis dataKey="metric" />
            <PolarGrid radialLines={false} />
            <Radar
              dataKey="frontend"
              fill={themeColors[currentTheme][0]}
              fillOpacity={0}
              stroke={themeColors[currentTheme][0]}
              strokeWidth={2}
            />
            <Radar
              dataKey="backend"
              fill={themeColors[currentTheme][1]}
              fillOpacity={0}
              stroke={themeColors[currentTheme][1]}
              strokeWidth={2}
            />
          </RadarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="flex items-center gap-2 leading-none font-medium">
          Overall health improved by 3.1% <TrendingUp className="h-4 w-4" />
        </div>
        <div className="text-muted-foreground flex items-center gap-2 leading-none">
          Real-time service monitoring via Prometheus
        </div>
      </CardFooter>
    </Card>
  )
}

// Chart 6: Storage Utilization (Radial Stacked)
const storageUtilizationData = [{ month: "current", persistent: 750, ephemeral: 280 }]

export function ChartStorageUtilizationRadial() {
  const [currentTheme, setCurrentTheme] = useState<ThemeType>('green');

  const storageUtilizationConfig = {
    persistent: {
      label: "Persistent Storage (GB)",
      color: themeColors[currentTheme][0],
    },
    ephemeral: {
      label: "Ephemeral Storage (GB)",
      color: themeColors[currentTheme][1],
    },
  } satisfies ChartConfig

  const totalStorage = storageUtilizationData[0].persistent + storageUtilizationData[0].ephemeral

  return (
    <Card className="flex flex-col min-w-[400px]">
      <ChartHeader
        title="Storage Utilization"
        description="Current cluster storage breakdown"
        onThemeChange={(theme) => setCurrentTheme(theme as ThemeType)}
        onExport={() => console.log('Export chart')}
        onViewDetails={() => console.log('View details')}
      />
      <CardContent className="flex flex-1 items-center pb-0">
        <ChartContainer
          config={storageUtilizationConfig}
          className="mx-auto aspect-square w-full max-w-[250px]"
        >
          <RadialBarChart
            data={storageUtilizationData}
            endAngle={180}
            innerRadius={80}
            outerRadius={130}
          >
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) - 16}
                          className="fill-foreground text-2xl font-bold"
                        >
                          {totalStorage}GB
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 4}
                          className="fill-muted-foreground"
                        >
                          Total Storage
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </PolarRadiusAxis>
            <RadialBar
              dataKey="persistent"
              stackId="a"
              cornerRadius={5}
              fill={themeColors[currentTheme][0]}
              className="stroke-transparent stroke-2"
            />
            <RadialBar
              dataKey="ephemeral"
              fill={themeColors[currentTheme][1]}
              stackId="a"
              cornerRadius={5}
              className="stroke-transparent stroke-2"
            />
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="flex items-center gap-2 leading-none font-medium">
          Storage efficiency up by 12.3% <TrendingUp className="h-4 w-4" />
        </div>
        <div className="text-muted-foreground leading-none">
          Persistent volumes and ephemeral storage across cluster
        </div>
      </CardFooter>
    </Card>
  )
}


// Chart 7: Crypto Portfolio Performance
const cryptoPortfolioData = [
  { date: "2024-01", value: 145000 },
  { date: "2024-02", value: 152000 },
  { date: "2024-03", value: 148000 },
  { date: "2024-04", value: 165000 },
  { date: "2024-05", value: 172000 },
  { date: "2024-06", value: 185267 },
]

export function ChartCryptoPortfolio() {
  const [currentTheme, setCurrentTheme] = useState<ThemeType>('blue');
  const [cryptoData, setCryptoData] = useState(cryptoPortfolioData);

  // Optional: Replace with real API data
  useEffect(() => {
    // You can uncomment and modify this to use real crypto data
    const endTimestamp = Date.now();
    const startTimestamp = endTimestamp - 6 * 30 * 24 * 60 * 60 * 1000;
    
    fetch(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=usd&from=${startTimestamp / 1000}&to=${endTimestamp / 1000}`)
      .then((response) => response.json())
      .then((data) => {
        const prices = data.prices.map((price: any) => ({
          date: new Date(price[0]).toISOString().slice(0, 7), // YYYY-MM format
          value: price[1]
        }));
        setCryptoData(prices);
      })
      .catch((error) => console.error(error));
  }, []);

  const cryptoPortfolioConfig = {
    value: {
      label: "Portfolio Value",
      color: themeColors[currentTheme][0],
    },
  } satisfies ChartConfig

  const currentValue = cryptoData[cryptoData.length - 1]?.value || 185267;
  const previousValue = cryptoData[cryptoData.length - 2]?.value || 172000;
  const percentChange = ((currentValue - previousValue) / previousValue * 100).toFixed(1);
  const isPositive = Number(percentChange) > 0;

  return (
    <Card className="w-full">
      <ChartHeader
        title="Monthly Cost Trend"
        description="Visualize your portfolio activities data"
        onThemeChange={(theme) => setCurrentTheme(theme as ThemeType)}
        onExport={() => console.log('Export chart')}
        onViewDetails={() => console.log('View details')}
      />
      <CardContent className="w-full">
        <div className="mb-6 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">
              {currentValue.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </span>
            <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${
              isPositive 
                ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' 
                : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
            }`}>
              {isPositive ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {Math.abs(Number(percentChange))}%
            </div>
          </div>
        </div>
        
        <ChartContainer config={cryptoPortfolioConfig} className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cryptoData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid 
                vertical={false} 
                stroke="hsl(var(--border))" 
                strokeDasharray="3 3" 
                opacity={0.3}
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
                className="fill-muted-foreground"
                tickFormatter={(value) => {
                  // Format date to show month abbreviation
                  const date = new Date(value + '-01');
                  return date.toLocaleDateString('en-US', { month: 'short' });
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={11}
                className="fill-muted-foreground"
                width={60}
                tickFormatter={(value) => {
                  return `$${(value / 1000).toFixed(0)}k`;
                }}
              />
              <ChartTooltip
                cursor={{ 
                  stroke: themeColors[currentTheme][0], 
                  strokeWidth: 1,
                  strokeDasharray: '4 4'
                }}
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-lg border dark:bg-gray-900/20 backdrop-blur p-3 shadow-lg">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          {new Date(label + '-01').toLocaleDateString('en-US', { 
                            month: 'long', 
                            year: 'numeric' 
                          })}
                        </p>
                        <p className="text-sm font-bold">
                          {payload[0].value?.toLocaleString('en-US', {
                            style: 'currency',
                            currency: 'USD',
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={themeColors[currentTheme][0]}
                strokeWidth={2}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: themeColors[currentTheme][0],
                  stroke: 'hsl(var(--background))',
                  strokeWidth: 2,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}