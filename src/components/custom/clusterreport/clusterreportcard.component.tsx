import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Award, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Info, 
  Loader2, 
  AlertCircle, 
  TrendingUp,
  Shield,
  Eye,
  ArrowRight,
  ArrowUpRight
} from "lucide-react";
import { getClusterReport } from '@/api/cluster';
import { ClusterReport as ClusterReportType } from '@/types/cluster-report';
import { useNavigate } from 'react-router-dom';
import { useCluster } from '@/contexts/clusterContext';

interface ClusterReportCardProps {
  className?: string;
  showActions?: boolean;
}

const ClusterReportCard: React.FC<ClusterReportCardProps> = ({ 
  className = "", 
  showActions = true 
}) => {
  const [report, setReport] = useState<ClusterReportType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { currentContext } = useCluster();

  useEffect(() => {
    const fetchReport = async () => {
      if (!currentContext) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const reportData = await getClusterReport(currentContext.name);
        setReport(reportData);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch cluster report:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch cluster report');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [currentContext]);

  const getGradeColor = (grade: string): string => {
    switch (grade) {
      case 'A': return 'text-green-600 dark:text-green-400';
      case 'B': return 'text-blue-600 dark:text-blue-400';
      case 'C': return 'text-yellow-600 dark:text-yellow-400';
      case 'D': return 'text-orange-600 dark:text-orange-400';
      case 'F': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getScoreColor = (score: number): string => {
    if (score >= 90) return 'text-green-600 dark:text-green-400';
    if (score >= 75) return 'text-blue-600 dark:text-blue-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 40) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getProgressBarColor = (score: number): string => {
    if (score >= 90) return 'bg-green-500';
    if (score >= 75) return 'bg-blue-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getGradeBadgeStyle = (grade: string): string => {
    switch (grade) {
      case 'A': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      case 'B': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      case 'C': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300';
      case 'D': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300';
      case 'F': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const totalStats = report?.popeye.sections ? 
    report.popeye.sections.reduce((acc, section) => ({
      ok: acc.ok + (section.tally?.ok || 0),
      info: acc.info + (section.tally?.info || 0),
      warning: acc.warning + (section.tally?.warning || 0),
      error: acc.error + (section.tally?.error || 0)
    }), { ok: 0, info: 0, warning: 0, error: 0 }) :
    { ok: 0, info: 0, warning: 0, error: 0 };

  const handleViewReport = () => {
    navigate(`/dashboard/cluster-report`);
  };

  if (loading) {
    return (
      <Card className={`bg-transparent dark:bg-transparent ${className}`}>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          <span className="ml-2 text-gray-500">Loading cluster report...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`bg-transparent dark:bg-transparent ${className}`}>
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">Failed to load cluster report</span>
          </div>
          {/* <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{error}</p> */}
        </CardContent>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card className={`bg-transparent dark:bg-transparent ${className}`}>
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-gray-500">
            <Shield className="h-5 w-5" />
            <span className="text-sm">No cluster report available</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-transparent dark:bg-transparent border-none shadow-none  transition-shadow ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm uppercase font-medium text-gray-700 dark:text-gray-400">Cluster Report</h2>
          </div>
          {showActions && (
            <Button 
              variant="outline" 
              className='w-44 flex justify-between hover:backdrop-blur-md'
              onClick={handleViewReport}
            >
              View Report
              <ArrowUpRight className="w-3 h-3 mr-1" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4 pt-8">
        {/* Score and Grade */}
        <div className="flex items-end justify-between px-1">
          <div className="flex items-end gap-3">
            <div className="text-center">
              <div className="text-6xl font-light text-gray-500 dark:text-gray-200">
                {report.popeye.score}
              </div>
              <div className="text-lg text-gray-500 dark:text-gray-500">score</div>
            </div>
            <div className="flex-1 max-w-24">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor(report.popeye.score)}`}
                  style={{ width: `${report.popeye.score}%` }}
                />
              </div>
            </div>
          </div>
          
          <Badge className={`${getGradeBadgeStyle(report.popeye.grade)} text-sm font-semibold px-3 py-1`}>
            Grade {report.popeye.grade}
          </Badge>
        </div>

        {/* Issue Summary */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-900/10">
            <div className="flex items-center justify-center mb-1">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
            <div className="font-light text-green-600 dark:text-green-400 text-md">
              {totalStats.ok}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">OK</div>
          </div>
          
          <div className="text-center p-2 rounded-lg bg-blue-50 dark:bg-blue-900/10">
            <div className="flex items-center justify-center mb-1">
              <Info className="w-4 h-4 text-blue-600" />
            </div>
            <div className="font-light text-blue-600 dark:text-blue-400 text-md">
              {totalStats.info}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Info</div>
          </div>
          
          <div className="text-center p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/10">
            <div className="flex items-center justify-center mb-1">
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
            </div>
            <div className="font-light text-yellow-600 dark:text-yellow-400 text-md">
              {totalStats.warning}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Warn</div>
          </div>
          
          <div className="text-center p-2 rounded-lg bg-red-50 dark:bg-red-900/10">
            <div className="flex items-center justify-center mb-1">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <div className="font-light text-red-600 dark:text-red-400 text-md">
              {totalStats.error}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Error</div>
          </div>
        </div>

        {/* Report Info */}
        {/* <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              <span>{report.popeye.sections?.length || 0} sections analyzed</span>
            </div>
            <span>
              {new Date(report.popeye.report_time).toLocaleDateString()}
            </span>
          </div>
        </div> */}

        {/* Priority Issues (if any) */}
        {/* {totalStats.error > 0 && (
          <div className="bg-red-50 dark:bg-red-900/10 rounded-lg p-2">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <XCircle className="w-4 h-4" />
              <span className="text-sm font-medium">
                {totalStats.error} critical issue{totalStats.error !== 1 ? 's' : ''} found
              </span>
            </div>
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">
              Immediate attention required
            </p>
          </div>
        )} */}

        {/* All Good */}
        {totalStats.error === 0 && totalStats.warning === 0 && totalStats.ok > 0 && (
          <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-2">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">
                All checks passed
              </span>
            </div>
            <p className="text-xs text-green-500 dark:text-green-400 mt-1">
              Cluster follows security best practices
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ClusterReportCard;