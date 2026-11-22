import type { ExerciseId } from '@/core/rates';

export type CameraStatus = 'idle' | 'loading' | 'running' | 'error';

export interface PoseCameraProps {
  exercise: ExerciseId;
  /** Called once per counted rep. */
  onRep: () => void;
  /** Start the camera as soon as the screen opens. */
  autoStart?: boolean;
  /** Reports camera state, e.g. to offer tap counting only when the camera can't be used. */
  onStatus?: (status: CameraStatus) => void;
}
