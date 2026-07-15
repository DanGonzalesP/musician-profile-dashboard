let currentId: string | null = null;
let currentStop: (() => void) | null = null;

export function claimNowPlaying(id: string, onForceStop: () => void): void {
  if (currentId !== null && currentId !== id && currentStop !== null) {
    currentStop();
  }
  currentId = id;
  currentStop = onForceStop;
}

export function releaseNowPlaying(id: string): void {
  if (currentId === id) {
    currentId = null;
    currentStop = null;
  }
}