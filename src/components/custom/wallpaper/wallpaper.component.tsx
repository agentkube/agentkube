import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import WALL1 from '@/assets/background/wall.jpg';
import WALL2 from '@/assets/background/wall2.jpg';
import WALL3 from '@/assets/background/wall3.jpg';
import WALLPAPER from '@/assets/background/wallpaper.avif';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

const Wallpaper = () => {
  const [selectedWallpaper, setSelectedWallpaper] = useState('wall.jpg');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { toast } = useToast();

  // TODO: Implement fetchSettings when backend is ready
  // useEffect(() => {
  //   const fetchSettings = async () => {
  //     try {
  //       setIsLoading(true);
  //       const settings = await getSettings();
  //       setSelectedWallpaper(settings.wallpaper.selectedWallpaper || 'wall.jpg');
  //     } catch (error) {
  //       console.error('Failed to load wallpaper settings:', error);
  //       toast({
  //         title: "Error loading settings",
  //         description: "Could not load wallpaper settings. Please try again.",
  //         variant: "destructive",
  //       });
  //     } finally {
  //       setIsLoading(false);
  //     }
  //   };
  //   fetchSettings();
  // }, [toast]);

  // Handle wallpaper change
  const handleWallpaperChange = async (wallpaper: string) => {
    try {
      setIsSaving(true);
      setSelectedWallpaper(wallpaper);

      // TODO: Implement updateSettings when backend is ready
      // await updateSettings('wallpaper', {
      //   selectedWallpaper: wallpaper
      // });

      // Apply wallpaper to document
      document.documentElement.style.setProperty('--background-wallpaper', `url(@/assets/background/${wallpaper})`);

      toast({
        title: "Wallpaper updated",
        description: `Background has been updated to ${wallpaperOptions.find(w => w.id === wallpaper)?.name}.`,
      });
    } catch (error) {
      console.error('Failed to save wallpaper settings:', error);
      toast({
        title: "Error saving settings",
        description: "Could not save wallpaper settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const wallpaperOptions = [
    { id: 'wall.jpg', name: 'Flora', image: WALL1 },
    { id: 'wall3.jpg', name: 'Blue Mountains', image: WALL3 },
    { id: 'wallpaper.avif', name: 'Golden Threads', image: WALLPAPER },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full p-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-500">Loading wallpaper settings...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Wallpaper Selection */}
      <div className="mb-8">
        <h2 className="text-lg font-medium mb-2">Background Options</h2>
        <p className="text-gray-700 dark:text-gray-400 text-sm mb-4">
         Choose a background wallpaper for your workspace
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {wallpaperOptions.map((wallpaper) => (
            <button
              key={wallpaper.id}
              disabled={isSaving}
              className={`flex flex-col items-center p-3 rounded border transition-all duration-200 ${selectedWallpaper === wallpaper.id
                ? 'border-blue-500 bg-gray-100 dark:bg-gray-800 shadow-lg'
                : 'border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 hover:shadow-md'
                }`}
              onClick={() => handleWallpaperChange(wallpaper.id)}
            >
              <div className="relative mb-2 w-full">
                <img 
                  src={wallpaper.image} 
                  alt={wallpaper.name} 
                  className="w-full h-36 object-cover rounded-md shadow-sm"
                />
                {selectedWallpaper === wallpaper.id && (
                  <div className="absolute top-1 right-1 bg-blue-500 rounded-full p-1">
                    <Check size={12} className="text-white" />
                  </div>
                )}
              </div>
              <span className="text-sm font-medium">{wallpaper.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Save button */}
      {/* <div className="flex justify-end">
        <Button
          className="flex items-center gap-2"
          disabled={isSaving}
          onClick={async () => {
            try {
              setIsSaving(true);
              
              // TODO: Implement updateSettings when backend is ready
              // await updateSettings('wallpaper', {
              //   selectedWallpaper
              // });

              toast({
                title: "Wallpaper settings saved",
                description: "Your wallpaper preferences have been saved successfully.",
              });
            } catch (error) {
              console.error('Failed to save wallpaper settings:', error);
              toast({
                title: "Error saving settings",
                description: "Could not save wallpaper settings. Please try again.",
                variant: "destructive",
              });
            } finally {
              setIsSaving(false);
            }
          }}
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>Save Wallpaper</>
          )}
        </Button>
      </div> */}
    </div>
  );
};

export default Wallpaper;