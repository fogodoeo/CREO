import type { Marble } from './marble';
import options from './options';
import type { RenderParameters } from './rouletteRenderer';
import type { Rect } from './types/rect.type';
import type { MouseEventArgs, UIObject } from './UIObject';
import { bound } from './utils/bound.decorator';

export class RankRenderer implements UIObject {
  private _currentY = 0;
  private _targetY = 0;
  private fontHeight = 16;
  private layoutFontHeight = 16;
  private _userMoved = 0;
  private _currentWinner = -1;
  private maxY = 0;
  private winners: Marble[] = [];
  private marbles: Marble[] = [];
  private winnerRank: number = -1;
  private messageHandler?: (msg: string) => void;
  private readonly broadcastMode = new URLSearchParams(location.search).get('broadcast') === '1';

  @bound
  onWheel(e: WheelEvent) {
    this._targetY += e.deltaY;
    if (this._targetY > this.maxY) {
      this._targetY = this.maxY;
    }
    this._userMoved = 2000;
  }

  @bound
  onDblClick(e?: MouseEventArgs) {
    if (e) {
      if (navigator.clipboard) {
        const tsv: string[] = [];
        let rank = 0;
        tsv.push(
          ...[...this.winners, ...this.marbles].map((m) => {
            rank++;
            return [rank.toString(), m.name, rank - 1 === this.winnerRank ? '☆' : ''].join('\t');
          })
        );

        tsv.unshift(['Rank', 'Name', 'Winner'].join('\t'));

        navigator.clipboard.writeText(tsv.join('\n')).then(() => {
          if (this.messageHandler) {
            this.messageHandler('The result has been copied');
          }
        });
      }
    }
  }

  onMessage(func: (msg: string) => void) {
    this.messageHandler = func;
  }

  render(
    ctx: CanvasRenderingContext2D,
    { winners, marbles, winnerRank, winner, theme }: RenderParameters,
    width: number,
    height: number
  ) {
    const broadcastMode = this.broadcastMode;
    const uiScale = broadcastMode ? width / 720 : 1;
    this.layoutFontHeight = this.fontHeight * uiScale;
    const hudHeight = broadcastMode ? 54 * uiScale : 0;
    const listTop = broadcastMode ? hudHeight + 8 * uiScale : 20;
    const startX = width - 8 * uiScale;
    const visibleListHeight = height - listTop;
    const startY = Math.max(-this.layoutFontHeight, this._currentY - visibleListHeight / 2);
    this.maxY = Math.max(
      0,
      (marbles.length + winners.length) * this.layoutFontHeight + this.layoutFontHeight
    );
    this._currentWinner = winners.length;

    this.winners = winners;
    this.marbles = marbles;
    this.winnerRank = winnerRank;
    const useSimpleLabels = width < 560 && marbles.length + winners.length > 48;

    ctx.save();
    if (broadcastMode) {
      const totalCount = winners.length + marbles.length;
      const targetIndex = Math.max(0, winnerRank - winners.length);
      const candidate = winner ?? winners[winnerRank] ?? marbles[targetIndex];
      ctx.fillStyle = 'rgba(4, 10, 18, 0.9)';
      ctx.fillRect(0, 0, width, hudHeight);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.58)';
      ctx.font = `700 ${8 * uiScale}pt sans-serif`;
      ctx.fillText(winner ? '당첨 확정' : options.candidateLabel, width / 2, 7 * uiScale);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${17 * uiScale}pt sans-serif`;
      ctx.fillText(
        candidate?.name ?? '준비 중',
        width / 2,
        24 * uiScale,
        Math.max(180 * uiScale, width - 420 * uiScale)
      );

      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${18 * uiScale}pt sans-serif`;
      ctx.fillText(`${winners.length} / ${totalCount}`, width - 10 * uiScale, 15 * uiScale);
    } else {
      ctx.textAlign = 'right';
      ctx.font = '10pt sans-serif';
      ctx.fillStyle = '#666';
      ctx.fillText(`${winners.length} / ${winners.length + marbles.length}`, width - 5, this.fontHeight);
    }

    ctx.beginPath();
    ctx.rect(
      width - (broadcastMode ? 190 * uiScale : 150),
      listTop,
      width,
      Math.max(0, visibleListHeight)
    );
    ctx.clip();

    ctx.translate(0, -startY);
    ctx.font = `bold ${11 * uiScale}pt sans-serif`;
    if (theme.rankStroke) {
      ctx.lineWidth = 2 * uiScale;
      ctx.strokeStyle = theme.rankStroke;
    }
    winners.forEach((marble: { hue: number; name: string }, rank: number) => {
      const y = rank * this.layoutFontHeight;
      if (y >= startY && y <= startY + visibleListHeight) {
        ctx.fillStyle = `hsl(${marble.hue} 100% ${theme.marbleLightness}%)`;
        if (!useSimpleLabels) {
          ctx.strokeText(`${rank === winnerRank ? '☆' : '\u2714'} ${marble.name} #${rank + 1}`, startX, listTop + y);
        }
        ctx.fillText(`${rank === winnerRank ? '☆' : '\u2714'} ${marble.name} #${rank + 1}`, startX, listTop + y);
      }
    });
    ctx.font = `${10 * uiScale}pt sans-serif`;
    marbles.forEach((marble: { hue: number; name: string }, rank: number) => {
      const y = (rank + winners.length) * this.layoutFontHeight;
      if (y >= startY && y <= startY + visibleListHeight) {
        ctx.fillStyle = `hsl(${marble.hue} 100% ${theme.marbleLightness}%)`;
        if (!useSimpleLabels) ctx.strokeText(`${marble.name} #${rank + 1 + winners.length}`, startX, listTop + y);
        ctx.fillText(`${marble.name} #${rank + 1 + winners.length}`, startX, listTop + y);
      }
    });
    ctx.restore();
  }

  update(deltaTime: number) {
    if (this._currentWinner === -1) {
      return;
    }
    if (this._userMoved > 0) {
      this._userMoved -= deltaTime;
    } else {
      this._targetY = this._currentWinner * this.layoutFontHeight + this.layoutFontHeight;
    }
    if (this._currentY !== this._targetY) {
      this._currentY += (this._targetY - this._currentY) * (deltaTime / 250);
    }
    if (Math.abs(this._currentY - this._targetY) < 1) {
      this._currentY = this._targetY;
    }
  }

  getBoundingBox(): Rect | null {
    return null;
  }
}
