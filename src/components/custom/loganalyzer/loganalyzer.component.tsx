import React, { useState, useRef, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Sparkles, X, Loader2, RotateCcw, User, Crown, ArrowUpRight, Copy, CheckCheck } from "lucide-react"
import MarkdownContent from '@/utils/markdown-formatter'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAuth } from '@/contexts/useAuth'
import { useNavigate } from 'react-router-dom'
import { openExternalUrl } from '@/api/external'
import { analyzeLogsStream, LogAnalysisRequest } from '@/api/log.analyzer'
import { jsonToYaml } from '@/utils/yaml'
import { getAgentModel } from '@/api/settings'

interface LogAnalyzerProps {
  logs: string
  podName: string
  namespace: string
  containerName: string
  clusterName: string
  podData?: any  // Optional pod data object for enhanced analysis
}

const LogAnalyzer: React.FC<LogAnalyzerProps> = ({
  logs,
  podName,
  namespace,
  containerName,
  clusterName,
  podData
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisContent, setAnalysisContent] = useState<string>('')
  const [hasFetched, setHasFetched] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [copied, setCopied] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { user, loading } = useAuth()
  const navigate = useNavigate()

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

    // Check if user is authenticated and block the request if not
    if (!user || !user.isAuthenticated) {
      return
    }

    // Check if user has exceeded their usage limit
    if (user.usage_limit && (user.usage_count || 0) >= user.usage_limit) {
      return
    }

    setIsAnalyzing(true)
    setAnalysisContent('')

    try {
      // Get the configured model for log analyzer
      const model = await getAgentModel('logAnalyzer')

      const request: LogAnalysisRequest = {
        logs: logs,
        pod_name: podName,
        namespace: namespace,
        container_name: containerName,
        cluster_name: clusterName,
        model: model,
        kubecontext: clusterName,
        pod_yaml: podData ? jsonToYaml(podData) : undefined
      }

      await analyzeLogsStream(request, {
        onContent: (_index: number, text: string) => {
          setAnalysisContent(prev => prev + text)
        },
        // onToolCall: (toolCall: any) => {
        //   // Handle tool calls if needed - commented out for now
        //   console.log('Tool call:', toolCall)
        // },
        onComplete: (reason: string) => {
          console.log('Analysis complete:', reason)
          setHasFetched(true)
          setIsAnalyzing(false)
        },
        onError: (error: Error) => {
          console.error('Error generating analysis:', error)
          setIsAnalyzing(false)
          setAnalysisContent('Failed to generate log analysis. Please try again.')
        }
      })

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

  const handleSignIn = () => {
    navigate('/settings/account')
  }

  const handleUpgrade = () => {
    openExternalUrl("https://account.agentkube.com")
  }

  const handleDismiss = () => {
    setIsDismissed(true)
  }

  const handleCopyAnalysis = async () => {
    if (analysisContent) {
      await navigator.clipboard.writeText(analysisContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Check if we should show sign in
  const shouldShowSignIn = !loading && (!user || !user.isAuthenticated)

  // Check if we should show upgrade
  const shouldShowUpgrade = !loading && user?.isAuthenticated && !isDismissed && (() => {
    const usagePercentage = user.usage_limit && user.usage_count ? (user.usage_count / user.usage_limit) * 100 : 0
    const hasExceededLimit = user.usage_limit && (user.usage_count || 0) >= user.usage_limit
    return hasExceededLimit || usagePercentage >= 80
  })()

  const hasExceededLimit = user?.usage_limit && (user?.usage_count || 0) >= user?.usage_limit

  // Sign In Component
  const SignInComponent = () => (
    <div className="px-4 py-3 bg-blue-500/10 border-t border-blue-200 dark:border-blue-800/50">
      <div className="flex items-start justify-between">
        <div className="flex items-start justify-between w-full space-x-3">
          <div className="flex-shrink-0">
            <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex items-center justify-between w-full">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-0.5 leading-tight">
                Sign In
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-tight">
                Sign in to access AI log analysis.
              </p>
            </div>
            <Button
              onClick={handleSignIn}
              className="flex justify-between min-w-28 bg-blue-600 hover:bg-blue-700 text-white h-7 px-3 text-xs"
            >
              Sign In
              <ArrowUpRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  // Upgrade Component
  const UpgradeComponent = () => (
    <div className={`px-4 py-3 border-t ${hasExceededLimit
      ? 'bg-gradient-to-r from-blue-500/10 to-gray-500/10 border-red-200 dark:border-red-800/50'
      : 'bg-gradient-to-r from-yellow-500/10 to-gray-500/10 border-orange-200 dark:border-orange-800/50'
      }`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start w-full space-x-3">
          <div className="flex-shrink-0">
            <Crown className={`h-5 w-5 ${hasExceededLimit
              ? 'text-red-600 dark:text-red-400'
              : 'text-orange-600 dark:text-orange-400'
              }`} />
          </div>
          <div className="flex items-center justify-between w-full">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                {hasExceededLimit ? 'Usage Limit Exceeded' : 'Credits Running Low'}
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {hasExceededLimit
                  ? `You've reached your limit of ${user?.usage_limit} credits. Upgrade to continue.`
                  : `You've used ${user?.usage_count} of ${user?.usage_limit} credits. Upgrade for unlimited usage.`
                }
              </p>
            </div>
            <Button
              onClick={handleUpgrade}
              size="sm"
              className={`text-white h-7 w-32 flex justify-between px-3 text-xs ${hasExceededLimit
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-orange-600 hover:bg-orange-700'
                }`}
            >
              Upgrade
              <ArrowUpRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="ml-3 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

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
                  <div className="flex"><span className="text-gray-500 w-20">Namespace</span>
                    <span className="text-blue-600 dark:text-blue-400 hover:text-blue-500 hover:underline cursor-pointer" onClick={() => navigate(`/dashboard/explore/namespaces/${namespace}`)}>
                      {namespace}
                    </span>
                  </div>
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
                    <div className="flex py-4">
                      <Loader2 className="h-4 w-4 animate-spin mr-2 text-gray-200 dark:text-gray-600" />
                      <span className="text-xs dark:text-gray-500">Analyzing logs...</span>
                    </div>
                  )}

                  {analysisContent && (
                    <div className="relative py-8">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-4 right-0 h-1 w-8 p-0 z-10 bg-gray-800/50 hover:bg-gray-700/70 text-gray-300 hover:text-white backdrop-blur-sm"
                        onClick={handleCopyAnalysis}
                      >
                        {copied ? <CheckCheck className="text-green-500 h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <div className="text-xs text-gray-300">
                        <MarkdownContent content={analysisContent} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sign In Component */}
              {shouldShowSignIn && <SignInComponent />}

              {/* Upgrade Component */}
              {shouldShowUpgrade && <UpgradeComponent />}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

export default LogAnalyzer