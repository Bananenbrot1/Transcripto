import { useState } from 'react';
import { FolderOpen, RotateCcw, Trash2, Monitor, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { LANGUAGES } from '@/lib/languages';
import type { ExportSettings } from '@/hooks/use-export-settings';
import type { VADSettings } from '@/hooks/use-vad-settings';
import type { ModelDefinition } from '@/types/transcription';

type AppearanceMode = 'system' | 'light' | 'dark';

const TABS = ['General', 'Export', 'Advanced'] as const;
type Tab = typeof TABS[number];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Appearance
  darkMode: boolean | null;
  onDarkModeChange: (value: boolean | null) => void;
  // Model & Language
  currentModel: ModelDefinition | undefined;
  selectedLanguage: string;
  onSelectLanguage: (lang: string) => void;
  onChangeModel: () => void;
  isCapturing: boolean;
  models?: ModelDefinition[];
  downloadedModels?: Record<string, boolean>;
  onDeleteModel?: (modelId: string) => void;
  // Export
  settings: ExportSettings;
  onFolderChange: (folder: string) => void;
  onFilenameTemplateChange: (template: string) => void;
  onBodyTemplateChange: (template: string) => void;
  onAutoSaveChange: (enabled: boolean) => void;
  // VAD
  vadSettings: VADSettings;
  onSilenceThresholdChange: (v: number) => void;
  onSilenceDurationMsChange: (v: number) => void;
  onMaxSegmentMsChange: (v: number) => void;
  onMinSegmentMsChange: (v: number) => void;
  onResetVADDefaults: () => void;
  // Debug
  showDebug: boolean;
  onShowDebugChange: (v: boolean) => void;
}

function toAppearanceMode(darkMode: boolean | null): AppearanceMode {
  if (darkMode === null) return 'system';
  return darkMode ? 'dark' : 'light';
}

function fromAppearanceMode(mode: AppearanceMode): boolean | null {
  if (mode === 'system') return null;
  return mode === 'dark';
}

const appearanceOptions: { value: AppearanceMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function SettingsDialog({
  open,
  onOpenChange,
  darkMode,
  onDarkModeChange,
  currentModel,
  selectedLanguage,
  onSelectLanguage,
  onChangeModel,
  isCapturing,
  models,
  downloadedModels,
  onDeleteModel,
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
  showDebug,
  onShowDebugChange,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>('General');

  const handleBrowse = async () => {
    const folder = await window.electronAPI.selectExportFolder();
    if (folder) onFolderChange(folder);
  };

  const modelDisplayName = currentModel
    ? currentModel.label.split(' — ')[0].split(' (')[0]
    : 'Unknown';

  const currentAppearance = toAppearanceMode(darkMode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden" showCloseButton={false}>
        {/* Tab bar */}
        <div className="flex border-b bg-muted/30 px-4 pt-4 pb-0">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {activeTab === 'General' && (
            <>
              {/* Appearance */}
              <section className="space-y-3">
                <h3 className="text-sm font-medium">Appearance</h3>
                <div className="flex gap-2">
                  {appearanceOptions.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => onDarkModeChange(fromAppearanceMode(value))}
                      className={`flex-1 flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                        currentAppearance === value
                          ? 'border-primary bg-primary/5'
                          : 'border-transparent bg-muted/50 hover:bg-muted'
                      }`}
                    >
                      <Icon className="size-5" />
                      <span className="text-xs font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Model & Language */}
              <section className="space-y-3">
                <h3 className="text-sm font-medium">Model & Language</h3>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs text-muted-foreground">Current model</Label>
                    <p className="text-sm font-medium">{modelDisplayName}</p>
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

                <div className="space-y-1.5">
                  <Label htmlFor="settings-language" className="text-xs text-muted-foreground">Language</Label>
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
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Downloaded models</Label>
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
              </section>
            </>
          )}

          {activeTab === 'Export' && (
            <>
              <section className="space-y-4">
                <div className="space-y-1.5">
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

                <div className="space-y-1.5">
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

                <div className="space-y-1.5">
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
              </section>
            </>
          )}

          {activeTab === 'Advanced' && (
            <>
              <section className="space-y-3">
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
              </section>

              <section className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="show-debug">Show debug panel</Label>
                    <p className="text-xs text-muted-foreground">Display audio and transcription logs</p>
                  </div>
                  <Switch
                    id="show-debug"
                    checked={showDebug}
                    onCheckedChange={onShowDebugChange}
                  />
                </div>
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
