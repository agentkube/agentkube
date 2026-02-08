import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardFooter } from '@/components/ui/card';
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/ui/stepper";
import { Play, RotateCcw, Send } from 'lucide-react';
import { openExternalUrl } from '@/api/external';

interface HealthCheck {
  id: number;
  title: string;
  endpoint: string;
  status: 'pending' | 'checking' | 'success' | 'failed';
}

const NetworkDiagnosis: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const [checks, setChecks] = useState<HealthCheck[]>([
    { id: 1, title: 'Proxy Service', endpoint: 'http://localhost:4688/ping', status: 'pending' },
    { id: 2, title: 'Agent Service', endpoint: 'http://localhost:4689/health', status: 'pending' },
    { id: 3, title: 'Authentication Service', endpoint: 'http://localhost:4689/orchestrator/api/auth/user', status: 'pending' },
    { id: 4, title: 'Security Scan Service', endpoint: 'https://scan.agentkube.com/health', status: 'pending' },
    { id: 5, title: 'Internet Connectivity', endpoint: 'https://httpbin.org/get', status: 'pending' },
    { id: 6, title: 'DNS Resolution', endpoint: 'https://1.1.1.1/dns-query?name=google.com&type=A', status: 'pending' }
  ]);

  const checkHealth = async (endpoint: string): Promise<boolean> => {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  };

  const runDiagnosis = async () => {
    setIsRunning(true);
    setCurrentStep(0);

    // Reset all checks
    setChecks(prev => prev.map(check => ({ ...check, status: 'pending' as const })));

    for (let i = 0; i < checks.length; i++) {
      setCurrentStep(i + 1);

      // Set current check to checking
      setChecks(prev => prev.map((check, index) =>
        index === i ? { ...check, status: 'checking' as const } : check
      ));

      // Run the health check
      const isHealthy = await checkHealth(checks[i].endpoint);

      // Update status
      setChecks(prev => prev.map((check, index) =>
        index === i ? { ...check, status: isHealthy ? 'success' as const : 'failed' as const } : check
      ));

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsRunning(false);
  };

  const resetDiagnosis = () => {
    setIsRunning(false);
    setCurrentStep(0);
    setChecks(prev => prev.map(check => ({ ...check, status: 'pending' as const })));
  };

  const sendDiagnosisReport = async () => {
    const timestamp = new Date().toISOString();
    const successful = checks.filter(c => c.status === 'success').length;
    const total = checks.length;
    
    const reportBody = `Network Diagnosis Report
Generated: ${timestamp}
Status: ${successful}/${total} services healthy

Service Details:
${checks.map(check => `• ${check.title}: ${check.status.toUpperCase()}`).join('\n')}

Environment: AgentKube Tauri Platform
`;

    const subject = `Network Diagnosis Report - ${successful}/${total} Services Healthy`;
    const mailtoUrl = `mailto:info@agentkube.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reportBody)}`;
    
    try {
      await openExternalUrl(mailtoUrl);
    } catch (error) {
      console.error('Failed to open email client:', error);
    }
  };

  return (
    <div className="p-4 text-gray-800 dark:text-white">
      <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium mb-6">
        Network Diagnostics
      </h1>

      <Card className="p-4 mb-2 flex items-end justify-between border ">
        <div className="">
          <h2 className="text-lg font-light mb-1">System Diagnosis</h2>
          <p className="text-sm text-muted-foreground">Check network connectivity to backend AI services</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runDiagnosis} disabled={isRunning}>
            <Play className="h-4 w-4 mr-2" />
            {isRunning ? 'Running...' : 'Run Diagnostic'}
          </Button>
          <Button variant="outline" onClick={resetDiagnosis} disabled={isRunning}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
      </Card>

      {currentStep > 0 && (
        <Card className="p-4 mb-6 dark:bg-gray-800/10 justify-between border dark:border-gray-600/30">
          <Stepper value={currentStep} orientation="vertical">
            {checks.map((check, index) => (
              <StepperItem
                key={check.id}
                step={index + 1}
                completed={check.status === 'success'}
                loading={check.status === 'checking'}
                className="relative items-start not-last:flex-1"
              >
                <StepperTrigger className="items-start rounded pb-6 last:pb-0">
                  <StepperIndicator/>
                  <div className="px-2 text-left">
                    <StepperTitle>{check.title}</StepperTitle>
                    <div className="text-sm font-medium">
                      {check.status === 'pending' && <span className="text-gray-500">Pending</span>}
                      {check.status === 'checking' && <span className="text-blue-500">Checking...</span>}
                      {check.status === 'success' && <span className="text-green-600">Healthy</span>}
                      {check.status === 'failed' && <span className="text-red-600">Failed</span>}
                    </div>
                  </div>
                </StepperTrigger>
                {index < checks.length - 1 && (
                  <StepperSeparator className="absolute inset-y-0 top-[calc(1.5rem+0.125rem)] left-3 -order-1 m-0 -translate-x-1/2 group-data-[orientation=horizontal]/stepper:w-[calc(100%-1.5rem-0.25rem)] group-data-[orientation=horizontal]/stepper:flex-none group-data-[orientation=vertical]/stepper:h-[calc(100%-1.5rem-0.25rem)]" />
                )}
              </StepperItem>
            ))}
          </Stepper>

          <CardFooter className="flex justify-between items-center">
            {!isRunning && currentStep > 0 && (
              <div className='flex items-end w-full'>
                <div className="p-4 mt-2 bg-gray-300/30 dark:bg-gray-800/30 flex-1 rounded-lg dark:text-gray-500" >
                  <p className="text-sm">
                    Diagnosis completed. {checks.filter(c => c.status === 'success').length}/{checks.length} services healthy
                  </p>
                </div>
                <Button 
                  // variant="outline" 
                  size="sm" 
                  onClick={sendDiagnosisReport}
                  className="ml-4"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send Diagnosis
                </Button>
              </div>
            )}
          </CardFooter>
        </Card>
      )}


    </div>
  );
};

export default NetworkDiagnosis;