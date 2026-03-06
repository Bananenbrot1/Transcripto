import { FolderOpen, RotateCcw, Trash2 } from 'lucide-react';
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
import { LANGUAGES } from '@/lib/languages';
import type { ExportSettings } from '@/hooks/use-export-settings';
import type { VADSettings } from '@/hooks/use-vad-settings';
import type { ModelDefinition } from '@/types/transcription';

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
  currentModel: ModelDefinition | undefined;
  selectedLanguage: string;
  onSelectLanguage: (lang: string) => void;
  onChangeModel: () => void;
  isCapturing: boolean;
  showDebug: boolean;
  onShowDebugChange: (v: boolean) => void;
  models?: ModelDefinition[];
  downloadedModels?: Record<string, boolean>;
  onDeleteModel?: (modelId: string) => void;
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
  currentModel,
  selectedLanguage,
  onSelectLanguage,
  onChangeModel,
  isCapturing,
  showDebug,
  onShowDebugChange,
  models,
  downloadedModels,
  onDeleteModel,
}: ExportSettingsDialogProps) {
  const handleBrowse = async () => {
    const folder = await window.electronAPI.selectExportFolder();
    if (folder) {
      onFolderChange(folder);
    }
  };

  const modelDisplayName = currentModel
    ? currentModel.label.split(' — ')[0].split(' (')[0]
    : 'Unknown';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Model & Language</h3>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs">Current model</Label>
                <p className="text-sm">{modelDisplayName}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onChangeModel}
                disabled={isCapturing}
              >
                Change model
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-language">Language</Label>
              <select
                id="settings-language"
                value={selectedLanguage}
                onChange={(e) => onSelectLanguage(e.target.value)}
                disabled={isCapturing}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>

            {models && downloadedModels && onDeleteModel && (
              <div className="space-y-2">
                <Label className="text-xs">Downloaded models</Label>
                <div className="space-y-1">
                  {models.filter((m) => downloadedModels[m.id]).map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-sm">
                      <span>{m.label.split(' — ')[0].split(' (')[0]}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => onDeleteModel(m.id)}
                        disabled={isCapturing || m.id === currentModel?.id}
                        title={m.id === currentModel?.id ? 'Cannot delete active model' : 'Delete model'}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))}
                  {models.filter((m) => downloadedModels[m.id]).length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No models downloaded</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="border-t pt-4 space-y-4">
            <h3 className="text-sm font-medium">Export</h3>

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

          <div className="border-t pt-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="show-debug">Show debug panel</Label>
              <Switch
                id="show-debug"
                checked={showDebug}
                onCheckedChange={onShowDebugChange}
              />
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
