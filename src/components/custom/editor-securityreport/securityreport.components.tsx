import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, AlertCircle, FileText, RefreshCcw, FlaskConical, TriangleAlert } from 'lucide-react';
import { MisconfigurationReport } from '@/types/scanner/misconfiguration-report';
import SecurityCodeBlock from './security-codeblock/security-codeblock.component';
import SecurityReportStats from './security-report-stats/security-report-stats.component';
import SecuritySuggestion from './security-suggestion/security-suggestion.component';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { openExternalUrl } from '@/api/external';

interface SecurityReportProps {
  yamlContent: string;
  report: MisconfigurationReport | null;
  isScanning: boolean;
  onScan: () => Promise<void>;
}

interface CodeLine {
  Number: number;
  Content: string;
  IsCause?: boolean;
}

const SecurityReport: React.FC<SecurityReportProps> = ({
  yamlContent,
  report,
  isScanning,
  onScan
}) => {
  const [scanning, _] = useState(false);
  const [selectedSeverities, setSelectedSeverities] = useState(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

  const severityOptions = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

  const handleSeverityToggle = (severity: string) => {
    setSelectedSeverities((current) =>
      current.includes(severity)
        ? current.filter((s) => s !== severity)
        : [...current, severity]
    );
  };

  const filteredMisconfigurations = report?.Results?.[0]?.Misconfigurations?.filter(
    (misconfig) => selectedSeverities.includes(misconfig.Severity.toUpperCase())
  ) || [];

  const getSeverityColor = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'CRITICAL':
        return 'text-red-600 border-red-400 border-red-200';
      case 'HIGH':
        return 'text-orange-600 border-orange-400 border-orange-200';
      case 'MEDIUM':
        return 'text-yellow-600 border-yellow-400 border-yellow-200';
      case 'LOW':
        return 'text-blue-600 border-blue-400 border-blue-200';
      default:
        return 'text-gray-600 border-gray-400 border-gray-200';
    }
  };

  const renderSummary = () => {
    if (!report?.Results?.[0]?.MisconfSummary) return null;
    const summary = report.Results[0].MisconfSummary;

    const total = summary.Successes + summary.Failures;
    const successPercentage = ((summary.Successes / total) * 100).toFixed(1);
    const failurePercentage = ((summary.Failures / total) * 100).toFixed(1);

    return (
      <div className="flex justify-end gap-4 mb-4 px-4 py-6 bg-gray-100 dark:bg-gray-900/40 rounded-[0.5rem]">
        <div className="flex items-center gap-2">
          <FlaskConical className="text-yellow-500 w-5 h-5" />
          <span className="text-sm">
            <span className="font-medium">{total} Tests</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <CheckCircle className="text-emerald-500 w-5 h-5" />
          <span className="text-sm">
            <span className="font-medium">{summary.Successes}</span> Passed ({successPercentage}%)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-red-500 w-5 h-5" />
          <span className="text-sm">
            <span className="font-medium">{summary.Failures}</span> Failed ({failurePercentage}%)
          </span>
        </div>
      </div>
    );
  };

  const formatCode = (lines: CodeLine[]): string => {
    return lines.map((line: CodeLine) => `${line.Content}`).join('\n');
  };

  const getHighlightedLines = (lines: CodeLine[]): number[] => {
    return lines
      .filter((line: CodeLine) => line.IsCause)
      .map((line: CodeLine) => line.Number);
  };

  return (
    <div className="p-4 h-full overflow-auto
      scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
      [&::-webkit-scrollbar]:w-1.5 
      [&::-webkit-scrollbar-track]:bg-transparent 
      [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
    ">
      <div className={`flex items-center gap-2 ${report ? 'justify-end' : 'justify-center mt-20'} mb-4`}>
        {report && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border border-gray-500 bg-gray-100 rounded-[0.4rem]">
                <TriangleAlert className="w-4 h-4" />
                Filter Severity
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48 bg-gray-100 rounded-[0.5rem]">
              {severityOptions.map((severity) => (
                <DropdownMenuCheckboxItem
                  key={severity}
                  checked={selectedSeverities.includes(severity)}
                  onCheckedChange={() => handleSeverityToggle(severity)}
                >
                  {severity.charAt(0) + severity.slice(1).toLowerCase()}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>)}

        <Button
          variant="outline"
          onClick={onScan}
          disabled={isScanning}
          className="border border-gray-500 bg-gray-100 rounded-[0.4rem]"
        >
          {!report ? <FileText className="w-4 h-4" /> : <RefreshCcw className="w-4 h-4" />}
          {scanning ? "Scanning..." : report ? "Re-Run Scan" : "Scan"}
        </Button>
      </div>

      {!report && !scanning && (
        <p className="text-center text-gray-500">
          Scan to check view vulnerabilities<br /> in configurations.
        </p>
      )}

      {report && (
        <div className="space-y-4">
          {report && <SecurityReportStats report={report} />}
          {renderSummary()}

          <div className="space-y-3">
            {filteredMisconfigurations.map((misconfig, index) => (
              <div key={index} className="rounded-[0.4rem] bg-gray-100 dark:bg-gray-900/40">
                <div
                  className={`p-4 border-l-4 rounded-[0.4rem] ${getSeverityColor(misconfig.Severity)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-medium text-black dark:text-gray-300">{misconfig.Title}</span>
                    </div>
                    <span className="text-xs font-medium px-2 py-1 rounded-[0.4rem] bg-gray-300 dark:bg-gray-800/50">
                      {misconfig.Severity}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{misconfig.Description}</p>

                  {misconfig.CauseMetadata?.Code?.Lines && (
                    <div className="mt-4">
                      <SecurityCodeBlock
                        code={formatCode(misconfig.CauseMetadata.Code.Lines)}
                        language="yaml"
                        highlightedLines={getHighlightedLines(misconfig.CauseMetadata.Code.Lines)}
                        startLine={misconfig.CauseMetadata.StartLine}
                      />
                    </div>
                  )}

                  {/* Security Suggestion Component */}
                  <SecuritySuggestion
                    yamlContent={yamlContent}
                    misconfiguration={misconfig}
                  />

                  <div className="mt-2 text-sm">
                    <a
                      onClick={() => openExternalUrl(misconfig.PrimaryURL)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Learn More
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SecurityReport;