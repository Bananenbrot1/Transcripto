import { FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ExportSettings } from '@/hooks/use-export-settings';

interface ExportSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ExportSettings;
  onFolderChange: (folder: string) => void;
  onFilenameTemplateChange: (template: string) => void;
  onBodyTemplateChange: (template: string) => void;
  onAutoSaveChange: (enabled: boolean) => void;
}

export function ExportSettingsDialog({
  open,
  onOpenChange,
  settings,
  onFolderChange,
  onFilenameTemplateChange,
  onBodyTemplateChange,
  onAutoSaveChange,
}: ExportSettingsDialogProps) {
  const handleBrowse = async () => {
    const folder = await window.electronAPI.selectExportFolder();
    if (folder) {
      onFolderChange(folder);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="export-folder">Output Folder</Label>
            <div className="flex gap-2">
              <Input
                id="export-folder"
                value={settings.folder}
                placeholder="Select a folder..."
                readOnly
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={handleBrowse}>
                <FolderOpen className="size-4" />
                Browse
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="filename-template">Filename Template</Label>
            <Input
              id="filename-template"
              value={settings.filenameTemplate}
              onChange={(e) => onFilenameTemplateChange(e.target.value)}
              placeholder="{{date}} {{title}}"
            />
            <p className="text-xs text-muted-foreground">
              Available: {'{{date}}'}, {'{{time}}'}, {'{{title}}'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="body-template">Body Template</Label>
            <Textarea
              id="body-template"
              value={settings.bodyTemplate}
              onChange={(e) => onBodyTemplateChange(e.target.value)}
              rows={8}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Available: {'{{title}}'}, {'{{date}}'}, {'{{time}}'}, {'{{duration}}'}, {'{{segments}}'}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-save">Auto-save on stop</Label>
              <p className="text-xs text-muted-foreground">
                Automatically save when recording stops
              </p>
            </div>
            <Switch
              id="auto-save"
              checked={settings.autoSave}
              onCheckedChange={onAutoSaveChange}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
