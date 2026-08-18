import type { RenderParameters } from './rouletteRenderer';
import type { Rect } from './types/rect.type';
import type { MouseEventArgs, UIObject } from './UIObject';

export class FastForwader implements UIObject {
  private bound: Rect = {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
  private isEnabled: boolean = false;

  public get speed(): number {
    return this.isEnabled ? 2 : 1;
  }

  update(_deltaTime: number): void {}

  render(ctx: CanvasRenderingContext2D, _params: RenderParameters, width: number, height: number): void {
    this.bound.w = width / 2;
    this.bound.h = height / 2;
    this.bound.x = this.bound.w / 2;
    this.bound.y = this.bound.h / 2;

    const centerX = this.bound.x + this.bound.w / 2;
    const centerY = this.bound.y + this.bound.h / 2;

    if (this.isEnabled) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 6;
      for (const offset of [-58, 26]) {
        ctx.beginPath();
        ctx.moveTo(centerX + offset - 34, centerY - 70);
        ctx.lineTo(centerX + offset + 42, centerY);
        ctx.lineTo(centerX + offset - 34, centerY + 70);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  getBoundingBox(): Rect | null {
    return this.bound;
  }

  onMouseDown?(_e?: MouseEventArgs): void {
    this.isEnabled = true;
  }

  onMouseUp?(_e?: MouseEventArgs): void {
    this.isEnabled = false;
  }
}
