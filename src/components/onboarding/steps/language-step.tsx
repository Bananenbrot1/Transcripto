import { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ArrowRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LANGUAGES, PARAKEET_LANGUAGES } from '@/lib/languages';
import { StepWrapper } from '../step-wrapper';

interface LanguageStepProps {
  direction: number;
  selectedLanguage: string;
  isParakeet?: boolean;
  onSelectLanguage: (lang: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function LanguageStep({
  direction,
  selectedLanguage,
  isParakeet,
  onSelectLanguage,
  onNext,
  onBack,
}: LanguageStepProps) {
  const [search, setSearch] = useState('');

  const baseLanguages = isParakeet
    ? LANGUAGES.filter((l) => l.code === 'auto' || PARAKEET_LANGUAGES.has(l.code))
    : LANGUAGES;

  const filtered = search
    ? baseLanguages.filter((l) =>
        l.label.toLowerCase().includes(search.toLowerCase()),
      )
    : baseLanguages;

  return (
    <StepWrapper direction={direction}>
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Pick a language</h2>
          <p className="text-muted-foreground">
            Choose the language you'll mostly be transcribing. Auto-detect works well for most cases.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search languages..."
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
          {filtered.map((lang, i) => {
            const isSelected = lang.code === selectedLanguage;
            return (
              <motion.button
                key={lang.code}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.02, duration: 0.2 }}
                onClick={() => onSelectLanguage(lang.code)}
                className={`rounded-lg border px-3 py-2.5 text-sm text-left transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/5 font-medium'
                    : 'border-border hover:border-primary/30 hover:bg-muted/50'
                }`}
              >
                {lang.label}
              </motion.button>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="size-4" />
            Back
          </Button>
          <Button onClick={onNext}>
            Continue
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </StepWrapper>
  );
}
