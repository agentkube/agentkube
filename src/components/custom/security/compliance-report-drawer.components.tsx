import React, { useEffect, useState } from 'react';
import { 
  X, 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  AlertTriangle, 
  ExternalLink,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { getSeverityColors } from '@/utils/severity.utils';
import { getComplianceDetails } from '@/api/scanner/security';
import { ComplianceCheck } from '@/types/scanner/vulnerability-report';

interface ComplianceDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  clusterName: string;
  reportName: string;
  passCount: number;
  failCount: number;
}

const ComplianceDetailsDrawer: React.FC<ComplianceDetailsDrawerProps> = ({
  isOpen,
  onClose,
  clusterName,
  reportName,
  passCount,
  failCount
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [complianceChecks, setComplianceChecks] = useState<ComplianceCheck[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (isOpen && reportName && clusterName) {
      fetchComplianceDetails();
    }
  }, [isOpen, reportName, clusterName]);

  const fetchComplianceDetails = async () => {
    if (!clusterName || !reportName) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await getComplianceDetails(clusterName, reportName);
      
      setDetails(response.report);
      
      // Extract compliance checks if available
      if (response.report && Array.isArray(response.report.controlChecks)) {
        setComplianceChecks(response.report.controlChecks);
      } else {
        // Fallback to empty array
        setComplianceChecks([]);
      }
    } catch (err) {
      console.error('Failed to fetch compliance details:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch compliance details');
    } finally {
      setLoading(false);
    }
  };

  // Get counts by severity
  const severityCounts = complianceChecks.reduce((acc, check) => {
    const severity = check.severity || 'UNKNOWN';
    acc[severity] = (acc[severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calculate percentage of passed checks
  const totalChecks = passCount + failCount;
  const passPercentage = totalChecks > 0 ? (passCount / totalChecks) * 100 : 0;
  const complianceStatus = passPercentage >= 70 ? 'Passing' : 'Failing';

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={onClose}
    >
      <div
        className={`fixed right-0 inset-y-0 w-1/2 z-50 flex flex-col bg-white dark:bg-gray-950 shadow-xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } max-h-screen overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-800 p-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">{reportName} Compliance Details</h2>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full p-0"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Detailed compliance information for {reportName} standard
          </p>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16 flex-1">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : error ? (
          <div className="p-6 text-center flex-1">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-red-500 mb-2">Error Loading Data</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">{error}</p>
            <Button onClick={fetchComplianceDetails}>Try Again</Button>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="checks">Compliance Checks</TabsTrigger>
                <TabsTrigger value="failures">Failures</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-6 border border-gray-200 dark:border-gray-800">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h3 className="text-lg font-semibold mb-1">Compliance Score</h3>
                      <p className="text-sm text-gray-500">Overall compliance status for this standard</p>
                    </div>
                    <div className={`px-4 py-2 rounded-full text-white font-medium ${
                      complianceStatus === 'Passing' ? 'bg-green-500' : 'bg-red-500'
                    }`}>
                      {complianceStatus}
                    </div>
                  </div>
                  
                  <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                    <div 
                      className="h-full bg-green-500" 
                      style={{ width: `${passPercentage}%` }}
                    ></div>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span>{passPercentage.toFixed(1)}% Compliant</span>
                    <span>{passCount} / {totalChecks} checks passing</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                    <h3 className="text-lg font-semibold mb-2">Critical Issues</h3>
                    <div className="flex items-center gap-2">
                      <div className="text-3xl font-bold text-red-500">{severityCounts['CRITICAL'] || 0}</div>
                      <div className="text-sm text-gray-500">failures</div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                    <h3 className="text-lg font-semibold mb-2">High Issues</h3>
                    <div className="flex items-center gap-2">
                      <div className="text-3xl font-bold text-orange-500">{severityCounts['HIGH'] || 0}</div>
                      <div className="text-sm text-gray-500">failures</div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                    <h3 className="text-lg font-semibold mb-2">Medium/Low Issues</h3>
                    <div className="flex items-center gap-2">
                      <div className="text-3xl font-bold text-yellow-500">
                        {(severityCounts['MEDIUM'] || 0) + (severityCounts['LOW'] || 0)}
                      </div>
                      <div className="text-sm text-gray-500">failures</div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-6 border border-gray-200 dark:border-gray-800">
                  <h3 className="text-lg font-semibold mb-4">Compliance Standard Information</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Standard Name</p>
                      <p className="font-medium">{reportName}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Cluster</p>
                      <p className="font-medium">{clusterName}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Last Scan</p>
                      <p className="font-medium">
                        {details?.creationTimestamp 
                          ? new Date(details.creationTimestamp).toLocaleString() 
                          : 'Unknown'}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Status</p>
                      <p className="font-medium">{complianceStatus}</p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="checks">
                {complianceChecks.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Status</TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead className="text-right">Failures</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {complianceChecks.map((check) => (
                        <TableRow key={check.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <TableCell>
                            {check.totalFail > 0 ? (
                              <AlertCircle className="h-5 w-5 text-red-500" />
                            ) : (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{check.id}</TableCell>
                          <TableCell>{check.name}</TableCell>
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
                          <TableCell className="text-right">
                            <span className={check.totalFail > 0 ? 'text-red-500 font-medium' : 'text-green-500'}>
                              {check.totalFail > 0 ? check.totalFail : 'Pass'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <Info className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Compliance Checks Available</h3>
                    <p className="text-gray-500 dark:text-gray-400">
                      No detailed compliance checks were found for this standard.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="failures">
                {complianceChecks.filter(check => check.totalFail > 0).length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Severity</TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Affected Resources</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {complianceChecks
                        .filter(check => check.totalFail > 0)
                        .map((check) => (
                          <TableRow key={check.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <TableCell>
                              <AlertTriangle className={`h-5 w-5 ${
                                check.severity === 'CRITICAL' ? 'text-red-500' :
                                check.severity === 'HIGH' ? 'text-orange-500' :
                                'text-yellow-500'
                              }`} />
                            </TableCell>
                            <TableCell className="font-mono text-sm">{check.id}</TableCell>
                            <TableCell>{check.name}</TableCell>
                            <TableCell className="text-right">
                              <span className="text-red-500 font-medium">{check.totalFail}</span>
                            </TableCell>
                          </TableRow>
                        ))
                      }
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">All Checks Passing</h3>
                    <p className="text-gray-500 dark:text-gray-400">
                      Great job! All compliance checks are passing for this standard.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-800 px-6 py-4">
          <div className="flex justify-between">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button 
              variant="outline" 
              className="flex items-center gap-2"
              onClick={() => window.open(`https://aquasecurity.github.io/trivy/v0.39/docs/target/kubernetes/#compliance`, '_blank')}
            >
              Documentation <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComplianceDetailsDrawer;