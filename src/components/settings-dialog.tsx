import { useState, useEffect, useRef, useCallback } from 'react';
import { FolderOpen, RotateCcw, Trash2, Monitor, Sun, Moon, Settings2, FileOutput, SlidersHorizontal, Keyboard, AlertCircle, X, Sparkles, Check, Loader2, Eye, EyeOff } from 'lucide-react';
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
import type { SummarySettings } from '@/hooks/use-summary-settings';
import type { VADSettings } from '@/hooks/use-vad-settings';
import type { ModelDefinition } from '@/types/transcription';
import type { ShortcutConfig, ShortcutAction } from '../../shared/types';

type AppearanceMode = 'system' | 'light' | 'dark';

const TABS = [
  { id: 'General' as const, label: 'General', icon: Settings2 },
  { id: 'AI Summary' as const, label: 'AI Summary', icon: Sparkles },
  { id: 'Export' as const, label: 'Export', icon: FileOutput },
  { id: 'Shortcuts' as const, label: 'Shortcuts', icon: Keyboard },
  { id: 'Advanced' as const, label: 'Advanced', icon: SlidersHorizontal },
];
type Tab = typeof TABS[number]['id'];

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
  // Summary
  summarySettings: SummarySettings;
  summaryDecryptedKey: string;
  onSummaryApiBaseUrlChange: (url: string) => void;
  onSummaryApiKeyChange: (key: string) => Promise<void>;
  onSummaryModelIdChange: (modelId: string) => void;
  onSummaryPromptTemplateChange: (template: string) => void;
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
  // Shortcuts
  shortcuts: ShortcutConfig;
  shortcutStatus: Record<string, boolean>;
  onShortcutsChange: (shortcuts: ShortcutConfig) => void;
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
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  toggleRecording: 'Start / Stop recording',
  togglePause: 'Pause / Resume',
  toggleMicMute: 'Mute / Unmute mic',
};

function formatAccelerator(accelerator: string): string {
  return accelerator
    .replace('CommandOrControl', '\u2318')
    .replace('Command', '\u2318')
    .replace('Control', '\u2303')
    .replace('Alt', '\u2325')
    .replace('Option', '\u2325')
    .replace('Shift', '\u21E7')
    .replace(/\+/g, ' ');
}

function keyEventToAccelerator(e: KeyboardEvent): string | null {
  const key = e.key;
  // Ignore standalone modifier keys
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return null;

  const parts: string[] = [];
  if (e.metaKey) parts.push('CommandOrControl');
  if (e.ctrlKey && !e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  // Require at least one modifier
  if (parts.length === 0) return null;

  // Normalize key name to Electron accelerator format
  const keyMap: Record<string, string> = {
    ' ': 'Space',
    'ArrowUp': 'Up',
    'ArrowDown': 'Down',
    'ArrowLeft': 'Left',
    'ArrowRight': 'Right',
  };
  const normalizedKey = keyMap[key] || (key.length === 1 ? key.toUpperCase() : key);
  parts.push(normalizedKey);

  return parts.join('+');
}

function ShortcutRecorder({
  value,
  failed,
  onChange,
}: {
  value: string | null;
  failed: boolean;
  onChange: (value: string | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const accelerator = keyEventToAccelerator(e);
    if (accelerator) {
      onChange(accelerator);
      setRecording(false);
    }
  }, [onChange]);

  useEffect(() => {
    if (!recording) return;
    const el = inputRef.current;
    if (el) el.focus();
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recording, handleKeyDown]);

  // Stop recording on blur
  useEffect(() => {
    if (!recording) return;
    const handleBlur = () => setRecording(false);
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [recording]);

  if (recording) {
    return (
      <div
        ref={inputRef}
        tabIndex={0}
        onBlur={() => setRecording(false)}
        className="h-7 px-2.5 rounded-md border-2 border-primary bg-primary/5 text-xs font-medium flex items-center gap-1 text-primary animate-pulse cursor-pointer"
      >
        Press shortcut...
      </div>
    );
  }

  if (value) {
    return (
      <div className="flex items-center gap-1">
        {failed && (
          <span title="Could not register - may be in use by another app">
            <AlertCircle className="size-3.5 text-destructive" />
          </span>
        )}
        <button
          onClick={() => setRecording(true)}
          className={`h-7 px-2.5 rounded-md border text-xs font-mono font-medium flex items-center gap-1 transition-colors hover:bg-muted ${
            failed ? 'border-destructive/50 text-destructive' : 'border-input text-foreground'
          }`}
        >
          {formatAccelerator(value)}
        </button>
        <button
          onClick={() => onChange(null)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Remove shortcut"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setRecording(true)}
      className="h-7 px-2.5 rounded-md border border-dashed border-input text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
    >
      Set shortcut
    </button>
  );
}

function SummarySettingsTab({
  settings,
  decryptedKey,
  onApiBaseUrlChange,
  onApiKeyChange,
  onModelIdChange,
  onPromptTemplateChange,
}: {
  settings: SummarySettings;
  decryptedKey: string;
  onApiBaseUrlChange: (url: string) => void;
  onApiKeyChange: (key: string) => Promise<void>;
  onModelIdChange: (modelId: string) => void;
  onPromptTemplateChange: (template: string) => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyInitialized, setKeyInitialized] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  // Initialize key input from decrypted value
  useEffect(() => {
    if (!keyInitialized && decryptedKey !== undefined) {
      setKeyInput(decryptedKey);
      setKeyInitialized(true);
    }
  }, [decryptedKey, keyInitialized]);

  const handleKeyBlur = () => {
    if (keyInput !== decryptedKey) {
      onApiKeyChange(keyInput);
    }
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      const result = await window.electronAPI.testSummaryConnection();
      if (result.success) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setTestError(result.error || 'Unknown error');
      }
    } catch (err) {
      setTestStatus('error');
      setTestError((err as Error).message);
    }
  };

  return (
    <>
      <section className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="summary-base-url">API Base URL</Label>
          <Input
            id="summary-base-url"
            value={settings.apiBaseUrl}
            onChange={(e) => onApiBaseUrlChange(e.target.value)}
            placeholder="https://openrouter.ai/api/v1"
          />
          <p className="text-xs text-muted-foreground">
            OpenAI-compatible endpoint (OpenRouter, LiteLLM, etc.)
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="summary-api-key">API Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="summary-api-key"
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onBlur={handleKeyBlur}
                placeholder="sk-..."
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Stored encrypted on your machine
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="summary-model">Model</Label>
          <Input
            id="summary-model"
            value={settings.modelId}
            onChange={(e) => onModelIdChange(e.target.value)}
            placeholder="anthropic/claude-sonnet-4-20250514"
          />
          <p className="text-xs text-muted-foreground">
            Model ID from your provider (e.g. OpenRouter model slug)
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="summary-prompt">Prompt Template</Label>
          <Textarea
            id="summary-prompt"
            value={settings.promptTemplate}
            onChange={(e) => onPromptTemplateChange(e.target.value)}
            rows={6}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Available: {'{{transcript}}'}, {'{{title}}'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={testStatus === 'testing' || !keyInput}
          >
            {testStatus === 'testing' && <Loader2 className="size-3.5 animate-spin" />}
            {testStatus === 'success' && <Check className="size-3.5 text-green-600" />}
            {testStatus === 'error' && <AlertCircle className="size-3.5 text-destructive" />}
            {testStatus === 'idle' && <Sparkles className="size-3.5" />}
            Test Connection
          </Button>
          {testStatus === 'success' && (
            <span className="text-xs text-green-600 font-medium">Connected successfully</span>
          )}
          {testStatus === 'error' && (
            <span className="text-xs text-destructive font-medium truncate max-w-[250px]" title={testError}>
              {testError}
            </span>
          )}
        </div>
      </section>
    </>
  );
}

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
  summarySettings,
  summaryDecryptedKey,
  onSummaryApiBaseUrlChange,
  onSummaryApiKeyChange,
  onSummaryModelIdChange,
  onSummaryPromptTemplateChange,
  vadSettings,
  onSilenceThresholdChange,
  onSilenceDurationMsChange,
  onMaxSegmentMsChange,
  onMinSegmentMsChange,
  onResetVADDefaults,
  showDebug,
  onShowDebugChange,
  shortcuts,
  shortcutStatus,
  onShortcutsChange,
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

  const handleShortcutChange = (action: ShortcutAction, value: string | null) => {
    onShortcutsChange({ ...shortcuts, [action]: value });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden" showCloseButton={false}>
        {/* Tab bar */}
        <div className="flex border-b bg-muted/30 px-4 pt-4 pb-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              title={label}
              className={`flex-1 flex items-center justify-center py-2 border-b-2 transition-colors -mb-px ${
                activeTab === id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="size-5" />
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
                <div className="flex rounded-md border bg-muted/50 p-0.5">
                  {appearanceOptions.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => onDarkModeChange(fromAppearanceMode(value))}
                      className={`flex-1 flex items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                        currentAppearance === value
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="size-3.5" />
                      {label}
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

          {activeTab === 'AI Summary' && (
            <SummarySettingsTab
              settings={summarySettings}
              decryptedKey={summaryDecryptedKey}
              onApiBaseUrlChange={onSummaryApiBaseUrlChange}
              onApiKeyChange={onSummaryApiKeyChange}
              onModelIdChange={onSummaryModelIdChange}
              onPromptTemplateChange={onSummaryPromptTemplateChange}
            />
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
                    Available: {'{{title}}'}, {'{{date}}'}, {'{{time}}'}, {'{{duration}}'}, {'{{segments}}'}, {'{{summary}}'}
                  </p>
                </div>

              </section>
            </>
          )}

          {activeTab === 'Shortcuts' && (
            <section className="space-y-3">
              <p className="text-xs text-muted-foreground">Global shortcuts work even when the app is in the background.</p>
              <div className="space-y-2">
                {(Object.keys(SHORTCUT_LABELS) as ShortcutAction[]).map((action) => (
                  <div key={action} className="flex items-center justify-between">
                    <span className="text-sm">{SHORTCUT_LABELS[action]}</span>
                    <ShortcutRecorder
                      value={shortcuts[action]}
                      failed={shortcuts[action] !== null && shortcutStatus[action] === false}
                      onChange={(value) => handleShortcutChange(action, value)}
                    />
                  </div>
                ))}
              </div>
            </section>
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
