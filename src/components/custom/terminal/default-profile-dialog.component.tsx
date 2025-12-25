import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Terminal, Check } from 'lucide-react';

interface TerminalProfile {
  id: string;
  name: string;
  shell_path: string;
  icon: string | null;
  is_default: boolean;
}

interface DefaultProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: TerminalProfile[];
  currentDefaultId: string | null;
  onSave: (profileId: string) => void;
}

const DefaultProfileDialog: React.FC<DefaultProfileDialogProps> = ({
  isOpen,
  onClose,
  profiles,
  currentDefaultId,
  onSave,
}) => {
  const [selectedId, setSelectedId] = useState<string>(currentDefaultId || profiles.find(p => p.is_default)?.id || '');

  const handleSave = () => {
    onSave(selectedId);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px] bg-popover/80 backdrop-blur-xl border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Select Default Profile
          </DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-2">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${selectedId === profile.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-accent/50'
                }`}
              onClick={() => setSelectedId(profile.id)}
            >
              <div className="flex flex-col">
                <span className="font-medium text-sm">{profile.name}</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {profile.shell_path}
                </span>
              </div>
              {selectedId === profile.id && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Default</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DefaultProfileDialog;
