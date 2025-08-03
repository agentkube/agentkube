import React, { useState, useEffect, useMemo } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, FileText, Clock, CheckCircle, XCircle, AlertCircle, Search, ChevronLeft, ChevronsLeft, ChevronsRight, MoreVertical, AlertTriangle, Shield, Bug, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
// TODO: Remove mock data when API integration is added
interface Investigation {
  id: string;
  protocol: {
    name: string;
    steps: Array<{ id: string; name: string }>;
  };
  currentStepNumber: number;
  createdAt: string;
  progress: number;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'CANCELED';
  issuesFound: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  remediationMessage: string;
}

// TODO: Remove mock data when API integration is added - Updated with severity field
const mockInvestigations: Investigation[] = [
  {
    id: '1',
    protocol: {
      name: 'Security Incident Response',
      steps: [
        { id: '1', name: 'Initial Assessment' },
        { id: '2', name: 'Evidence Collection' },
        { id: '3', name: 'Analysis' },
        { id: '4', name: 'Report Generation' }
      ]
    },
    currentStepNumber: 3,
    createdAt: '2025-06-25T10:30:00Z',
    progress: 75.0,
    status: 'IN_PROGRESS',
    issuesFound: 5,
    severity: 'CRITICAL',
    remediationMessage: 'Immediate action required to patch vulnerabilities'
  },
  {
    id: '2',
    protocol: {
      name: 'Network Vulnerability Assessment',
      steps: [
        { id: '1', name: 'Scope Definition' },
        { id: '2', name: 'Scanning' },
        { id: '3', name: 'Verification' },
        { id: '4', name: 'Documentation' }
      ]
    },
    currentStepNumber: 4,
    createdAt: '2025-06-24T14:15:00Z',
    progress: 100.0,
    status: 'COMPLETED',
    issuesFound: 12,
    severity: 'HIGH',
    remediationMessage: 'All critical vulnerabilities have been patched successfully'
  },
  {
    id: '3',
    protocol: {
      name: 'Malware Analysis Investigation',
      steps: [
        { id: '1', name: 'Sample Collection' },
        { id: '2', name: 'Static Analysis' },
        { id: '3', name: 'Dynamic Analysis' },
        { id: '4', name: 'Report Creation' }
      ]
    },
    currentStepNumber: 2,
    createdAt: '2025-06-23T09:45:00Z',
    progress: 50.0,
    status: 'IN_PROGRESS',
    issuesFound: 3,
    severity: 'MEDIUM',
    remediationMessage: 'Quarantine affected systems and update antivirus definitions'
  },
  {
    id: '4',
    protocol: {
      name: 'Data Breach Investigation',
      steps: [
        { id: '1', name: 'Incident Verification' },
        { id: '2', name: 'Impact Assessment' },
        { id: '3', name: 'Containment' },
        { id: '4', name: 'Recovery' }
      ]
    },
    currentStepNumber: 1,
    createdAt: '2025-06-22T16:20:00Z',
    progress: 25.0,
    status: 'CANCELED',
    issuesFound: 0,
    severity: 'UNKNOWN',
    remediationMessage: 'Investigation canceled due to false positive alert'
  },
  {
    id: '5',
    protocol: {
      name: 'Compliance Audit Investigation',
      steps: [
        { id: '1', name: 'Requirement Review' },
        { id: '2', name: 'Evidence Gathering' },
        { id: '3', name: 'Gap Analysis' },
        { id: '4', name: 'Remediation Plan' }
      ]
    },
    currentStepNumber: 4,
    createdAt: '2025-06-21T11:10:00Z',
    progress: 100.0,
    status: 'COMPLETED',
    issuesFound: 8,
    severity: 'HIGH',
    remediationMessage: 'Implement recommended controls to achieve compliance'
  },
  {
    id: '6',
    protocol: {
      name: 'Insider Threat Investigation',
      steps: [
        { id: '1', name: 'Alert Triage' },
        { id: '2', name: 'User Activity Analysis' },
        { id: '3', name: 'Evidence Collection' },
        { id: '4', name: 'Case Documentation' }
      ]
    },
    currentStepNumber: 2,
    createdAt: '2025-06-20T08:30:00Z',
    progress: 40.0,
    status: 'IN_PROGRESS',
    issuesFound: 2,
    severity: 'MEDIUM',
    remediationMessage: 'Review user access permissions and implement monitoring'
  },
  {
    id: '7',
    protocol: {
      name: 'Phishing Campaign Analysis',
      steps: [
        { id: '1', name: 'Email Analysis' },
        { id: '2', name: 'URL Investigation' },
        { id: '3', name: 'Infrastructure Mapping' },
        { id: '4', name: 'IOC Documentation' }
      ]
    },
    currentStepNumber: 4,
    createdAt: '2025-06-19T15:45:00Z',
    progress: 100.0,
    status: 'COMPLETED',
    issuesFound: 15,
    severity: 'CRITICAL',
    remediationMessage: 'Email security training required for all affected users'
  },
  {
    id: '8',
    protocol: {
      name: 'DDoS Attack Investigation',
      steps: [
        { id: '1', name: 'Traffic Analysis' },
        { id: '2', name: 'Source Identification' },
        { id: '3', name: 'Mitigation Planning' },
        { id: '4', name: 'Post-Incident Review' }
      ]
    },
    currentStepNumber: 3,
    createdAt: '2025-06-18T12:20:00Z',
    progress: 75.0,
    status: 'IN_PROGRESS',
    issuesFound: 1,
    severity: 'LOW',
    remediationMessage: 'Activate DDoS protection and scale infrastructure'
  },
  {
    id: '9',
    protocol: {
      name: 'Ransomware Incident Response',
      steps: [
        { id: '1', name: 'Containment' },
        { id: '2', name: 'Assessment' },
        { id: '3', name: 'Recovery Planning' },
        { id: '4', name: 'Lessons Learned' }
      ]
    },
    currentStepNumber: 1,
    createdAt: '2025-06-17T09:15:00Z',
    progress: 20.0,
    status: 'CANCELED',
    issuesFound: 0,
    severity: 'UNKNOWN',
    remediationMessage: 'Investigation stopped - backup recovery successful'
  },
  {
    id: '10',
    protocol: {
      name: 'Cloud Security Assessment',
      steps: [
        { id: '1', name: 'Configuration Review' },
        { id: '2', name: 'Access Control Audit' },
        { id: '3', name: 'Data Protection Analysis' },
        { id: '4', name: 'Compliance Validation' }
      ]
    },
    currentStepNumber: 4,
    createdAt: '2025-06-16T14:00:00Z',
    progress: 100.0,
    status: 'COMPLETED',
    issuesFound: 6,
    severity: 'MEDIUM',
    remediationMessage: 'Update IAM policies and enable additional logging'
  },
  {
    id: '11',
    protocol: {
      name: 'Mobile Device Forensics',
      steps: [
        { id: '1', name: 'Device Acquisition' },
        { id: '2', name: 'Data Extraction' },
        { id: '3', name: 'Analysis' },
        { id: '4', name: 'Report Generation' }
      ]
    },
    currentStepNumber: 2,
    createdAt: '2025-06-15T11:30:00Z',
    progress: 50.0,
    status: 'IN_PROGRESS',
    issuesFound: 4,
    severity: 'HIGH',
    remediationMessage: 'Implement mobile device management policies'
  },
  {
    id: '12',
    protocol: {
      name: 'Web Application Security Review',
      steps: [
        { id: '1', name: 'Reconnaissance' },
        { id: '2', name: 'Vulnerability Testing' },
        { id: '3', name: 'Exploitation Attempts' },
        { id: '4', name: 'Risk Assessment' }
      ]
    },
    currentStepNumber: 3,
    createdAt: '2025-06-14T16:45:00Z',
    progress: 70.0,
    status: 'IN_PROGRESS',
    issuesFound: 9,
    severity: 'HIGH',
    remediationMessage: 'Apply security patches and implement input validation'
  }
];

interface StatCardProps {
  count: number;
  label: string;
  timeframe: string;
  delay: number;
  icon: React.ReactNode;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ count, label, timeframe, delay, icon, color }) => (
  <div
    style={{
      opacity: 1,
      transform: 'translateY(0px)'
    }}
    className="flex-1"
  >
    <Card className="flex-1 bg-transparent border border-gray-300/20 dark:border-gray-700/50">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-4">
          <div className={`p-2 rounded-lg ${color}`}>
            {icon}
          </div>
          <h2 className="text-4xl font-bold text-gray-900 dark:text-gray-200">
            {count}
          </h2>
        </div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
          {label}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {timeframe}
        </p>
      </CardContent>
    </Card>
  </div>
);


interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange
}) => {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const getVisiblePages = () => {
    const pages = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <div className="flex items-center justify-between mt-6 px-4 py-3 bg-gray-50 dark:bg-gray-800/10 rounded-lg">
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Showing {startItem} to {endItem} of {totalItems} investigations
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="h-8 w-8 p-0"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {getVisiblePages().map((page, index) => (
          <Button
            key={index}
            variant={page === currentPage ? "default" : "outline"}
            size="sm"
            onClick={() => typeof page === 'number' && onPageChange(page)}
            disabled={typeof page !== 'number'}
            className="h-8 w-8 p-0"
          >
            {page}
          </Button>
        ))}

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="h-8 w-8 p-0"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

const formatAge = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m ago`;
  } else {
    return 'Just now';
  }
};

const Investigations: React.FC = () => {
  // TODO: Replace with actual API call when available
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState('all');
  const [summary, setSummary] = useState('');

  const navigate = useNavigate();

  // Search and pagination states
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(9); // Show 6 items per page

  // TODO: Replace with actual API integration
  useEffect(() => {
    const fetchInvestigations = async () => {
      try {
        // Simulate API call
        setTimeout(() => {
          setInvestigations(mockInvestigations);
          setLoading(false);
        }, 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch investigations');
        setLoading(false);
      }
    };

    fetchInvestigations();
  }, []);

  // Reset to page 1 when search or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedTab]);

  const getFilteredInvestigations = useMemo(() => {
    let filtered = investigations;

    // Filter by tab
    if (selectedTab !== 'all') {
      const statusMap: Record<string, string> = {
        'completed': 'COMPLETED',
        'ongoing': 'IN_PROGRESS',
        'stopped': 'CANCELED'
      };
      filtered = filtered.filter(inv => inv.status === statusMap[selectedTab]);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const lowercaseQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(inv => {
        const protocolName = inv.protocol.name.toLowerCase();
        const status = inv.status.toLowerCase();
        const severity = inv.severity.toLowerCase();
        const stepNames = inv.protocol.steps.map(step => step.name.toLowerCase()).join(' ');
        const remediationMessage = inv.remediationMessage.toLowerCase();

        return protocolName.includes(lowercaseQuery) ||
          status.includes(lowercaseQuery) ||
          severity.includes(lowercaseQuery) ||
          stepNames.includes(lowercaseQuery) ||
          remediationMessage.includes(lowercaseQuery) ||
          inv.id.toLowerCase().includes(lowercaseQuery);
      });
    }

    return filtered;
  }, [investigations, selectedTab, searchQuery]);

  // Paginated investigations
  const paginatedInvestigations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return getFilteredInvestigations.slice(startIndex, endIndex);
  }, [getFilteredInvestigations, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(getFilteredInvestigations.length / itemsPerPage);

  const getPastWeekInvestigations = () => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return investigations.filter(inv =>
      new Date(inv.createdAt) >= oneWeekAgo
    );
  };

  const getCompletedInvestigations = () =>
    investigations.filter(inv => inv.status === 'COMPLETED');

  const getOngoingInvestigations = () =>
    investigations.filter(inv => inv.status === 'IN_PROGRESS');

  // TODO: Implement actual investigation creation logic
  const handleCreateInvestigation = () => {
    if (!summary.trim()) return;

    console.log('Creating investigation with summary:', summary);
    // API call would go here
    setSummary('');
  };

  const handleNavigateToInvestigate = (investigationId: string) => {
    // TODO: Update route when investigation details page is implemented
    console.log(`Navigating to investigation: ${investigationId}`);
    // navigate(`/investigate/${investigationId}`);
  };

  const getStatusIcon = (status: Investigation['status']) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'IN_PROGRESS':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'CANCELED':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: Investigation['status']) => {
    const statusConfig = {
      'COMPLETED': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      'IN_PROGRESS': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      'CANCELED': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
    };

    return (
      <span className={`px-2 py-1 rounded-md text-xs font-medium ${statusConfig[status]}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const getSeverityBadge = (severity: Investigation['severity']) => {
    const severityConfig = {
      'CRITICAL': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
      'HIGH': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      'MEDIUM': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 border-yellow-200',
      'LOW': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      'UNKNOWN': 'bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-400'
    };

    return (
      <span className={`px-2 py-1 rounded-md text-xs font-medium ${severityConfig[severity]}`}>
        {severity}
      </span>
    );
  };

  const getIssuesSeverityColor = (issuesCount: number) => {
    if (issuesCount === 0) return 'text-green-600 dark:text-green-400';
    if (issuesCount <= 3) return 'text-yellow-600 dark:text-yellow-400';
    if (issuesCount <= 8) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getIssuesIcon = (issuesCount: number) => {
    if (issuesCount === 0) return <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />;
    if (issuesCount <= 3) return <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />;
    return <Bug className="w-4 h-4 text-red-600 dark:text-red-400" />;
  };

  return (
    <div className="
      max-h-[93vh] overflow-y-auto
      
      [&::-webkit-scrollbar]:w-1.5 
      [&::-webkit-scrollbar-track]:bg-transparent 
      [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className="p-6 mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-5xl dark:text-gray-500/40 font-[Anton] uppercase font-bold">Investigations</h1>
        </div>

        {/* Stats Cards and Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-8">
          <StatCard
            count={getPastWeekInvestigations().length}
            label="Investigations Past 7 Days"
            timeframe="Past Week"
            delay={0.2}
            icon={<Clock className="w-6 h-6 text-blue-600" />}
            color="bg-blue-100 dark:bg-blue-900/20"
          />
          <StatCard
            count={getCompletedInvestigations().length}
            label="Complete Investigations"
            timeframe="All time"
            delay={0.4}
            icon={<CheckCircle className="w-6 h-6 text-green-600" />}
            color="bg-green-100 dark:bg-green-900/20"
          />
          <StatCard
            count={getOngoingInvestigations().length}
            label="Ongoing Investigations"
            timeframe="All time"
            delay={0.6}
            icon={<AlertCircle className="w-6 h-6 text-orange-600" />}
            color="bg-orange-100 dark:bg-orange-900/20"
          />
          {/* <SeverityDistributionChart investigations={investigations} /> */}
        </div>

        {/* Tabs and Results */}
        <div>
          <Tabs
            value={selectedTab}
            onValueChange={setSelectedTab}
            className="w-full"
          >
            <div className='flex justify-between'>
              <TabsList>
                {["all", "completed", "ongoing", "stopped"].map((tab) => (
                  <TabsTrigger key={tab} value={tab} className='text-sm'>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {tab === 'all' && ` (${investigations.length})`}
                    {tab === 'completed' && ` (${getCompletedInvestigations().length})`}
                    {tab === 'ongoing' && ` (${getOngoingInvestigations().length})`}
                    {tab === 'stopped' && ` (${investigations.filter(inv => inv.status === 'CANCELED').length})`}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Search Bar */}
              <div className="w-full max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search investigations by name, status, or severity..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 border-gray-300 dark:border-gray-600/20"
                  />
                </div>
              </div>
            </div>

            <div className="py-6">
              {loading ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-2"></div>
                  Loading investigations...
                </div>
              ) : error ? (
                <div className="text-center text-red-500 py-8">{error}</div>
              ) : getFilteredInvestigations.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  {searchQuery ? (
                    <>No investigations found matching "{searchQuery}"</>
                  ) : (
                    <>No investigations found for the selected filter</>
                  )}
                </div>
              ) : (
                <>
                  {/* Investigations Table using Shadcn components */}
                  <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
                    <div className="rounded-md border">
                      <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
                        <TableHeader>
                          <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                            <TableHead className="">Investigation</TableHead>
                            <TableHead className="">Progress</TableHead>
                            <TableHead className="text-center">Severity</TableHead>
                            <TableHead className="text-center">Issues Found</TableHead>
                            <TableHead className="">Remediation Message</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                            <TableHead className='text-center'>Created</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedInvestigations.map((investigation) => (
                            <TableRow
                              key={investigation.id}
                              className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                              onClick={() => handleNavigateToInvestigate(investigation.id)}
                            >
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-3">
                                  {getStatusIcon(investigation.status)}
                                  <div>
                                    <div className="hover:text-blue-500 hover:underline font-medium text-xs" onClick={() => navigate("/dashboard/tasks")}>
                                      {investigation.protocol.name}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      ID: {investigation.id}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>

                              <TableCell>
                                <div className="space-y-2">
                                  <div className="flex justify-between text-xs">
                                    <span>{investigation.progress.toFixed(1)}%</span>
                                  </div>
                                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                                    <div
                                      className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                                      style={{ width: `${investigation.progress}%` }}
                                    />
                                  </div>
                                </div>
                              </TableCell>

                              <TableCell className="text-center">
                                {getSeverityBadge(investigation.severity)}
                              </TableCell>

                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-2">
                                  {getIssuesIcon(investigation.issuesFound)}
                                  <span className={`font-semibold ${getIssuesSeverityColor(investigation.issuesFound)}`}>
                                    {investigation.issuesFound}
                                  </span>
                                </div>
                              </TableCell>

                              <TableCell>
                                <div className="max-w-xs">
                                  <div className="text-xs text-gray-700 dark:text-gray-300 truncate" title={investigation.remediationMessage}>
                                    {investigation.remediationMessage}
                                  </div>
                                </div>
                              </TableCell>

                              <TableCell className='w-[120px] text-center'>
                                {getStatusBadge(investigation.status)}
                              </TableCell>

                              <TableCell className='text-center dark:text-gray-400'>
                                {formatAge(investigation.createdAt)}
                              </TableCell>

                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={getFilteredInvestigations.length}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                    />
                  )}
                </>
              )}
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Investigations;