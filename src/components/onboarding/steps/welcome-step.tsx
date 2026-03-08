import { motion } from 'motion/react';
import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepWrapper } from '../step-wrapper';

interface WelcomeStepProps {
  direction: number;
  onNext: () => void;
}

export function WelcomeStep({ direction, onNext }: WelcomeStepProps) {
  return (
    <StepWrapper direction={direction}>
      <div className="flex flex-col items-center text-center space-y-8">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5, ease: 'easeOut' }}
          className="flex items-center justify-center size-20 rounded-2xl bg-primary/10"
        >
          <Mic className="size-10 text-primary" />
        </motion.div>

        <div className="space-y-3">
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.4 }}
            className="text-4xl font-bold tracking-tight"
          >
            Transcripto
          </motion.h1>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="text-lg text-muted-foreground"
          >
            Real-time transcription, fully local.
            <br />
            Your audio never leaves your Mac.
          </motion.p>
        </div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <Button size="lg" onClick={onNext} className="px-8">
            Get Started
          </Button>
        </motion.div>
      </div>
    </StepWrapper>
  );
}
