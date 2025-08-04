import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Timeline,
  TimelineContent,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/ui/timeline";
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  TrendingUp,
  Activity,
  Server,
  GitBranch,
  Eye,
  MessageSquare,
  BarChart3,
  Calendar,
  Shield,
  Bug,
  Zap,
  Database,
  Globe,
  Settings,
  Sparkles
} from 'lucide-react';
import MarkdownContent from '@/utils/markdown-formatter';
import { ChartCryptoPortfolio } from '@/components/custom/promgraphcontainer/graphs.component';
import { Separator } from '@/components/ui/separator';

// TypeScript interfaces
interface TimelineEvent {
  time: string;
  type: string;
  service: string;
  title: string;
  description?: string;
  severity: 'critical' | 'error' | 'warning' | 'info' | 'success';
  content?: string; // New field for markdown/chart content
  hasChart?: boolean;
  chartType?: string;
}

interface SystemCheck {
  category: string;
  status: 'ISSUES FOUND' | 'ALL GOOD';
  description: string;
  severity: 'critical' | 'error' | 'warning' | 'info' | 'success';
}

interface RootCause {
  title: string;
  theory: string;
  remediation: string;
}

interface Metrics {
  errorRate: number;
  affectedUsers: number;
  impactDuration: string;
  servicesAffected: number;
}

interface ReportData {
  id: string;
  title: string;
  description: string;
  duration: string;
  status: string;
  severity: string;
  tags: string[];
  rootCause: RootCause;
  checks: SystemCheck[];
  timeline: TimelineEvent[];
  metrics: Metrics;
}

// Enhanced mock data with markdown and chart content
const reportData: ReportData = {
  id: "e74e261e-ac2b-4c9d-a122-8faed13a51ce",
  title: "TooManyErrorResponses - Service webstore-frontend",
  description: "Service webstore-frontend in namespace webstore has a high rate of error responses",
  duration: "1 minute",
  status: "ACTIVE",
  severity: "HIGH",
  tags: ["USER IMPACTING", "DEPLOYMENT CHANGE", "DOWNSTREAM SERVICE"],
  rootCause: {
    title: "LIKELY ROOT CAUSE THEORY",
    theory: "The likely cause of the high rate of error responses is a recent deployment change in the checkoutservice (downstream from frontend), introducing a new image that correlates with the errors. This new image appears to have introduced a NullPointerException, causing the failed responses in the frontend.",
    remediation: `**Immediate Actions:**
1. Roll back the recent deployment in checkoutservice to restore stability
2. Fix the NullPointerException in a follow-up commit and redeploy

**Code Fix Required:**
\`\`\`java
// Add null check before calling trim()
String sanitizedUsername = (username != null) ? username.trim() : "";
\`\`\`

**Testing Strategy:**
- Add unit tests for null username scenarios
- Enhanced integration testing for user data edge cases`
  },
  checks: [
    {
      category: "APPLICATION HEALTH",
      status: "ISSUES FOUND",
      description: "Checked KPIs: found high error response rate, no change in latency or request rate",
      severity: "error"
    },
    {
      category: "DOWNSTREAM SERVICES",
      status: "ISSUES FOUND",
      description: "Checked all downstream dependencies: found issues in checkoutservice",
      severity: "error"
    },
    {
      category: "DEPLOYMENT CHANGE",
      status: "ISSUES FOUND",
      description: "Checked for recent deployment changes, new image causing issues.",
      severity: "error"
    },
    {
      category: "INFRASTRUCTURE",
      status: "ALL GOOD",
      description: "Checked node memory usage, no memory pressure issues found.",
      severity: "success"
    }
  ],
  timeline: [
    {
      time: "3 days ago",
      type: "PR MERGED",
      service: "checkoutservice",
      title: "Better sanitation of user data during order processing",
      description: "The NullPointerException occurs because user.getUsername() might be returning null, and calling .trim() on a null value throws the exception.",
      severity: "info",
      content: `
## Code Analysis

The following code change was introduced:

\`\`\`java
String username = user.getUsername();
String sanitizedUsername = username.trim(); // This line causes NPE
\`\`\`

**Issue identified:** The method \`user.getUsername()\` can return \`null\`, but we're calling \`.trim()\` without null checking.

### Recommended Fix:
\`\`\`java
String username = user.getUsername();
String sanitizedUsername = (username != null) ? username.trim() : "";
\`\`\`
      `
    },
    {
      time: "02:40:05 AM",
      type: "APPLICATION DEPLOYMENT",
      service: "webstore-checkoutservice",
      title: "Deployment introduced a new image possibly causing errors.",
      severity: "warning",
      content: `## Deployment Details

- **Image:** \`checkoutservice:v2.1.3\`
- **Deployment Strategy:** \`Rolling Update\`
- **Replicas:** 3 → 3 (no scaling change)

<chart>type: line-dots title: Deployment Timeline description: Application deployment metrics showing error spike correlation explanation: This chart shows the direct correlation between the deployment at 02:40:05 AM and the subsequent error spike. Notice how the error rate remained stable until the new image was deployed, then spiked dramatically within 7 minutes.</chart>
`
    },
    {
      time: "02:47:10 AM",
      type: "LOG ERRORS BEGAN",
      service: "webstore-checkoutservice",
      title: "Detected null pointer exception in checkoutservice logs.",
      description: "Null pointer exception error logs.",
      severity: "error",
      hasChart: true,
      chartType: "bar-stacked",
      content: `
## Error Log Analysis

**Error Pattern Detected:**
\`\`\`
Exception in thread "main" java.lang.NullPointerException
    at com.webstore.checkout.CheckoutService.processOrder(CheckoutService.java:143)
    at com.webstore.checkout.CheckoutService.handleRequest(CheckoutService.java:89)
\`\`\`

### Error Frequency Analysis

<chart>type: bar-stacked title: Error Distribution description: Breakdown of error types over time explanation: The stacked bar chart reveals that NullPointerException dominates the error landscape, accounting for 89% of all errors. The dramatic shift from normal error patterns to NPE-heavy distribution pinpoints the exact moment the faulty code was executed. This data correlation is crucial for rapid incident response.</chart>

**Key Observations:**
- NullPointerException accounts for 89% of errors
- Error rate increased from 0.1% to 15.2%
- Peak error time: 02:47-02:49 AM
`
    },
    {
      time: "02:47:28 AM",
      type: "ERROR RATE SPIKED",
      service: "webstore-checkoutservice",
      title: "Error rate spiked for checkoutservice leading to other errors.",
      severity: "error",
      content: `
## Service Impact Analysis

### Affected Services:
1. **checkoutservice** - Primary failure point
2. **frontend** - Downstream impact
3. **payment-service** - Secondary impact
4. **inventory-service** - Timeout cascades

<chart>type: area-step title: Error Rate Timeline description: Service error rates showing cascade effect explanation: This area chart illustrates the domino effect of service failures. Starting with checkoutservice at 02:47:28 AM, errors cascade through dependent services. The step pattern shows how circuit breakers and timeouts create distinct failure phases, helping teams understand service interdependencies.</chart>

**Mitigation Actions Taken:**
- Circuit breaker activated for checkout → payment calls
- Increased timeout thresholds temporarily
- Health check frequency doubled
`
    },
    {
      time: "02:49:05 AM",
      type: "ERROR RATE INCREASED",
      service: "webstore-frontend",
      title: "Error rate spiked for webstore-frontend after low error rate.",
      severity: "error",
      content: `
## Frontend Impact Assessment

The frontend service experienced cascading failures due to checkout service errors.

### Impact Metrics:
- **User Sessions Affected:** 1,247 users
- **Failed Transactions:** 89 checkout attempts
- **Geographic Distribution:** Primarily US East Coast users

<chart>type: radar title: Service Health Impact description: Multi-dimensional service health comparison explanation: The radar chart provides a holistic view of service health across multiple dimensions. Notice how the frontend service shows degraded performance in user experience metrics while maintaining acceptable infrastructure metrics. This multi-dimensional analysis helps prioritize remediation efforts.</chart>

### User Experience Impact:
- Checkout process failures
- Payment processing delays  
- Session timeout issues
- Cart abandonment increase: +23%
`
    },
    {
      time: "03:04:14 AM",
      type: "ALERT",
      service: "webstore-frontend",
      title: "High rate of error responses triggered alert.",
      severity: "critical",
      content: `
## Critical Alert Details

**Alert Triggered:** TooManyErrorResponses
**Threshold Exceeded:** 15.2% error rate (threshold: 5%)
**Duration:** 15 minutes sustained

### Monitoring Dashboard
<chart>type: crypto title: Error Rate Trend description: Real-time error monitoring showing alert trigger point explanation: This trend line clearly shows the moment alert thresholds were breached at 03:04:14 AM. The sustained elevation above the 5% threshold for 15 minutes triggered the automated incident response. The chart helps validate alert sensitivity and response timing for future optimizations.</chart>

### Immediate Response Actions:
1. ✅ On-call engineer paged
2. ✅ Incident commander assigned  
3. ✅ War room established
4. 🔄 Rollback procedure initiated
5. ⏳ Customer communication pending

**Next Steps:**
- Complete rollback to stable version
- Implement additional null checks
- Enhanced testing for user data edge cases
`
    }
  ],
  metrics: {
    errorRate: 15.2,
    affectedUsers: 1247,
    impactDuration: "15 minutes",
    servicesAffected: 4
  }
};

const TaskReport: React.FC = () => {
  const [expandedTimeline, setExpandedTimeline] = useState<number | null>(null);
  const expandedContentStyle = {
    transition: 'all 0.3s ease-in-out',
    overflow: 'hidden'
  };

  const getSeverityColor = (severity: 'critical' | 'error' | 'warning' | 'info' | 'success' | string): string => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
      case 'error': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
      case 'warning': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300';
      case 'info': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      case 'success': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-400';
    }
  };

  const getStatusIcon = (status: 'ISSUES FOUND' | 'ALL GOOD' | string): JSX.Element => {
    switch (status) {
      case 'ISSUES FOUND': return <XCircle className="w-4 h-4 text-rose-500" />;
      case 'ALL GOOD': return <CheckCircle className="w-4 h-4 text-green-600" />;
      default: return <AlertTriangle className="w-4 h-4 text-orange-600" />;
    }
  };

  const getTimelineIcon = (type: string) => {
    switch (type) {
      case 'PR MERGED': return <GitBranch className="w-4 h-4" />;
      case 'APPLICATION DEPLOYMENT': return <Server className="w-4 h-4" />;
      case 'LOG ERRORS BEGAN': return <Bug className="w-4 h-4" />;
      case 'ERROR RATE SPIKED': return <TrendingUp className="w-4 h-4" />;
      case 'ERROR RATE INCREASED': return <Activity className="w-4 h-4" />;
      case 'ALERT': return <AlertTriangle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getSeverityIndicatorStyles = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-300 dark:bg-red-900 border-red-500/40 text-red-900 dark:text-gray-200';
      case 'error': return 'bg-rose-300 dark:bg-rose-900 border-rose-500/40 text-rose-900 dark:text-gray-200';
      case 'warning': return 'bg-orange-300 dark:bg-orange-900 border-orange-500/40 text-orange-900 dark:text-gray-200';
      case 'info': return 'bg-blue-300 dark:bg-blue-900 border-blue-500/40 text-blue-900 dark:text-gray-200';
      case 'success': return 'bg-green-300 dark:bg-green-900 border-green-500/40 text-green-900 dark:text-gray-200';
      default: return 'bg-gray-200 dark:bg-gray-700 border-gray-300/40 dark:border-gray-600';
    }
  };

  const toggleTimelineExpansion = (index: number) => {
    setExpandedTimeline(expandedTimeline === index ? null : index);
  };

  return (
    <div className="p-6 space-y-6 max-h-[92vh] overflow-y-auto
      [&::-webkit-scrollbar]:w-1.5 
      [&::-webkit-scrollbar-track]:bg-transparent 
      [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">

      {/* Header Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-orange-600" />
            <div>
              <h1 className="text-5xl dark:text-gray-500/40 font-[Anton] uppercase font-bold">Task Report</h1>
              <h1 className="text-xs text-gray-500 dark:text-gray-400">{reportData.id}</h1>
            </div>
          </div>

          <div className="flex gap-2">
            <Button className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Open Chat
            </Button>
            <Button>
              <Eye className="w-4 h-4 mr-2" />
              View Postmortem
            </Button>
          </div>
        </div>

        <Card className="bg-transparent dark:bg-gray-800/20 border-gray-200/70 dark:border-gray-700/30">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {reportData.title}
                </h2>
                <p className="text-xs text-gray-600 dark:text-gray-300 mb-4">
                  {reportData.description}
                </p>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-600 dark:text-gray-400">Duration: {reportData.duration}</span>
                  </div>
                  <Badge className={getSeverityColor('error')}>
                    {reportData.status}
                  </Badge>
                  <Badge className={getSeverityColor('warning')}>
                    {reportData.severity}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 max-w-md">
                {reportData.tags.map((tag, index) => (
                  <div key={index} className="bg-gray-200 dark:bg-gray-500/20 px-1.5 py-0.5 rounded-md text-xs text-gray-700 dark:text-gray-300">
                    {tag}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Impact Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-transparent dark:bg-gray-800/20 border-gray-200/70 dark:border-gray-700/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/20">
                <TrendingUp className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{reportData.metrics.errorRate}%</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Error Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-transparent dark:bg-gray-800/20 border-gray-200/70 dark:border-gray-700/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/20">
                <Globe className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{reportData.metrics.affectedUsers.toLocaleString()}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Affected Users</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-transparent dark:bg-gray-800/20 border-gray-200/70 dark:border-gray-700/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{reportData.metrics.impactDuration}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Impact Duration</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-transparent dark:bg-gray-800/20 border-gray-200/70 dark:border-gray-700/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/20">
                <Server className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{reportData.metrics.servicesAffected}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Services Affected</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Root Cause Analysis */}
        <Card className="bg-transparent dark:bg-gray-800/20 border-gray-200/70 dark:border-gray-700/30">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-purple-600 dark:text-blue-400">
              <Sparkles className="w-5 h-5" />
              {reportData.rootCause.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30 rounded-lg p-4">
              <p className="text-xs text-gray-700 dark:text-yellow-500">
                {reportData.rootCause.theory}
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-gray-900 dark:text-gray-100">Suggested Remediation</h4>
              <div className="text-xs text-gray-600 dark:text-gray-400 px-2">
                <MarkdownContent content={reportData.rootCause.remediation} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Checks */}
        <Card className="bg-transparent dark:bg-gray-800/20 border-gray-200/70 dark:border-gray-700/30">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-600" />
              What We've Checked
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reportData.checks.map((check, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-500/5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {getStatusIcon(check.status)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                        {check.category}
                      </span>
                      <Badge className={getSeverityColor(check.severity)} >
                        {check.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-300 truncate">
                      {check.description}
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Timeline Section with Markdown and Charts */}
      <Card className="bg-transparent border-gray-200/70 dark:border-gray-700/30">
        <CardHeader className="pb-4">
          <CardTitle className="text-xs flex items-center gap-2 text-yellow-800 dark:text-yellow-200 mb-2">
            <Calendar className="w-4 h-4" />
            Events
          </CardTitle>
          <Separator className='dark:bg-gray-400/10 h-[2px] rounded-full' />
        </CardHeader>
        <CardContent>
          <Timeline defaultValue={reportData.timeline.length} orientation="vertical">
            {reportData.timeline.map((event, index) => (
              <TimelineItem
                key={index}
                step={index + 1}
                className="group-data-[orientation=vertical]/timeline:ms-8 pb-6 last:pb-0"
              >
                <TimelineHeader>
                  <TimelineSeparator className="group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:h-[calc(100%-1rem)] group-data-[orientation=vertical]/timeline:translate-y-4" />

                  <TimelineIndicator className={`
                    flex size-6 p-1 items-center justify-center border-2 group-data-[orientation=vertical]/timeline:-left-6
                    ${getSeverityIndicatorStyles(event.severity)}
                  `}>
                    {getTimelineIcon(event.type)}
                  </TimelineIndicator>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {event.time}
                      </span>
                      <Badge className={getSeverityColor(event.severity)}>
                        {event.type}
                      </Badge>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {event.service}
                      </span>
                    </div>

                    <TimelineTitle className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                      {event.title}
                    </TimelineTitle>

                    {/* Expandable content button */}
                    {event.content && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleTimelineExpansion(index)}
                        className="mt-2 p-1 h-auto text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-all duration-200 flex items-center gap-1"
                      >
                        <ArrowRight className={`w-3 h-3 transition-transform duration-200 ${expandedTimeline === index ? 'rotate-90' : ''}`} />
                        {expandedTimeline === index ? 'Hide Details' : 'Show Detailed Analysis'}
                      </Button>
                    )}
                  </div>
                </TimelineHeader>

                <TimelineContent>
                  {event.description && !event.content && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                      {event.description}
                    </p>
                  )}

                  {/* Enhanced content with markdown and charts */}
                  {event.content && (
                    <div
                      className={`rounded-lg transition-all duration-300 ease-in-out overflow-hidden ${expandedTimeline === index ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'
                        }`}
                    >
                      <div className={`transform transition-transform duration-300 ${expandedTimeline === index ? 'translate-y-0' : '-translate-y-4'
                        }`}>
                        <MarkdownContent content={event.content} />
                      </div>
                    </div>
                  )}


                  {/* Basic description for collapsed state */}
                  {event.content && expandedTimeline !== index && event.description && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                      {event.description}
                    </p>
                  )}
                </TimelineContent>
              </TimelineItem>
            ))}
          </Timeline>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4">
        <div className="flex gap-3">

        </div>

        <div className="flex gap-3">
          <Button >
            Export Report
          </Button>
          <Button>
            Create Postmortem
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TaskReport;