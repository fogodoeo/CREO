import { initialZoom } from './data/constants';
import type { RenderParameters } from './rouletteRenderer';
import type { ColorTheme } from './types/ColorTheme';
import type { MapEntityState } from './types/MapEntity.type';
import type { Rect } from './types/rect.type';
import type { VectorLike } from './types/VectorLike';
import type { UIObject } from './UIObject';
import { bound } from './utils/bound.decorator';

export class Minimap implements UIObject {
  private scale = 4;
  private top = 10;
  private ctx!: CanvasRenderingContext2D;
  private lastParams: RenderParameters | null = null;
  private readonly broadcastMode = new URLSearchParams(location.search).get('broadcast') === '1';

  private _onViewportChangeHandler: ((pos?: VectorLike) => void) | null = null;
  private boundingBox: Rect;
  private mousePosition: { x: number; y: number } | null = null;

  constructor() {
    this.boundingBox = {
      x: 10,
      y: 10,
      w: 26 * 4,
      h: 0,
    };
  }

  getBoundingBox(): Rect | null {
    return this.boundingBox;
  }

  onViewportChange(callback: (pos?: VectorLike) => void) {
    this._onViewportChangeHandler = callback;
  }

  update(): void {
    // nothing to do
  }

  @bound
  onMouseMove(e?: { x: number; y: number }) {
    if (!e) {
      this.mousePosition = null;
      if (this._onViewportChangeHandler) {
        this._onViewportChangeHandler();
      }
      return;
    }
    if (!this.lastParams) return;
    this.mousePosition = {
      x: e.x,
      y: e.y,
    };
    if (this._onViewportChangeHandler) {
      this._onViewportChangeHandler({
        x: this.mousePosition.x / this.scale,
        y: this.mousePosition.y / this.scale,
      });
    }
  }

  render(ctx: CanvasRenderingContext2D, params: RenderParameters) {
    if (!ctx) return;
    const { stage } = params;
    if (!stage) return;
    const broadcastMode = this.broadcastMode;
    const uiScale = broadcastMode ? ctx.canvas.width / 720 : 1;
    this.top = 76 * uiScale;
    const controlsReserve = 62 * uiScale;
    const availableHeight = Math.max(120, ctx.canvas.height - this.top - controlsReserve);
    this.scale = broadcastMode ? availableHeight / stage.goalY : Math.min(4, availableHeight / stage.goalY);
    this.boundingBox.y = this.top;
    this.boundingBox.w = 26 * this.scale;
    this.boundingBox.h = stage.goalY * this.scale;

    this.lastParams = params;

    this.ctx = ctx;
    ctx.save();
    ctx.fillStyle = params.theme.minimapBackground;
    ctx.translate(this.boundingBox.x, this.boundingBox.y);
    ctx.scale(this.scale, this.scale);
    ctx.fillRect(0, 0, 26, stage.goalY);

    this.ctx.lineWidth = 3 / (params.camera.zoom + initialZoom);
    this.drawEntities(params.entities, params.theme);
    this.drawMarbles(params);
    this.drawViewport(params);

    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'green';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.boundingBox.x, this.boundingBox.y, this.boundingBox.w, this.boundingBox.h);
    ctx.restore();
  }

  private drawViewport(params: RenderParameters) {
    this.ctx.save();
    const { camera, size } = params;
    const broadcastSceneZoom = this.broadcastMode ? 1.18 : 1;
    const zoom = camera.zoom * initialZoom * broadcastSceneZoom;
    const w = size.x / zoom;
    const h = size.y / zoom;
    this.ctx.strokeStyle = params.theme.minimapViewport;
    this.ctx.lineWidth = 1 / zoom;
    this.ctx.strokeRect(camera.x - w / 2, camera.y - h / 2, w, h);
    this.ctx.restore();
  }

  private drawEntities(entities: MapEntityState[], theme: ColorTheme) {
    this.ctx.save();
    entities.forEach((entity) => {
      this.ctx.save();
      this.ctx.fillStyle = entity.shape.color ?? theme.entity[entity.shape.type].fill;
      this.ctx.strokeStyle = entity.shape.color ?? theme.entity[entity.shape.type].outline;
      this.ctx.translate(entity.x, entity.y);
      this.ctx.rotate(entity.angle);

      this.ctx.save();
      const shape = entity.shape;
      switch (shape.type) {
        case 'box': {
          const w = shape.width * 2;
          const h = shape.height * 2;
          this.ctx.rotate(shape.rotation);
          this.ctx.fillRect(-w / 2, -h / 2, w, h);
          break;
        }
        case 'circle':
          this.ctx.beginPath();
          this.ctx.arc(0, 0, shape.radius, 0, Math.PI * 2, false);
          this.ctx.stroke();
          break;
        case 'polyline':
          if (shape.points.length > 0) {
            this.ctx.beginPath();
            this.ctx.moveTo(shape.points[0][0], shape.points[0][1]);
            for (let i = 1; i < shape.points.length; i++) {
              this.ctx.lineTo(shape.points[i][0], shape.points[i][1]);
            }
            this.ctx.stroke();
          }
          break;
      }
      this.ctx.restore();
      this.ctx.restore();
    });
    this.ctx.restore();
  }

  private drawMarbles(params: RenderParameters) {
    const { marbles } = params;
    const viewPort = {
      x: params.camera.x,
      y: params.camera.y,
      w: params.size.x,
      h: params.size.y,
      zoom: params.camera.zoom * initialZoom,
    };
    marbles.forEach((marble) => {
      marble.render(this.ctx, 1, false, true, undefined, viewPort, params.theme);
    });
  }
}
