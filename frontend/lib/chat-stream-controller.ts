export class ChatStreamController {
  private controller: AbortController | null = null;
  private generationId = 0;

  start(): {
    signal: AbortSignal;
    generationId: number;
  } {
    this.invalidate();
    this.controller = new AbortController();

    return {
      signal: this.controller.signal,
      generationId: this.generationId,
    };
  }

  stop(): void {
    this.invalidate();
  }

  private invalidate(): void {
    this.generationId += 1;

    const controller = this.controller;
    this.controller = null;

    if (
      controller &&
      !controller.signal.aborted
    ) {
      controller.abort();
    }
  }

  complete(generationId: number): void {
    if (generationId !== this.generationId) {
      return;
    }

    this.controller = null;
  }

  isCurrent(generationId: number): boolean {
    return generationId === this.generationId;
  }

  get active(): boolean {
    return this.controller !== null;
  }
}
