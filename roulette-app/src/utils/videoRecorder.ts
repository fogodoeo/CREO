import { pad } from './utils';

export class VideoRecorder {
  private mediaRecorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private extension = 'webm';

  constructor(targetCanvas: HTMLCanvasElement) {
    if (!('MediaRecorder' in window) || typeof targetCanvas.captureStream !== 'function') return;

    const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    try {
      const videoStream = targetCanvas.captureStream(60);
      this.mediaRecorder = new MediaRecorder(videoStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 6000000,
      });
      this.extension = this.mediaRecorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
    } catch (error) {
      console.warn('[marble-draw] 이 브라우저에서는 자동 녹화를 사용할 수 없습니다.', error);
    }
  }

  public get isSupported() {
    return !!this.mediaRecorder;
  }

  public get isRecording() {
    return this.mediaRecorder?.state === 'recording';
  }

  public async start() {
    const recorder = this.mediaRecorder;
    if (!recorder || this.isRecording) return;
    return new Promise<void>((resolve, reject) => {
      this.chunks = [];
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size) this.chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error('녹화를 시작하지 못했습니다.'));
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: recorder.mimeType });
        const videoUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        const date = new Date();
        downloadLink.href = videoUrl;
        downloadLink.download = `marble_draw_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.${this.extension}`;
        downloadLink.click();
        downloadLink.remove();
        window.setTimeout(() => URL.revokeObjectURL(videoUrl), 1000);
      };
      recorder.onstart = () => resolve();
      recorder.start();
    });
  }

  public stop() {
    if (this.mediaRecorder?.state === 'recording') this.mediaRecorder.stop();
  }
}
