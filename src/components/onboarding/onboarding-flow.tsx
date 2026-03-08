import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { WelcomeStep } from './steps/welcome-step';
import { ModelStep } from './steps/model-step';
import { LanguageStep } from './steps/language-step';
import { PermissionsStep } from './steps/permissions-step';
import type { ModelStatus, ModelDefinition } from '@/types/transcription';

export type OnboardingStep = 'welcome' | 'model' | 'language' | 'permissions';

const STEPS: OnboardingStep[] = ['welcome', 'model', 'language', 'permissions'];

interface OnboardingFlowProps {
  status: ModelStatus;
  models: ModelDefinition[];
  selectedModel: string;
  selectedLanguage: string;
  downloadedModels: Record<string, boolean>;
  onSelectModel: (id: string) => void;
  onSelectLanguage: (lang: string) => void;
  onDownload: () => void;
  onComplete: () => void;
}

export function OnboardingFlow({
  status,
  models,
  selectedModel,
  selectedLanguage,
  downloadedModels,
  onSelectModel,
  onSelectLanguage,
  onDownload,
  onComplete,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = back

  const currentIndex = STEPS.indexOf(step);

  const goNext = () => {
    if (currentIndex < STEPS.length - 1) {
      setDirection(1);
      setStep(STEPS[currentIndex + 1]);
    }
  };

  const goBack = () => {
    if (currentIndex > 0) {
      setDirection(-1);
      setStep(STEPS[currentIndex - 1]);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <div className="w-full max-w-lg px-6">
        <AnimatePresence mode="wait" custom={direction}>
          {step === 'welcome' && (
            <WelcomeStep key="welcome" direction={direction} onNext={goNext} />
          )}
          {step === 'model' && (
            <ModelStep
              key="model"
              direction={direction}
              status={status}
              models={models}
              selectedModel={selectedModel}
              downloadedModels={downloadedModels}
              onSelectModel={onSelectModel}
              onDownload={onDownload}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {step === 'language' && (
            <LanguageStep
              key="language"
              direction={direction}
              selectedLanguage={selectedLanguage}
              onSelectLanguage={onSelectLanguage}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {step === 'permissions' && (
            <PermissionsStep
              key="permissions"
              direction={direction}
              onComplete={onComplete}
              onBack={goBack}
            />
          )}
        </AnimatePresence>

        {/* Progress dots */}
        <div className="mt-12 flex justify-center gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentIndex
                  ? 'w-6 bg-primary'
                  : i < currentIndex
                    ? 'w-1.5 bg-primary/40'
                    : 'w-1.5 bg-muted-foreground/20'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
