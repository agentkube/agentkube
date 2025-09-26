import React, { useState, useRef, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Sparkles, X, Loader2, RotateCcw } from "lucide-react"
import MarkdownContent from '@/utils/markdown-formatter'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface LogAnalyzerProps {
  logs: string
  podName: string
  namespace: string
  containerName: string
  clusterName: string
}

const LogAnalyzer: React.FC<LogAnalyzerProps> = ({
  logs,
  podName,
  namespace,
  containerName,
  clusterName
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisContent, setAnalysisContent] = useState<string>('')
  const [hasFetched, setHasFetched] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const startAnalysis = async () => {
    if (isAnalyzing || hasFetched) return

    setIsAnalyzing(true)
    setAnalysisContent('')

    let responseText = ''

    try {
      // Mock streaming analysis with markdown content
      const mockAnalysisText = `
\`\`\`bash
${logs}
\`\`\`

### Error Detection
Found 3 critical errors in the logs:
- Connection timeout to database (2 occurrences)
- Memory allocation failure at 14:32:15
- Invalid configuration parameter \`max_connections\`

### Performance Analysis
Performance insights for ${podName}:
- Average response time: **245ms**
- Memory usage peaked at **85%**
- 12 slow queries detected (>1s execution time)

### Pattern Recognition
Recurring patterns detected:
- High request volume every 15 minutes
- Error rate spikes correlate with memory pressure  
- Restart cycle detected every 4 hours

### Security Scan
Security analysis results:
- No critical vulnerabilities found
- 2 failed authentication attempts
- SSL certificate expires in 30 days

## Recommendations

1. **Database Connection Pool**: Increase connection timeout values
2. **Memory Management**: Add resource limits to prevent OOM kills
3. **Configuration**: Fix the invalid \`max_connections\` parameter
4. **Monitoring**: Set up alerts for memory usage > 80%

\`\`\`yaml
# Recommended resource limits
resources:
  limits:
    memory: "512Mi"
    cpu: "500m"
  requests:
    memory: "256Mi"
    cpu: "250m"
\`\`\`

`

      // Simulate streaming by adding text gradually
      const words = mockAnalysisText.split(' ')

      for (let i = 0; i < words.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 50))
        responseText += (i === 0 ? '' : ' ') + words[i]
        setAnalysisContent(responseText)
      }

      setHasFetched(true)
      setIsAnalyzing(false)

    } catch (error) {
      console.error('Error generating analysis:', error)
      setIsAnalyzing(false)
      setAnalysisContent('Failed to generate log analysis. Please try again.')
    }
  }

  const handleClick = () => {
    if (!hasFetched) {
      startAnalysis()
    }
    setIsOpen(!isOpen)
  }

  const handleRerun = () => {
    setHasFetched(false)
    setAnalysisContent('')
    startAnalysis()
  }

  return (
    <TooltipProvider>
      <div className="relative" ref={dropdownRef}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="h-full gap-2"
              onClick={handleClick}
              variant={isOpen ? "default" : "outline"}
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="p-1">
            <p>AI Analysis</p>
          </TooltipContent>
        </Tooltip>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-96 bg-[#0B0D13]/60 backdrop-blur-lg border border-gray-800/50 rounded-lg shadow-lg z-50">
          <div>
            <div className="flex items-center justify-between mb-4 pt-4 px-4">
              <div className='flex items-center gap-2'>
                <Sparkles className='h-4 w-4' />
                <h3 className="text-lg font-light text-white">AI Analysis</h3>

              </div>
              <div className='flex items-center'>
                {hasFetched && (
                  <Button
                        variant="ghost"
                  size="sm"
                    onClick={handleRerun}
                    disabled={isAnalyzing}
                    className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                  >
                    <RotateCcw />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-3 mb-2 px-4">
              <div className="text-xs text-neutral-800 dark:text-gray-200 space-y-1">
                <div className="flex"><span className="text-gray-500 w-20">Container</span> {containerName}</div>
                <div className="flex"><span className="text-gray-500 w-20">Pod</span> {podName}</div>
                <div className="flex"><span className="text-gray-500 w-20">Namespace</span> {namespace}</div>
                <div className="flex"><span className="text-gray-500 w-20">Cluster</span> {clusterName}</div>
              </div>
            </div>
            {!hasFetched && !isAnalyzing ? (
              <div className="text-center py-6 px-4 bg-gray-300 dark:bg-gray-700/20 border-t border-gray-500/30 dark:border-gray-500/30">
                <Sparkles className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400 mb-4">Ready to analyze your logs</p>
                <Button
                  onClick={startAnalysis}
                  disabled={isAnalyzing}
                  className="w-full"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Start Analysis
                </Button>
              </div>
            ) : (
              <div className="bg-gray-300 dark:bg-gray-700/20 border-t border-gray-500/30 dark:border-gray-500/30 max-h-80 overflow-y-auto 
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50 px-4">
                {isAnalyzing && (
                  <div className="flex pt-4">
                    <Loader2 className="h-4 w-4 animate-spin mr-2 text-gray-200 dark:text-gray-600" />
                    <span className="text-xs dark:text-gray-500">Analyzing logs...</span>
                  </div>
                )}

                {analysisContent && (
                  <div className="text-xs text-gray-300">
                    <MarkdownContent content={analysisContent} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </TooltipProvider>
  )
}

export default LogAnalyzer