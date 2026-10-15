type StoppableStream = { getTracks(): { stop(): void }[] };

export class MicrophoneAccess<Stream extends StoppableStream> {
  private generation = 0;
  private active: Stream | null = null;

  async acquire(request: () => Promise<Stream>): Promise<Stream | null> {
    this.release();
    const generation = this.generation;
    let stream: Stream;
    try {
      stream = await request();
    } catch (error) {
      if (generation !== this.generation) return null;
      throw error;
    }
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return null;
    }
    this.active = stream;
    return stream;
  }

  release(): void {
    this.generation += 1;
    this.active?.getTracks().forEach((track) => track.stop());
    this.active = null;
  }
}
