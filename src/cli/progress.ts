import cliProgress from 'cli-progress';

export interface ProgressBarOptions {
  total: number;
  label: string;
}

export class ProgressBar {
  private bar: cliProgress.SingleBar;
  private total: number;
  private label: string;
  private currentValue: number = 0;

  constructor(options: ProgressBarOptions) {
    this.total = options.total;
    this.label = options.label;

    this.bar = new cliProgress.SingleBar({
      format: `${this.label} |{bar}| {value}/{total} | {message}`,
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: false,
    }, cliProgress.Presets.shades_classic);
  }

  start(): void {
    this.currentValue = 0;
    this.bar.start(this.total, 0, { message: '' });
  }

  increment(message?: string): void {
    this.currentValue++;
    this.bar.update(this.currentValue, { message: message || '' });
  }

  update(value: number, message?: string): void {
    this.currentValue = value;
    this.bar.update(value, { message: message || '' });
  }

  stop(): void {
    this.bar.stop();
  }
}

export function createWriterProgress(modelCount: number): ProgressBar {
  return new ProgressBar({
    total: modelCount,
    label: 'Generating posts',
  });
}

export function createJudgeProgress(totalJudgments: number): ProgressBar {
  return new ProgressBar({
    total: totalJudgments,
    label: 'Judging posts',
  });
}

export function createFlywheelProgress(maxIterations: number): ProgressBar {
  return new ProgressBar({
    total: maxIterations,
    label: 'Refining post',
  });
}
