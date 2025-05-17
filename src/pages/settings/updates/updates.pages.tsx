import React, { useState, useEffect } from 'react';
import { Sparkles, Download, ExternalLink, CheckCircle, Info, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getVersion } from '@tauri-apps/api/app';
import { platform } from '@tauri-apps/plugin-os';
import { openExternalUrl } from '@/api/external';

// Define types for Update object
interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall: (callback: (event: UpdateEvent) => void) => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
}

interface UpdateEventStarted {
  event: 'Started';
  data: {
    contentLength: number;
  };
}

interface UpdateEventProgress {
  event: 'Progress';
  data: {
    chunkLength: number;
  };
}

interface UpdateEventFinished {
  event: 'Finished';
}

type UpdateEvent = UpdateEventStarted | UpdateEventProgress | UpdateEventFinished;

// Only import Tauri APIs in a client-side context
let updaterModule: Promise<any> | null = null;
let processModule: Promise<any> | null = null;

// Only initialize these in a browser environment
if (typeof window !== 'undefined') {
  try {
    updaterModule = import('@tauri-apps/plugin-updater');
    processModule = import('@tauri-apps/plugin-process');
  } catch (err) {
    console.error('Tauri modules could not be imported:', err);
  }
}

const Updates: React.FC = () => {
  const [checking, setChecking] = useState<boolean>(false);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [installing, setInstalling] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>("1.0.0");
  const [currentPlatform, setCurrentPlatform] = useState<string>("unknown");
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'installing' | 'error' | 'success'>('idle');
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        const appVersion = await getVersion();
        setCurrentVersion(appVersion);
        
        const osType = await platform();
        setCurrentPlatform(osType);
      } catch (err) {
        console.error("Failed to fetch system info:", err);
      }
    };

    fetchSystemInfo();
  }, []);

  const checkForUpdates = async (): Promise<void> => {
    // Only run if we're in a Tauri environment
    if (!updaterModule) {
      setError("Update functionality not available in this environment");
      return;
    }

    try {
      setChecking(true);
      setUpdateStatus('checking');
      setError(null);

      const { check } = await updaterModule;
      const update = await check();

      if (update) {
        setUpdateAvailable(true);
        setUpdateInfo(update);
        setUpdateStatus('available');
        console.log('Update available:', update);
      } else {
        setUpdateAvailable(false);
        setUpdateStatus('not-available');
        console.log('No updates available');
      }
      
      // Set last checked time
      setLastChecked(new Date().toLocaleString());
    } catch (err: any) {
      console.error('Failed to check for updates:', err);
      setError(`Failed to check for updates: ${err.message}`);
      setUpdateStatus('error');
    } finally {
      setChecking(false);
    }
  };

  // Check for updates when component mounts
  useEffect(() => {
    const initialCheck = async (): Promise<void> => {
      // Wait a moment before checking to ensure app is fully loaded
      setTimeout(() => checkForUpdates(), 1000);
    };

    initialCheck();
  }, []);

  const downloadUpdate = async (): Promise<void> => {
    if (!updateInfo || !updaterModule) return;

    try {
      setDownloading(true);
      setUpdateStatus('downloading');

      let downloaded: number = 0;
      let contentLength: number = 0;

      await updateInfo.downloadAndInstall((event: UpdateEvent) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength;
            console.log(`Started downloading ${contentLength} bytes`);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            const progress: number = Math.min(Math.round((downloaded / contentLength) * 100), 100);
            setDownloadProgress(progress);
            console.log(`Downloaded ${downloaded} of ${contentLength} bytes (${progress}%)`);
            break;
          case 'Finished':
            console.log('Download finished');
            setDownloadProgress(100);
            break;
        }
      });

      setUpdateStatus('success');
    } catch (err: any) {
      console.error('Failed to download update:', err);
      setError(`Failed to download update: ${err.message}`);
      setUpdateStatus('error');
    } finally {
      setDownloading(false);
    }
  };

  const installUpdate = async (): Promise<void> => {
    if (!updateInfo || !processModule) return;

    try {
      setInstalling(true);
      setUpdateStatus('installing');

      const { relaunch } = await processModule;
      await updateInfo.install();
      console.log('Update installed, relaunching...');
      await relaunch();
    } catch (err: any) {
      console.error('Failed to install update:', err);
      setError(`Failed to install update: ${err.message}`);
      setUpdateStatus('error');
      setInstalling(false);
    }
  };

  const handleManualDownload = () => {
    openExternalUrl("https://agentkube.com/downloads");
  };

  const StatusCard = () => {
    const getStatusContent = () => {
      switch (updateStatus) {
        case 'checking':
          return (
            <>
              <div className="flex items-center mb-4">
                <Loader2 className="h-5 w-5 animate-spin mr-2 text-blue-500" />
                <span>Checking for updates...</span>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                We're checking if there's a new version available for your {currentPlatform} system.
              </p>
            </>
          );
        case 'available':
          return (
            <>
              <div className="flex items-center mb-4">
                <Sparkles className="h-5 w-5 mr-2 text-amber-500" />
                <span className="font-medium">Update available: v{updateInfo?.version}</span>
              </div>
              {updateInfo?.body && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-1">Release Notes:</h4>
                  <div className="text-sm bg-gray-100 dark:bg-gray-800/50 p-3 rounded-md max-h-[200px] overflow-y-auto">
                    {updateInfo.body}
                  </div>
                </div>
              )}
              <div className="flex space-x-2 mt-4">
                <Button 
                  variant="outline"
                  onClick={downloadUpdate}
                  disabled={downloading || installing}
                  className="flex items-center"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download & Install
                </Button>
              </div>
            </>
          );
        case 'not-available':
          return (
            <>
              <div className="flex items-center mb-4">
                <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
                <span>You're up to date!</span>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                You're running the latest version (v{currentVersion}) of Agentkube.
                {lastChecked && ` Last checked: ${lastChecked}`}
              </p>
              <Button 
                variant="outline"
                onClick={checkForUpdates}
                disabled={checking}
                className="mt-4"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
                Check Again
              </Button>
            </>
          );
        case 'downloading':
          return (
            <>
              <div className="flex items-center mb-4">
                <Download className="h-5 w-5 mr-2 text-blue-500" />
                <span>Downloading update...</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Progress</span>
                  <span className="text-sm">{downloadProgress}%</span>
                </div>
                <Progress value={downloadProgress} className="h-2" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-4">
                Please don't close the application during the update process.
              </p>
            </>
          );
        case 'installing':
          return (
            <>
              <div className="flex items-center mb-4">
                <Loader2 className="h-5 w-5 animate-spin mr-2 text-blue-500" />
                <span>Installing update...</span>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Almost there! The application will restart automatically when installation is complete.
              </p>
            </>
          );
        case 'error':
          return (
            <>
              <div className="flex items-center mb-4">
                <AlertTriangle className="h-5 w-5 mr-2 text-red-500" />
                <span className="text-red-500">Update failed</span>
              </div>
              {error && (
                <Alert variant="destructive" className="mb-4 bg-red-500/10 border border-red-500/20">
                  <AlertDescription className="text-red-400 text-sm">
                    {error}
                  </AlertDescription>
                </Alert>
              )}
              <div className="mt-4 bg-blue-500/10 border border-blue-500/20 rounded-md p-3">
                <p className="text-sm text-blue-400 flex items-start">
                  <ExternalLink className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                  <span>
                    If automatic installation fails, please install it manually from
                    <a
                      onClick={handleManualDownload}
                      className="text-blue-400 underline ml-1 cursor-pointer hover:text-blue-300"
                    >
                      agentkube.com/downloads
                    </a>
                  </span>
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={checkForUpdates}
                className="mt-4"
              >
                Try Again
              </Button>
            </>
          );
        case 'success':
          return (
            <>
              <div className="flex items-center mb-4">
                <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
                <span className="text-green-500">Update downloaded successfully</span>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                The update has been downloaded and is ready to install. The application will restart after installation.
              </p>
              <Button 
                variant="default"
                onClick={installUpdate}
                disabled={installing}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {installing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Install Now
                  </>
                )}
              </Button>
            </>
          );
        default:
          return (
            <>
              <div className="flex items-center mb-4">
                <Info className="h-5 w-5 mr-2 text-blue-500" />
                <span>Update status</span>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Current version: v{currentVersion}
                {lastChecked && <span className="block mt-1">Last checked: {lastChecked}</span>}
              </p>
              <Button 
                variant="outline"
                onClick={checkForUpdates}
                disabled={checking}
                className="mt-4"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
                Check for Updates
              </Button>
            </>
          );
      }
    };

    return (
      <Card className="bg-white dark:bg-transparent border-gray-200 dark:border-gray-800">
        <CardHeader>
          <CardTitle>Updates</CardTitle>
          <CardDescription>Check and install application updates</CardDescription>
        </CardHeader>
        <CardContent>
          {getStatusContent()}
        </CardContent>
      </Card>
    );
  };

  const VersionInfo = () => {
    return (
      <Card className="bg-white dark:bg-transparent border-gray-200 dark:border-gray-800 mt-6 w-96">
        <CardHeader>
          <CardTitle>About Agentkube</CardTitle>
          <CardDescription>System information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Version</span>
              <span>v{currentVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Platform</span>
              <span>{currentPlatform}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Release Channel</span>
              <span>Stable</span>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
              <Button 
                variant="link" 
                onClick={() => openExternalUrl("https://docs.agentkube.com/changelog")}
                className="text-blue-600 hover:text-blue-500 p-0 h-auto dark:text-blue-400 dark:hover:text-blue-300"
              >
                View Changelog
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 space-y-6 max-h-[92vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
      <div>
        <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-700/50">Updates</h1>
        <p className="text-gray-500 dark:text-gray-400">Manage application updates</p>
      </div>

      <div className="space-y-4">
        <div>
          <VersionInfo />
        </div>
        <div className="md:col-span-2">
          <StatusCard />
        </div>
  
      </div>
    </div>
  );
};

export default Updates;