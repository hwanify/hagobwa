import type { ExerciseId } from '@/core/rates';

export interface PoseCameraProps {
  exercise: ExerciseId;
  /** Called once per counted rep. */
  onRep: () => void;
}
