import { Skills, STUCK_DELAY, Themes } from './data/constants';
import type { IPhysics } from './IPhysics';
import options from './options';
import type { ColorTheme } from './types/ColorTheme';
import type { VectorLike } from './types/VectorLike';
import { transformGuard } from './utils/transformGuard';
import { random } from './utils/random';
import { rad } from './utils/utils';
import { Vector } from './utils/Vector';

const glassSpriteCache = new Map<string, HTMLCanvasElement>();

export class Marble {
  type = 'marble' as const;
  name: string = '';
  size: number = 0.5;
  color: string = 'red';
  hue: number = 0;
  impact: number = 0;
  weight: number = 1;
  skill: Skills = Skills.None;
  isActive: boolean = false;

  private _skillRate = 0.0005;
  private _coolTime = 5000;
  private _maxCoolTime = 5000;
  private _stuckTime = 0;
  private lastPosition: VectorLike = { x: 0, y: 0 };
  private theme: ColorTheme = Themes.dark;

  private physics: IPhysics;

  id: number;

  get position() {
    return this.physics.getMarblePosition(this.id) || { x: 0, y: 0, angle: 0 };
  }

  get x() {
    return this.position.x;
  }

  set x(v: number) {
    this.position.x = v;
  }

  get y() {
    return this.position.y;
  }

  set y(v: number) {
    this.position.y = v;
  }

  get angle() {
    return this.position.angle;
  }

  constructor(physics: IPhysics, order: number, max: number, name?: string, weight: number = 1) {
    this.name = name || `M${order}`;
    this.weight = weight;
    this.physics = physics;

    this._maxCoolTime = 1000 + (1 - this.weight) * 4000;
    this._coolTime = this._maxCoolTime * random();
    this._skillRate = 0.2 * this.weight;

    const maxLine = Math.ceil(max / 10);
    const line = Math.floor(order / 10);
    const lineDelta = -Math.max(0, Math.ceil(maxLine - 5));
    this.hue = (360 / max) * order;
    this.color = `hsl(${this.hue} 100% 70%)`;
    this.id = order;

    physics.createMarble(order, 10.25 + (order % 10) * 0.6, maxLine - line + lineDelta);
  }

  update(deltaTime: number) {
    if (this.isActive && Vector.lenSq(Vector.sub(this.lastPosition, this.position)) < 0.00001) {
      this._stuckTime += deltaTime;

      if (this._stuckTime > STUCK_DELAY) {
        this.physics.shakeMarble(this.id);
        this._stuckTime = 0;
      }
    } else {
      this._stuckTime = 0;
    }
    this.lastPosition = { x: this.position.x, y: this.position.y };

    this.skill = Skills.None;
    if (this.impact) {
      this.impact = Math.max(0, this.impact - deltaTime);
    }
    if (!this.isActive) return;
    if (options.useSkills) {
      this._updateSkillInformation(deltaTime);
    }
  }

  private _updateSkillInformation(deltaTime: number) {
    if (this._coolTime > 0) {
      this._coolTime -= deltaTime;
    }

    if (this._coolTime <= 0) {
      this.skill = random() < this._skillRate ? Skills.Impact : Skills.None;
      this._coolTime = this._maxCoolTime;
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    zoom: number,
    outline: boolean,
    isMinimap: boolean = false,
    skin: CanvasImageSource | undefined,
    viewPort: { x: number; y: number; w: number; h: number; zoom: number },
    theme: ColorTheme,
    simpleLabel: boolean = false,
    showLabel: boolean = true
  ) {
    this.theme = theme;
    const viewPortHw = viewPort.w / viewPort.zoom / 2;
    const viewPortHh = viewPort.h / viewPort.zoom / 2;
    const viewPortLeft = viewPort.x - viewPortHw;
    const viewPortRight = viewPort.x + viewPortHw;
    const viewPortTop = viewPort.y - viewPortHh - this.size / 2;
    const viewPortBottom = viewPort.y + viewPortHh;
    if (
      !isMinimap &&
      (this.x < viewPortLeft || this.x > viewPortRight || this.y < viewPortTop || this.y > viewPortBottom)
    ) {
      return;
    }
    const transform = ctx.getTransform();
    if (isMinimap) {
      this._renderMinimap(ctx);
    } else {
      this._renderNormal(ctx, zoom, outline, skin, simpleLabel, showLabel);
    }
    ctx.setTransform(transform);
  }

  private _renderMinimap(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    this._drawMarbleBody(ctx, true);
  }

  private _drawMarbleBody(ctx: CanvasRenderingContext2D, isMinimap: boolean) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, isMinimap ? this.size : this.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  private _renderNormal(
    ctx: CanvasRenderingContext2D,
    zoom: number,
    outline: boolean,
    skin?: CanvasImageSource,
    simpleLabel: boolean = false,
    showLabel: boolean = true
  ) {
    const hs = this.size / 2;

    ctx.fillStyle = `hsl(${this.hue} 100% ${this.theme.marbleLightness + 25 * Math.min(1, this.impact / 500)}%)`;

    // ctx.shadowColor = this.color;
    // ctx.shadowBlur = zoom / 2;
    if (skin) {
      transformGuard(ctx, () => {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.drawImage(skin, -hs, -hs, hs * 2, hs * 2);
      });
    } else if (options.marbleStyle === 'glass') {
      this._drawGlassBody(ctx, this.x, this.y, this.size);
    } else {
      this._drawMarbleBody(ctx, false);
    }

    ctx.shadowColor = '';
    ctx.shadowBlur = 0;
    if (showLabel) this._drawName(ctx, zoom, simpleLabel);

    if (outline) {
      this._drawOutline(ctx, 2 / zoom);
    }

    if (options.useSkills) {
      this._renderCoolTime(ctx, zoom);
    }
  }

  renderLabel(
    ctx: CanvasRenderingContext2D,
    zoom: number,
    viewPort: { x: number; y: number; w: number; h: number; zoom: number },
    simpleLabel: boolean = false
  ) {
    const viewPortHw = viewPort.w / viewPort.zoom / 2;
    const viewPortHh = viewPort.h / viewPort.zoom / 2;
    if (
      this.x < viewPort.x - viewPortHw ||
      this.x > viewPort.x + viewPortHw ||
      this.y < viewPort.y - viewPortHh - this.size / 2 ||
      this.y > viewPort.y + viewPortHh
    ) {
      return;
    }
    this._drawName(ctx, zoom, simpleLabel);
  }

  renderResultBody(ctx: CanvasRenderingContext2D, x: number, y: number, diameter: number) {
    if (options.marbleStyle === 'glass') {
      this._drawGlassBody(ctx, x, y, diameter);
      return;
    }
    ctx.beginPath();
    ctx.arc(x, y, diameter / 2, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${this.hue} 100% ${this.theme.marbleLightness}%)`;
    ctx.fill();
  }

  private _drawGlassBody(ctx: CanvasRenderingContext2D, x: number, y: number, diameter: number) {
    const sprite = this._getGlassSprite();
    const spriteSize = diameter * 1.38;
    ctx.drawImage(sprite, x - spriteSize / 2, y - spriteSize / 2, spriteSize, spriteSize);
    if (this.impact > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.7, this.impact / 600);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, diameter * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private _getGlassSprite(): HTMLCanvasElement {
    const lightness = Math.round(this.theme.marbleLightness);
    const cachedHue = Math.round(this.hue / 8) * 8;
    const key = `${cachedHue}:${lightness}`;
    const cached = glassSpriteCache.get(key);
    if (cached) return cached;

    const sprite = document.createElement('canvas');
    sprite.width = 96;
    sprite.height = 96;
    const ctx = sprite.getContext('2d') as CanvasRenderingContext2D;
    const cx = 48;
    const cy = 48;
    const radius = 36;

    ctx.save();
    ctx.shadowColor = `hsla(${cachedHue} 95% 56% / 0.42)`;
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    const glass = ctx.createRadialGradient(31, 27, 3, 51, 52, 41);
    glass.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
    glass.addColorStop(0.1, `hsl(${cachedHue} 88% 92%)`);
    glass.addColorStop(0.28, `hsl(${cachedHue} 92% ${Math.min(88, lightness + 12)}%)`);
    glass.addColorStop(0.62, `hsl(${cachedHue} 88% ${Math.max(28, lightness - 12)}%)`);
    glass.addColorStop(0.86, `hsl(${cachedHue} 92% ${Math.max(15, lightness - 32)}%)`);
    glass.addColorStop(1, `hsl(${cachedHue} 96% 8%)`);
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
    ctx.clip();

    const lowerGlow = ctx.createRadialGradient(55, 70, 1, 54, 68, 25);
    lowerGlow.addColorStop(0, 'rgba(255, 255, 255, 0.62)');
    lowerGlow.addColorStop(0.3, `hsla(${cachedHue} 100% 82% / 0.34)`);
    lowerGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = lowerGlow;
    ctx.fillRect(22, 42, 58, 40);

    ctx.translate(34, 29);
    ctx.rotate(-0.58);
    const highlight = ctx.createRadialGradient(-3, -2, 1, 0, 0, 16);
    highlight.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
    highlight.addColorStop(0.46, 'rgba(255, 255, 255, 0.55)');
    highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = highlight;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(3, 8, 24, 0.58)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 1, 0.18, Math.PI * 0.96);
    ctx.stroke();

    glassSpriteCache.set(key, sprite);
    return sprite;
  }

  private _drawName(ctx: CanvasRenderingContext2D, zoom: number, simpleLabel: boolean) {
    transformGuard(ctx, () => {
      ctx.font = `12pt sans-serif`;
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 0;
      ctx.translate(this.x, this.y + 0.25);
      ctx.scale(1 / zoom, 1 / zoom);
      if (!simpleLabel) ctx.strokeText(this.name, 0, 0);
      ctx.fillText(this.name, 0, 0);
    });
  }

  private _drawOutline(ctx: CanvasRenderingContext2D, lineWidth: number) {
    ctx.beginPath();
    ctx.strokeStyle = this.theme.marbleWinningBorder;
    ctx.lineWidth = lineWidth;
    ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  private _renderCoolTime(ctx: CanvasRenderingContext2D, zoom: number) {
    ctx.strokeStyle = this.theme.coolTimeIndicator;
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size / 2 + 2 / zoom, rad(270), rad(270 + (360 * this._coolTime) / this._maxCoolTime));
    ctx.stroke();
  }
}
