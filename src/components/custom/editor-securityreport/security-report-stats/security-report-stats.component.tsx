import React from 'react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { MisconfigurationReport } from '@/types/scanner/misconfiguration-report';

interface SecurityReportStatsProps {
  report: MisconfigurationReport | null;
}

interface VulnerabilityData {
  name: string;
  value: number;
  percentage: string;
  color: string;
}

interface SeverityCounts {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  NONE: number;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-gray-100 dark:bg-[#0B0D13]/30 backdrop-blur-md p-2 text-xs rounded-[0.5rem] shadow border border-gray-200 dark:border-gray-800">
        <p className="font-semibold font-[Anton] text-lg">SEVERITY <span className='font-bold uppercase text-gray-400'>{data.name}</span></p>
        <p className="text-gray-600 dark:text-gray-200">Total: <span className='font-bold'>{data.value}</span></p>
        <p className="text-gray-600 dark:text-gray-200">Percentage: <span className='font-bold'>{data.percentage}</span></p>
      </div>
    );
  }
  return null;
};

const SecurityReportStats: React.FC<SecurityReportStatsProps> = ({ report }) => {
  if (!report?.Results?.[0]?.MisconfSummary) return null;
  
  // const summary = report.Results[0].MisconfSummary;
  const misconfigurations = report.Results[0].Misconfigurations || [];
  
  const initialSeverityCounts: SeverityCounts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    NONE: 0
  };

  const severityCounts = misconfigurations.reduce((acc: SeverityCounts, misconfig) => {
    const severity = misconfig.Severity.toUpperCase() as keyof SeverityCounts;
    if (severity in acc) {
      acc[severity] += 1;
    }
    return acc;
  }, initialSeverityCounts);

  const totalVulnerabilities = Object.values(severityCounts).reduce((a, b) => a + b, 0);

  const vulnerabilityData: VulnerabilityData[] = [
    { 
      name: 'Critical', 
      value: severityCounts.CRITICAL,
      percentage: `${((severityCounts.CRITICAL / totalVulnerabilities) * 100).toFixed(1)}%`,
      color: '#F05252'
    },
    { 
      name: 'High', 
      value: severityCounts.HIGH,
      percentage: `${((severityCounts.HIGH / totalVulnerabilities) * 100).toFixed(1)}%`,
      color: '#F98080'
    },
    { 
      name: 'Medium', 
      value: severityCounts.MEDIUM,
      percentage: `${((severityCounts.MEDIUM / totalVulnerabilities) * 100).toFixed(1)}%`,
      color: '#FACA15'
    },
    { 
      name: 'Low', 
      value: severityCounts.LOW,
      percentage: `${((severityCounts.LOW / totalVulnerabilities) * 100).toFixed(1)}%`,
      color: '#6875F5'
    },
    { 
      name: 'None', 
      value: severityCounts.NONE,
      percentage: `${((severityCounts.NONE / totalVulnerabilities) * 100).toFixed(1)}%`,
      color: '#31C48D'
    }
  ];

  return (
    <div className="gap-16 px-6 py-4 bg-gray-100 dark:bg-transparent rounded-xl">
      <div className="flex items-center gap-8">
        <div className="w-56 h-56">
          <PieChart width={230} height={230}>
            <Pie
              data={vulnerabilityData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={100}
            >
              {vulnerabilityData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </div>
        <div className='text-4xl font-[Anton] '>
          <div className="font-bold mb-1">TOTAL VULNERABILITIES</div>
          <div className="text-gray-400">{totalVulnerabilities}</div>
        </div>
      </div>
      
      <div className="flex justify-between text-xs py-4">
        {vulnerabilityData.map((item, index) => (
          <div 
            key={index} 
            className="px-4"
            style={{ borderLeft: `4px solid ${item.color}` }}
          >
            <div className="font-bold text-gray-600 dark:text-gray-300 uppercase">{item.name}</div>
            <div className="text-xl font-bold text-gray-600 dark:text-gray-200">{item.value.toString()}</div>
            <div className="text-gray-500 dark:text-gray-200">{item.percentage}</div>
          </div>
        ))}
        {/* <div className="border-l-4 border-gray-400 pl-4">
          <div className="font-bold text-gray-600 uppercase">N/A</div>
          <div className="text-xl font-bold">0</div>
          <div className="text-gray-500">0%</div>
        </div> */}
      </div>
    </div>
  );
};

export default SecurityReportStats;