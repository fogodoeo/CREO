import type { Camera } from './camera';
import { canvasHeight, canvasWidth, initialZoom, Themes, winnerAreaHeight } from './data/constants';
import type { StageDef } from './data/maps';
import type { GameObject } from './gameObject';
import type { Marble } from './marble';
import options from './options';
import type { ParticleManager } from './particleManager';
import type { ColorTheme } from './types/ColorTheme';
import type { MapEntityState } from './types/MapEntity.type';
import type { VectorLike } from './types/VectorLike';
import type { UIObject } from './UIObject';

export type RenderParameters = {
  camera: Camera;
  stage: StageDef;
  entities: MapEntityState[];
  marbles: Marble[];
  winners: Marble[];
  particleManager: ParticleManager;
  effects: GameObject[];
  winnerRank: number;
  winner: Marble | null;
  size: VectorLike;
  theme: ColorTheme;
};

const MAX_DISPLAY_WIDTH = 1920;
const BROADCAST_DISPLAY_WIDTH = 1920;
const BROADCAST_SCENE_WIDTHS = {
  performance: 960,
  balanced: 1280,
  high: 1920,
} as const;
const COMPACT_SCENE_WIDTH = 480;
const COMPACT_SCENE_PIXEL_BUDGET = 520_000;
const BROADCAST_SCENE_ZOOM = 1.18;
const WINNER_TEXT_OFFSET = 30;
const ACADEMY_ASSET_URLS = {
  wand: '/assets/pinball-academy/wand-v1.png',
  rune: '/assets/pinball-academy/rune-stone-v1.png',
  gate: '/assets/pinball-academy/finish-gate-v1.png',
  crest: '/assets/crewart-crest-v2.webp',
} as const;

function loadImage(src: string): HTMLImageElement {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  return image;
}

type CutoutAsset = {
  image: HTMLImageElement;
  source: HTMLCanvasElement | null;
};

function loadGeneratedCutout(src: string, maxEdge: number): CutoutAsset {
  const asset: CutoutAsset = { image: loadImage(src), source: null };
  asset.image.addEventListener('load', () => {
    const scale = Math.min(1, maxEdge / Math.max(asset.image.naturalWidth, asset.image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(asset.image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(asset.image.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(asset.image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      const red = pixels.data[offset];
      const green = pixels.data[offset + 1];
      const blue = pixels.data[offset + 2];
      const high = Math.max(red, green, blue);
      const low = Math.min(red, green, blue);
      const brightness = (red + green + blue) / 3;
      if (high - low <= 10 && brightness >= 205) {
        pixels.data[offset + 3] = brightness >= 235 ? 0 : Math.round(((235 - brightness) / 30) * 255);
      }
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.putImageData(pixels, 0, 0);
    asset.source = canvas;
  });
  return asset;
}

export class RouletteRenderer {
  protected _canvas!: HTMLCanvasElement;
  protected _sceneCanvas!: HTMLCanvasElement;
  protected ctx!: CanvasRenderingContext2D;
  private _displayCtx!: CanvasRenderingContext2D;
  private readonly _broadcastMode = new URLSearchParams(location.search).get('broadcast') === '1';
  private _lastProgressSignature = '';
  private readonly _academyAssets = {
    wand: loadGeneratedCutout(ACADEMY_ASSET_URLS.wand, 768),
    rune: loadGeneratedCutout(ACADEMY_ASSET_URLS.rune, 640),
    gate: loadGeneratedCutout(ACADEMY_ASSET_URLS.gate, 768),
    crest: loadImage(ACADEMY_ASSET_URLS.crest),
  };
  public sizeFactor = 1;

  protected _theme: ColorTheme = Themes.dark;

  get width() {
    return this._sceneCanvas.width;
  }

  get height() {
    return this._sceneCanvas.height;
  }

  get canvas() {
    return this._canvas;
  }

  set theme(value: ColorTheme) {
    this._theme = value;
  }

  async init() {
    const broadcastMode = this._broadcastMode;
    this._canvas = document.createElement('canvas');
    this._canvas.width = canvasWidth;
    this._canvas.height = canvasHeight;
    this._displayCtx = this._canvas.getContext('2d', {
      alpha: false,
    }) as CanvasRenderingContext2D;

    this._sceneCanvas = document.createElement('canvas');
    this._sceneCanvas.width = canvasWidth;
    this._sceneCanvas.height = canvasHeight;
    this.ctx = this._sceneCanvas.getContext('2d', {
      alpha: false,
    }) as CanvasRenderingContext2D;

    const host = document.querySelector<HTMLElement>('[data-roulette-canvas-host]') ?? document.body;
    host.appendChild(this._canvas);

    const resizing = (entries?: ResizeObserverEntry[]) => {
      const realSize = entries ? entries[0].contentRect : this._canvas.getBoundingClientRect();
      if (realSize.width <= 0 || realSize.height <= 0) return;

      const searchParams = new URLSearchParams(location.search);
      const broadcastQuality = searchParams.get('quality');
      const broadcastWidth =
        broadcastQuality === 'high'
          ? BROADCAST_SCENE_WIDTHS.high
          : broadcastQuality === 'balanced'
            ? BROADCAST_SCENE_WIDTHS.balanced
            : BROADCAST_SCENE_WIDTHS.performance;
      const compactPortrait = !broadcastMode && realSize.width < 760 && realSize.height > realSize.width * 1.15;
      let width = broadcastMode
        ? broadcastWidth
        : compactPortrait
          ? Math.max(realSize.width, Math.min(COMPACT_SCENE_WIDTH, realSize.width * 1.5))
          : Math.max(realSize.width / 2, 640);
      let height = (width / realSize.width) * realSize.height;
      if (compactPortrait && width * height > COMPACT_SCENE_PIXEL_BUDGET) {
        const budgetScale = Math.sqrt(COMPACT_SCENE_PIXEL_BUDGET / (width * height));
        width = Math.max(realSize.width, width * budgetScale);
        height = (width / realSize.width) * realSize.height;
      }
      this._sceneCanvas.width = width;
      this._sceneCanvas.height = height;
      this._canvas.dataset.worldSize = `${Math.round(width)}x${Math.round(height)}`;

      const displayWidth = broadcastMode ? BROADCAST_DISPLAY_WIDTH : Math.min(realSize.width, MAX_DISPLAY_WIDTH);
      this._canvas.width = displayWidth;
      this._canvas.height = (displayWidth / realSize.width) * realSize.height;
      this.sizeFactor = (broadcastMode ? displayWidth : width) / realSize.width;
    };

    const resizeObserver = new ResizeObserver(resizing);

    resizeObserver.observe(this._canvas);
    resizing();
  }

  private getMarbleImage(_name: string): CanvasImageSource | undefined {
    return undefined;
  }

  protected onBeforeEntities(): void {}
  protected onAfterScene(): void {}

  render(renderParameters: RenderParameters, uiObjects: UIObject[]) {
    const progressSignature = `${renderParameters.winners.length}:${renderParameters.marbles.length}`;
    if (progressSignature !== this._lastProgressSignature) {
      this._lastProgressSignature = progressSignature;
      this._canvas.dataset.finished = String(renderParameters.winners.length);
      this._canvas.dataset.remaining = String(renderParameters.marbles.length);
      this._canvas.dataset.total = String(renderParameters.winners.length + renderParameters.marbles.length);
    }
    this._theme = renderParameters.theme;
    this.ctx.fillStyle = this._theme.background;
    this.ctx.fillRect(0, 0, this._sceneCanvas.width, this._sceneCanvas.height);

    this.ctx.save();
    if (this._broadcastMode) {
      this.ctx.translate(this._sceneCanvas.width / 2, this._sceneCanvas.height / 2);
      this.ctx.scale(BROADCAST_SCENE_ZOOM, BROADCAST_SCENE_ZOOM);
      this.ctx.translate(-this._sceneCanvas.width / 2, -this._sceneCanvas.height / 2);
    }
    this.ctx.scale(initialZoom, initialZoom);
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.font = '0.4pt sans-serif';
    this.ctx.lineWidth = 3 / (renderParameters.camera.zoom + initialZoom);
    renderParameters.camera.renderScene(this.ctx, () => {
      this.onBeforeEntities();
      this.renderAcademyFinish(renderParameters.stage);
      this.renderEntities(renderParameters.entities);
      this.renderEffects(renderParameters);
      this.renderMarbles(renderParameters);
    });
    this.ctx.restore();
    this.onAfterScene();
    renderParameters.particleManager.render(this.ctx);

    if (this._broadcastMode) {
      this._displayCtx.imageSmoothingEnabled = true;
      this._displayCtx.imageSmoothingQuality = 'high';
      this._displayCtx.drawImage(this._sceneCanvas, 0, 0, this._canvas.width, this._canvas.height);
      this.renderBroadcastLabels(renderParameters);
      uiObjects.forEach((obj) =>
        obj.render(this._displayCtx, renderParameters, this._canvas.width, this._canvas.height)
      );
      this.renderWinner(renderParameters, this._displayCtx, this._canvas.width, this._canvas.height, true);
    } else {
      uiObjects.forEach((obj) =>
        obj.render(this.ctx, renderParameters, this._sceneCanvas.width, this._sceneCanvas.height)
      );
      this.renderWinner(renderParameters, this.ctx, this._sceneCanvas.width, this._sceneCanvas.height, false);
      this._displayCtx.drawImage(this._sceneCanvas, 0, 0, this._canvas.width, this._canvas.height);
    }
  }

  private renderBroadcastLabels({ marbles, camera, size }: RenderParameters) {
    const displayScale = this._canvas.width / this._sceneCanvas.width;
    const viewPort = { x: camera.x, y: camera.y, w: size.x, h: size.y, zoom: camera.zoom * initialZoom };

    this._displayCtx.save();
    this._displayCtx.scale(displayScale, displayScale);
    this._displayCtx.translate(this._sceneCanvas.width / 2, this._sceneCanvas.height / 2);
    this._displayCtx.scale(BROADCAST_SCENE_ZOOM, BROADCAST_SCENE_ZOOM);
    this._displayCtx.translate(-this._sceneCanvas.width / 2, -this._sceneCanvas.height / 2);
    this._displayCtx.scale(initialZoom, initialZoom);
    this._displayCtx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
    this._displayCtx.scale(camera.zoom, camera.zoom);
    this._displayCtx.translate(
      this._sceneCanvas.width / (initialZoom * 2 * camera.zoom),
      this._sceneCanvas.height / (initialZoom * 2 * camera.zoom)
    );
    marbles.forEach((marble) => marble.renderLabel(this._displayCtx, camera.zoom * initialZoom, viewPort));
    this._displayCtx.restore();
  }

  private renderEntities(entities: MapEntityState[]) {
    this.ctx.save();
    entities.forEach((entity) => {
      const transform = this.ctx.getTransform();
      this.ctx.translate(entity.x, entity.y);
      this.ctx.rotate(entity.angle);
      this.ctx.fillStyle = entity.shape.color ?? this._theme.entity[entity.shape.type].fill;
      this.ctx.strokeStyle = entity.shape.color ?? this._theme.entity[entity.shape.type].outline;
      this.ctx.shadowBlur = this._theme.entity[entity.shape.type].bloomRadius;
      this.ctx.shadowColor =
        entity.shape.bloomColor ?? entity.shape.color ?? this._theme.entity[entity.shape.type].bloom;
      const shape = entity.shape;
      switch (shape.type) {
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
        case 'box': {
          const w = shape.width * 2;
          const h = shape.height * 2;
          this.ctx.rotate(shape.rotation);
          if (this.isAcademySkin() && entity.motion === 'kinematic' && this.cutoutReady(this._academyAssets.wand)) {
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = 'rgba(212, 189, 134, 0.55)';
            this.ctx.drawImage(this._academyAssets.wand.source!, -w * 0.72, -w * 0.45, w * 1.44, w * 0.9);
          } else if (
            this.isAcademySkin() &&
            shape.width <= 0.35 &&
            shape.height <= 0.35 &&
            this.cutoutReady(this._academyAssets.rune)
          ) {
            const size = Math.max(w, h) * 3;
            this.ctx.shadowBlur = 5;
            this.ctx.shadowColor = 'rgba(212, 189, 134, 0.42)';
            this.ctx.drawImage(this._academyAssets.rune.source!, -size / 2, -size / 2, size, size);
          } else {
            this.ctx.fillRect(-w / 2, -h / 2, w, h);
            this.ctx.strokeRect(-w / 2, -h / 2, w, h);
          }
          break;
        }
        case 'circle': {
          if (this.isAcademySkin() && this.cutoutReady(this._academyAssets.rune)) {
            const size = shape.radius * 2.55;
            this.ctx.shadowBlur = 7;
            this.ctx.shadowColor = 'rgba(212, 189, 134, 0.48)';
            this.ctx.drawImage(this._academyAssets.rune.source!, -size / 2, -size / 2, size, size);
          } else {
            this.ctx.beginPath();
            this.ctx.arc(0, 0, shape.radius, 0, Math.PI * 2, false);
            this.ctx.stroke();
          }
          break;
        }
      }

      this.ctx.setTransform(transform);
    });
    this.ctx.restore();
  }

  private isAcademySkin(): boolean {
    return document.documentElement.dataset.rouletteTheme === 'academy';
  }

  private imageReady(image: HTMLImageElement): boolean {
    return image.complete && image.naturalWidth > 0;
  }

  private cutoutReady(asset: CutoutAsset): boolean {
    return Boolean(asset.source);
  }

  private renderAcademyFinish(stage: StageDef): void {
    if (!this.isAcademySkin() || !this.cutoutReady(this._academyAssets.gate)) return;
    const nearGoal = [...(stage.adBoards ?? [])]
      .reverse()
      .find((board) => Math.abs(stage.goalY - board.y) <= 25);
    const x = nearGoal?.x ?? 13;
    const y = nearGoal?.y ?? stage.goalY - 6;
    const width = Math.min(10, Math.max(7, nearGoal?.w ?? 8));
    const height = width * 0.78;

    this.ctx.save();
    this.ctx.globalAlpha = 0.94;
    this.ctx.shadowBlur = 12;
    this.ctx.shadowColor = 'rgba(212, 189, 134, 0.28)';
    this.ctx.drawImage(this._academyAssets.gate.source!, x - width / 2, y - height / 2, width, height);
    if (this.imageReady(this._academyAssets.crest)) {
      const crestWidth = width * 0.2;
      const crestHeight = crestWidth * 1.18;
      this.ctx.shadowBlur = 4;
      this.ctx.drawImage(
        this._academyAssets.crest,
        x - crestWidth / 2,
        y - height * 0.33,
        crestWidth,
        crestHeight
      );
    }
    this.ctx.restore();
  }

  private renderEffects({ effects, camera }: RenderParameters) {
    effects.forEach((effect) => effect.render(this.ctx, camera.zoom * initialZoom, this._theme));
  }

  private renderMarbles({ marbles, camera, winnerRank, winners, size }: RenderParameters) {
    const winnerIndex = winnerRank - winners.length;
    const totalCount = marbles.length + winners.length;
    const useSimpleLabels = size.x < 560 && totalCount > 48;

    const viewPort = { x: camera.x, y: camera.y, w: size.x, h: size.y, zoom: camera.zoom * initialZoom };
    marbles.forEach((marble, i) => {
      marble.render(
        this.ctx,
        camera.zoom * initialZoom,
        i === winnerIndex,
        false,
        this.getMarbleImage(marble.name),
        viewPort,
        this._theme,
        useSimpleLabels,
        !this._broadcastMode
      );
    });
  }

  private renderWinner(
    { winner, theme }: RenderParameters,
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scaleForBroadcast: boolean
  ) {
    if (!winner) return;
    const scale = scaleForBroadcast ? width / canvasWidth : 1;
    const resultAreaHeight = winnerAreaHeight * scale;
    ctx.save();
    ctx.fillStyle = theme.winnerBackground;
    ctx.fillRect(width / 2, height - resultAreaHeight, width / 2, resultAreaHeight);

    // Draw marble image or colored circle
    const marbleSize = 100 * scale;
    const marbleCenterX = width - marbleSize / 2 - 20 * scale;
    const marbleCenterY = height - resultAreaHeight / 2;
    const marbleImage = this.getMarbleImage(winner.name);

    if (marbleImage) {
      ctx.drawImage(
        marbleImage,
        marbleCenterX - marbleSize / 2,
        marbleCenterY - marbleSize / 2,
        marbleSize,
        marbleSize
      );
    } else {
      winner.renderResultBody(ctx, marbleCenterX, marbleCenterY, marbleSize);
    }

    ctx.fillStyle = theme.winnerText;
    ctx.strokeStyle = theme.winnerOutline;

    ctx.font = `bold ${48 * scale}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.lineWidth = 4 * scale;
    const textRightX = marbleCenterX - marbleSize / 2 - 20 * scale;
    const winnerLabelY = height - 120 * scale + WINNER_TEXT_OFFSET * scale;
    if (theme.winnerOutline) {
      ctx.strokeText(options.winnerLabel, textRightX, winnerLabelY);
    }

    ctx.fillText(options.winnerLabel, textRightX, winnerLabelY);
    ctx.font = `bold ${72 * scale}px sans-serif`;
    ctx.fillStyle = `hsl(${winner.hue} 100% ${theme.marbleLightness})`;
    const winnerNameY = height - 55 * scale + WINNER_TEXT_OFFSET * scale;
    if (theme.winnerOutline) {
      ctx.strokeText(winner.name, textRightX, winnerNameY);
    }
    ctx.fillText(winner.name, textRightX, winnerNameY);
    ctx.restore();
  }
}
