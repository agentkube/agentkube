import { Rss, Sparkles, Terminal, Download, ExternalLink, Lightbulb, ScanSearch, Bell, BellDot } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import TerminalContainer from '../terminal/terminalcontainer.component';
import { openExternalUrl } from '@/api/external';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
// import { currentVersion } from '@/config';
import { getVersion } from '@tauri-apps/api/app';
import TipsModal from '../tips/tips.component';
import { ModalProvider } from '@/components/ui/animatedmodal';
import NotificationDropdown from '../notificationdropdown/notificationdropdown.component';
import { useBackgroundTask } from '@/contexts/useBackgroundTask';
import BackgroundTaskDialog from '../backgroundtaskdialog/backgroundtaskdialog.component';
import VulnScanFooterTool from '../vulnscanfootertool/vulnscanfootertool.component';

// Define types for Update object
interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall: (callback: (event: UpdateEvent) => void) => Promise<void>;
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

const Footer: React.FC = () => {
  const [checking, setChecking] = useState<boolean>(false);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [installing, setInstalling] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>("v1.0.0")
  const { isOpen: isBackgroundTaskOpen, onClose: closeBackgroundTask, setIsOpen } = useBackgroundTask();


  useEffect(() => {
    const fetchVersion = async () => {
      const appVersion = await getVersion()

      console.log("The App version", appVersion)
      setCurrentVersion(appVersion)
    }

    fetchVersion();
  }, [])


  const checkForUpdates = async (): Promise<void> => {
    // Only run if we're in a Tauri environment
    if (!updaterModule) return;

    try {
      setChecking(true);
      setError(null);

      const { check } = await updaterModule;
      const update = await check();

      if (update) {
        setUpdateAvailable(true);
        setUpdateInfo(update);
        console.log('Update available:', update);
      } else {
        setUpdateAvailable(false);
        console.log('No updates available');
      }
    } catch (err: any) {
      console.error('Failed to check for updates:', err);
      setError(`Failed to check for updates: ${err.message}`);
    } finally {
      setChecking(false);
    }
  };

  // Check for updates when component mounts
  useEffect(() => {
    const initialCheck = async (): Promise<void> => {
      // Wait a moment before checking to ensure app is fully loaded
      setTimeout(() => checkForUpdates(), 2000);
    };

    initialCheck();
  }, []);

  const installUpdate = async (): Promise<void> => {
    if (!updateInfo || !updaterModule || !processModule) return;

    try {
      setInstalling(true);

      let downloaded: number = 0;
      let contentLength: number = 0;

      const { relaunch } = await processModule;

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

      console.log('Update installed, relaunching...');
      await relaunch();
    } catch (err: any) {
      console.error('Failed to install update:', err);
      setError(`Failed to install update: ${err.message}`);
      setInstalling(false);
    }
  };

  const openUpdateDialog = (): void => {
    setDialogOpen(true);
  };

  const UpdateIcon: React.FC = () => {
    if (checking) {
      return <Rss className="h-3 w-3 animate-spin" />;
    }

    if (updateAvailable) {
      return <Sparkles className="h-3 w-3 text-amber-400" />;
    }

    return <Rss className="h-3 w-3" />;
  };

  const handleManualDownload = () => {
    openExternalUrl("https://agentkube.com/downloads");
  };


  return (
    <footer className="absolute w-full bottom-0 text-xs border-t dark:border-gray-300/10 pr-2">
      <div className="flex justify-between items-center">
        <div className='flex items-center '>
          <TerminalContainer />
          <div
            className='backdrop-blur-md cursor-pointer py-1 px-2 text-xs dark:text-gray-300 hover:bg-gray-800/50 flex gap-1.5 items-center'
            onClick={() => setIsOpen(true)}
          >
            <ScanSearch className='h-3 w-3' /> <span>Investigation Task</span>
          </div>
        </div>
        <div className="flex">
          <button className="text-gray-600 backdrop-blur-md px-2 py-1 hover:bg-gray-200/10 hover:dark:bg-gray-200/10">
            v{currentVersion}
          </button>

          <VulnScanFooterTool />

          <button
            onClick={() => openExternalUrl("https://docs.agentkube.com/changelog")}
            className="text-blue-600 backdrop-blur-md hover:text-blue-500 cursor-pointer group px-2 hover:bg-gray-100/10"
          >
            changelog
          </button>

          <ModalProvider>
            <TipsModal />
          </ModalProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="text-gray-500 py-1.5 px-2 group backdrop-blur-md hover:bg-gray-100/10 hover:text-gray-300 transition-all cursor-pointer"
                  onClick={updateAvailable ? openUpdateDialog : checkForUpdates}
                >
                  {updateAvailable ? (
                    <div className="flex items-center space-x-2">
                      <Sparkles className="h-3 w-3 text-amber-400" />
                      <span className="text-amber-400">{updateInfo ? `v${updateInfo.version} available` : 'Update available'}</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <UpdateIcon />
                      {checking && <span>Checking...</span>}
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent className="bg-white dark:bg-[#131112] text-gray-900 dark:text-gray-100 space-y-2">
                <button
                  className="rounded-[0.3rem] py-1 px-3 bg-gray-200 dark:bg-gray-400/10 hover:dark:bg-gray-300/10 transition-all"
                  onClick={updateAvailable ? openUpdateDialog : checkForUpdates}
                >
                  {updateAvailable ? 'Install update' : 'Check for updates'}
                </button>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <NotificationDropdown className="py-1.5" />
        </div>
      </div>

      <BackgroundTaskDialog
        isOpen={isBackgroundTaskOpen}
        onClose={closeBackgroundTask}
        resourceName=""
        resourceType=""
      />

      {/* Update Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-white dark:bg-black dark:bg-gradient-to-b dark:from-blue-400/10 dark:to-gray-950/50 backdrop-blur-md text-gray-100 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-black dark:text-gray-200 text-2xl font-[Anton] uppercase flex items-center"><Sparkles className='text-yellow-400 h-5 w-5 mr-2' /> Update Available</DialogTitle>
            <DialogDescription className="text-black dark:text-gray-400">
              {updateInfo && (
                <div className="space-y-2 py-2">
                  <p>A new version of Agentkube is available: v{updateInfo.version}</p>

                  {updateInfo.body && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium mb-1">Release Notes:</h4>
                      <div className="text-sm bg-gray-200 dark:bg-gray-200/10 p-3 rounded-xl max-h-[200px] overflow-y-auto">
                        {updateInfo.body}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          {installing && (
            <div className="space-y-2 py-4">
              <div className="flex items-center justify-between">
                <span>Downloading update...</span>
                <span>{downloadProgress}%</span>
              </div>
              <Progress value={downloadProgress} className="h-2" />
            </div>
          )}

          {error && (
            <div className="py-2">
              <Alert variant="destructive" className="bg-red-500/10 border border-red-500/20">
                <AlertDescription className="text-red-400 text-sm">
                  {error}
                </AlertDescription>
              </Alert>

              {/* Manual installation note */}
              <div className="mt-3 bg-blue-500/10 border border-blue-500/20 rounded-md p-3">
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
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={installing}
              className="bg-gray-200 dark:bg-transparent text-gray-800 dark:text-gray-300 hover:bg-gray-300 hover:dark:bg-gray-800"
            >
              Later
            </Button>
            <Button
              onClick={installUpdate}
              disabled={installing}
              className="bg-blue-600 dark:bg-gray-200/10 hover:bg-blue-700 text-white"
            >
              {installing ? (
                <>
                  <Download className="mr-2 h-4 w-4 animate-pulse" />
                  Installing...
                </>
              ) : (
                'Install Now'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </footer>
  );
};

export default Footer;