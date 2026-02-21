import { FolderOpen, RotateCcw } from 'lucide-react';
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
import type { VADSettings } from '@/hooks/use-vad-settings';

interface ExportSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ExportSettings;
  onFolderChange: (folder: string) => void;
  onFilenameTemplateChange: (template: string) => void;
  onBodyTemplateChange: (template: string) => void;
  onAutoSaveChange: (enabled: boolean) => void;
  vadSettings: VADSettings;
  onSilenceThresholdChange: (v: number) => void;
  onSilenceDurationMsChange: (v: number) => void;
  onMaxSegmentMsChange: (v: number) => void;
  onMinSegmentMsChange: (v: number) => void;
  onResetVADDefaults: () => void;
}

export function ExportSettingsDialog({
  open,
  onOpenChange,
  settings,
  onFolderChange,
  onFilenameTemplateChange,
  onBodyTemplateChange,
  onAutoSaveChange,
  vadSettings,
  onSilenceThresholdChange,
  onSilenceDurationMsChange,
  onMaxSegmentMsChange,
  onMinSegmentMsChange,
  onResetVADDefaults,
}: ExportSettingsDialogProps) {
  const handleBrowse = async () => {
    const folder = await window.electronAPI.selectExportFolder();
    if (folder) {
      onFolderChange(folder);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Voice Detection</h3>
              <Button variant="ghost" size="sm" onClick={onResetVADDefaults} className="h-7 text-xs gap-1">
                <RotateCcw className="size-3" />
                Reset defaults
              </Button>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <Label htmlFor="vad-threshold" className="text-xs">Silence threshold</Label>
                <span className="text-xs text-muted-foreground">{vadSettings.silenceThreshold.toFixed(3)}</span>
              </div>
              <input
                id="vad-threshold"
                type="range"
                min="0.001" max="0.1" step="0.001"
                value={vadSettings.silenceThreshold}
                onChange={(e) => onSilenceThresholdChange(parseFloat(e.target.value))}
                className="w-full h-1.5 accent-primary"
              />
              <p className="text-xs text-muted-foreground">Lower = more sensitive to quiet speech</p>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <Label htmlFor="vad-silence-duration" className="text-xs">Silence gap before cut</Label>
                <span className="text-xs text-muted-foreground">{vadSettings.silenceDurationMs} ms</span>
              </div>
              <input
                id="vad-silence-duration"
                type="range"
                min="200" max="3000" step="50"
                value={vadSettings.silenceDurationMs}
                onChange={(e) => onSilenceDurationMsChange(parseInt(e.target.value))}
                className="w-full h-1.5 accent-primary"
              />
              <p className="text-xs text-muted-foreground">Pause length that ends a segment</p>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <Label htmlFor="vad-max-segment" className="text-xs">Max segment length</Label>
                <span className="text-xs text-muted-foreground">{vadSettings.maxSegmentMs / 1000} s</span>
              </div>
              <input
                id="vad-max-segment"
                type="range"
                min="5000" max="60000" step="1000"
                value={vadSettings.maxSegmentMs}
                onChange={(e) => onMaxSegmentMsChange(parseInt(e.target.value))}
                className="w-full h-1.5 accent-primary"
              />
              <p className="text-xs text-muted-foreground">Force-splits very long utterances</p>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <Label htmlFor="vad-min-segment" className="text-xs">Min segment length</Label>
                <span className="text-xs text-muted-foreground">{vadSettings.minSegmentMs} ms</span>
              </div>
              <input
                id="vad-min-segment"
                type="range"
                min="100" max="2000" step="50"
                value={vadSettings.minSegmentMs}
                onChange={(e) => onMinSegmentMsChange(parseInt(e.target.value))}
                className="w-full h-1.5 accent-primary"
              />
              <p className="text-xs text-muted-foreground">Discard segments shorter than this</p>
            </div>
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
