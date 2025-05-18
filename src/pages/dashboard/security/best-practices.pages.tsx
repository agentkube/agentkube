import React from 'react';
import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Loader2, Shield, ExternalLink, Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { containerVariants, itemVariants } from "@/utils/styles.utils";
import { ClusterComplianceReport, ComplianceCheck } from "@/types/scanner/vulnerability-report";
import { TrivyNotInstalled } from "@/components/custom";
import { getSeverityColors } from "@/utils/severity.utils";
import {
  getClusterComplianceReports,
  getComplianceDetails,
  getTrivyStatus
} from '@/api/scanner/security';
import { useCluster } from '@/contexts/clusterContext';


const SEVERITY_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
type SeverityLevel = typeof SEVERITY_LEVELS[number];

const FILTER_OPTIONS = {
  clusters: "all-clusters",
  namespaces: "all-namespaces",
  labels: "all-labels",
} as const;

const BestPractices = () => {
  const [complianceReports, setComplianceReports] = useState<ClusterComplianceReport[]>([]);
  const [selectedStandard, setSelectedStandard] = useState<string>("");
  const [complianceChecks, setComplianceChecks] = useState<ComplianceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currentContext } = useCluster();
  const [isTrivyInstalled, setIsTrivyInstalled] = useState(false);

  // For the details drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedReportName, setSelectedReportName] = useState<string>("");

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<SeverityLevel | "all">("all");
  const [selectedCluster] = useState(FILTER_OPTIONS.clusters);
  const [selectedNamespace] = useState(FILTER_OPTIONS.namespaces);
  const [selectedLabels] = useState(FILTER_OPTIONS.labels);

  useEffect(() => {
    const checkTrivyStatus = async () => {
      if (!currentContext?.name) return;

      try {
        setLoading(true);
        const status = await getTrivyStatus(currentContext.name);
        setIsTrivyInstalled(status.installed);

        if (status.installed) {
          await fetchComplianceReports();
        }
      } catch (err) {
        console.error('Error checking Trivy status:', err);
        setIsTrivyInstalled(false);
        setError(err instanceof Error ? err.message : 'Failed to check Trivy status');
      } finally {
        setLoading(false);
      }
    };

    checkTrivyStatus();
  }, [currentContext?.name]);

  const fetchComplianceReports = async () => {
    if (!currentContext?.name) return;

    try {
      setLoading(true);
      // Get compliance reports from API
      const response = await getClusterComplianceReports(currentContext.name);

      // Check if response has expected structure
      if (response && response.reports && Array.isArray(response.reports)) {
        setComplianceReports(response.reports);

        // Select first standard if available
        if (response.reports.length > 0) {
          setSelectedStandard(response.reports[0].name);
          await fetchComplianceDetails(response.reports[0].name);
        }
      } else {
        console.error('Unexpected API response format:', response);
        setError('Invalid data format received from API');
      }
    } catch (err) {
      console.error('Failed to fetch compliance reports:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch compliance reports');
    } finally {
      setLoading(false);
    }
  };

  const fetchComplianceDetails = async (reportName: string) => {
    if (!currentContext?.name || !reportName) return;

    try {
      setLoadingChecks(true);
      setError(null);

      const response = await getComplianceDetails(currentContext.name, reportName);

      if (response && response.report && response.report.controlChecks) {
        setComplianceChecks(response.report.controlChecks);
      } else {
        console.warn('No compliance checks found in API response:', response);
        setComplianceChecks([]);
      }
    } catch (err) {
      console.error('Failed to fetch compliance details:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch compliance details');
      setComplianceChecks([]);
    } finally {
      setLoadingChecks(false);
    }
  };

  // Update compliance checks when selected standard changes
  useEffect(() => {
    if (selectedStandard && currentContext?.name) {
      fetchComplianceDetails(selectedStandard);
    }
  }, [selectedStandard, currentContext?.name]);

  const handleTrivyInstallSuccess = () => {
    setIsTrivyInstalled(true);
    fetchComplianceReports();
  };

  const handleCheckClick = (check: ComplianceCheck) => {
    setSelectedReportName(selectedStandard);
    setIsDrawerOpen(true);
  };

  const handleViewReportDetails = () => {
    setSelectedReportName(selectedStandard);
    setIsDrawerOpen(true);
  };

  const getSelectedReportSummary = () => {
    const report = complianceReports.find(r => r.name === selectedReportName);
    return report ? report.summary : { passCount: 0, failCount: 0 };
  };

  const filteredChecks = useMemo(() => {
    if (!Array.isArray(complianceChecks)) {
      return [];
    }

    return complianceChecks.filter(check => {
      const matchesSearch = searchQuery === "" ||
        check.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        check.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSeverity = selectedSeverity === "all" ||
        check.severity === selectedSeverity;

      return matchesSearch && matchesSeverity;
    });
  }, [complianceChecks, searchQuery, selectedSeverity]);

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedSeverity("all");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin dark:text-gray-300" />
      </div>
    );
  }

  if (error && !isDrawerOpen) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-red-500 mb-2">Error</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
        <Button onClick={() => window.location.reload()}>Refresh Page</Button>
      </div>
    );
  }

  if (!isTrivyInstalled) {
    return (
      <TrivyNotInstalled
        title="Best Practices"
        subtitle="Trivy Operator is required to scan your cluster for compliance with security best practices. Install it to assess your security posture against standards like CIS Kubernetes Benchmark and NSA Hardening Guide."
        onInstallSuccess={handleTrivyInstallSuccess}
      />
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="
          max-h-[92vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
      "
    >

      {/* Development Preview Notice */}
      <motion.div
        variants={itemVariants}
        className="mx-6 mt-6 mb-4 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg text-xs"
      >
        <div className="flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          <div>
            <span className="font-medium text-amber-800 dark:text-amber-200">Development Preview</span>
            <p className="text-amber-700 dark:text-amber-300 mt-1">
              The Trivy Plugin is in active development and currently in development preview.
              Features may be subject to change and some functionality may be limited.
            </p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-3 gap-6 mb-32 dark:bg-transparent p-6 rounded-3xl">
        <motion.div variants={itemVariants} className="col-span-3">
          <div className="flex justify-between">
            <div className="pb-6">
              <h1 className="text-5xl dark:text-gray-500/40 font-bold">Best Practices</h1>
              <p>Security overview of your Kubernetes cluster, view your cluster vulnerabilities and compliance.</p>
            </div>

            <div className="flex gap-4 items-start">
              <div className="text-gray-500 border border-gray-400 dark:border-gray-800/50 h-fit py-2 px-4 rounded-lg">
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' })}
              </div>
            </div>
          </div>
        </motion.div>


        <motion.div variants={itemVariants} className="col-span-3 dark:bg-transparent border dark:border-gray-800/30 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 dark:text-gray-400">Compliance standard:</span>
                <Select
                  value={selectedStandard}
                  onValueChange={setSelectedStandard}
                >
                  <SelectTrigger className="w-64 border border-gray-400 dark:border-gray-800/50 rounded-md">
                    <SelectValue placeholder="Select standard" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-[#0B0D13]">
                    {complianceReports.map((report) => (
                      <SelectItem key={report.name} value={report.name}>
                        {report.name} ({report.summary.passCount}/{report.summary.passCount + report.summary.failCount})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={handleViewReportDetails}
            >
              View Full Report <ExternalLink className="h-4 w-4" />
            </Button>
          </div>

          <div className="mb-4">
            <Input
              type="text"
              placeholder="Enter search keywords"
              className="w-full border border-gray-400 dark:border-gray-800/50 rounded-md dark:bg-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex gap-4 mb-6">

            <Select value={selectedNamespace}>
              <SelectTrigger className="w-32 border border-gray-400 dark:border-gray-800/50 rounded-md dark:bg-transparent">
                <SelectValue placeholder="Namespaces" />
              </SelectTrigger>
              <SelectContent className="dark:bg-[#0B0D13]">
                <SelectItem value="all-namespaces">All Namespaces</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedLabels}>
              <SelectTrigger className="w-32 border border-gray-400 dark:border-gray-800/50 rounded-md dark:bg-transparent">
                <SelectValue placeholder="Labels" />
              </SelectTrigger>
              <SelectContent className="dark:bg-[#0B0D13]">
                <SelectItem value="all-labels">All Labels</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={selectedSeverity}
              onValueChange={(value) => setSelectedSeverity(value as SeverityLevel | "all")}
            >
              <SelectTrigger className="w-32 border border-gray-400 dark:border-gray-800/50 rounded-md dark:bg-transparent">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent className="dark:bg-[#0B0D13]">
                <SelectItem value="all">All Severities</SelectItem>
                {SEVERITY_LEVELS.map((severity) => (
                  <SelectItem key={severity} value={severity}>
                    {severity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button
              className="text-blue-600"
              onClick={handleClearFilters}
            >
              Clear all
            </button>
          </div>

          <div className="mb-4 flex items-center gap-2">
            <span className="text-gray-600 dark:text-gray-400">{filteredChecks.length} checks</span>
            {loadingChecks && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-md">
              {error}
            </div>
          )}

          {loadingChecks ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <span className="ml-3 text-gray-600 dark:text-gray-400">Loading compliance checks...</span>
            </div>
          ) : filteredChecks.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-gray-300 dark:border-gray-800/30">
                  <TableHead className="w-12"></TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>CHECK</TableHead>
                  <TableHead>STANDARD</TableHead>
                  <TableHead>SEVERITY</TableHead>
                  <TableHead>AFFECTED RESOURCES</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredChecks.map((check) => (
                  <TableRow
                    key={check.id}
                    className="hover:bg-gray-300/30 dark:hover:bg-gray-800/10 cursor-pointer"
                    onClick={() => handleCheckClick(check)}
                  >
                    <TableCell>
                      <div className={`w-2 h-2 rounded-full ${check.totalFail > 0 ? 'bg-red-500' : 'bg-green-500'}`}></div>
                    </TableCell>
                    <TableCell>{check.id}</TableCell>
                    <TableCell className="text-blue-600">{check.name}</TableCell>
                    <TableCell>{selectedStandard}</TableCell>
                    <TableCell>
                      {check.severity && (
                        <div className="inline-block">
                          <span className={`
                            ${getSeverityColors(check.severity).text}
                            ${getSeverityColors(check.severity).border}
                            ${getSeverityColors(check.severity).background}
                            border rounded-md px-2 py-1 text-xs font-medium
                          `}>
                            {check.severity}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-red-200 dark:bg-red-900/60 rounded">
                          <div
                            className="h-full bg-red-500 rounded"
                            style={{
                              width: check.totalFail > 0 ? '100%' : '0%'
                            }}
                          ></div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-16 bg-white/30 dark:bg-gray-900/10 rounded-xl border border-gray-200 dark:border-gray-800/30">
              <Info className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium mb-2">No Compliance Checks Found</h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                No compliance checks were found for the selected standard or filter criteria.
                Try selecting a different standard or clearing filters.
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};

export default BestPractices;