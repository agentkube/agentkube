import React, { useState, useEffect } from 'react';
import { Palette, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCustomTheme } from '@/components/theme-provider';
import { AVAILABLE_THEMES, ThemePattern } from '@/types/theme';
import { getSettings, updateSettingsSection } from '@/api/settings';
import { useToast } from '@/hooks/use-toast';

const THEME_SET_KEY = 'theme_set';

interface ThemePickerDialogProps {
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
}

const ThemePickerDialog: React.FC<ThemePickerDialogProps> = ({
  externalOpen,
  onExternalOpenChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { themePattern, setThemePattern } = useCustomTheme();
  const [selectedTheme, setSelectedTheme] = useState<ThemePattern>(themePattern);
  const { toast } = useToast();

  useEffect(() => {
    // Check if theme has been set before
    const themeSet = localStorage.getItem(THEME_SET_KEY);

    if (!themeSet || themeSet !== 'true') {
      // Open dialog after 3 seconds if theme not set
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, []);

  // Sync with external control
  useEffect(() => {
    if (externalOpen !== undefined) {
      setIsOpen(externalOpen);
    }
  }, [externalOpen]);

  const handleThemeSelect = (themeId: ThemePattern) => {
    setSelectedTheme(themeId);
    // Apply theme immediately for live preview
    setThemePattern(themeId);
  };

  const handleSave = async () => {
    try {
      // Save to settings
      const currentSettings = await getSettings();
      await updateSettingsSection('appearance', {
        ...currentSettings.appearance,
        colorMode: selectedTheme
      });

      // Mark theme as set in localStorage
      localStorage.setItem(THEME_SET_KEY, 'true');

      toast({
        title: "Theme Applied",
        description: `Your theme has been set to ${AVAILABLE_THEMES.find(t => t.id === selectedTheme)?.name}.`,
        variant: "success"
      });

      handleClose();
    } catch (error) {
      console.error('Failed to save theme:', error);
      toast({
        title: "Error",
        description: "Failed to save theme. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleSkip = () => {
    // Mark as set even if skipped
    localStorage.setItem(THEME_SET_KEY, 'true');
    handleClose();
  };

  const handleClose = () => {
    setIsOpen(false);
    onExternalOpenChange?.(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[800px] bg-card/80 backdrop-blur-md text-foreground border-accent/40">
        <DialogHeader>
          <DialogTitle className="text-2xl font-[Anton] uppercase flex items-center gap-2">
            <Palette className="h-6 w-6" />
            Choose Your Theme
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Select a color theme to personalize your Agentkube experience. You can always change this later in Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto pr-2
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-accent/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-accent/50">
            {AVAILABLE_THEMES.map((theme) => (
              <button
                key={theme.id}
                className={`flex flex-col items-start p-2 rounded-lg border transition-all ${selectedTheme === theme.id
                  ? 'border-accent bg-accent/20'
                  : 'border-accent/40 hover:bg-accent/10'
                  }`}
                onClick={() => handleThemeSelect(theme.id as ThemePattern)}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div
                    className="w-5 h-5 rounded-full border-2 border-accent/40"
                    style={{ background: theme.previewColor }}
                  />
                  {selectedTheme === theme.id && (
                    <div className="bg-accent rounded-full p-1">
                      <Check size={12} className="text-accent-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-start w-full">
                  <span className="text-sm font-medium">{theme.name}</span>
                  <span className="text-xs text-muted-foreground truncate line-clamp-2">
                    {theme.description}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleSkip}
            className="border-accent/40"
          >
            Skip for Now
          </Button>
          <Button
            onClick={handleSave}
          >
            Apply Theme
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ThemePickerDialog;
