import type { Marble } from './marble';
import { selectCandidateRanks } from './candidateRanking.js';
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
  private readonly hudFont = "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

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
    const uiScale = Math.max(1, width / 720);
    this.layoutFontHeight = this.fontHeight * uiScale;
    const hudHeight = 80 * uiScale;
    const listTop = hudHeight + 8 * uiScale;
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
    const totalCount = winners.length + marbles.length;
    const candidates = selectCandidateRanks([...winners, ...marbles], winnerRank, 3);
    const academySkin = document.documentElement.dataset.rouletteTheme === 'academy';
    ctx.canvas.dataset.candidateRanks = candidates.map(({ rank }) => rank).join(',');
    ctx.canvas.dataset.candidateNames = candidates.map(({ candidate }) => candidate.name).join('|');
    ctx.fillStyle = academySkin ? 'rgba(14, 20, 18, 0.94)' : 'rgba(4, 10, 18, 0.9)';
    ctx.fillRect(0, 0, width, hudHeight);
    if (academySkin) {
      ctx.fillStyle = 'rgba(212, 189, 134, 0.55)';
      ctx.fillRect(0, hudHeight - Math.max(1, uiScale), width, Math.max(1, uiScale));
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const candidateAreaWidth = Math.max(300 * uiScale, Math.min(600 * uiScale, width - 210 * uiScale));
    const slotWidth = candidateAreaWidth / Math.max(1, candidates.length);
    const candidateStartX = width / 2 - candidateAreaWidth / 2;
    candidates.forEach(({ candidate }, index) => {
      const x = candidateStartX + slotWidth * (index + 0.5);
      ctx.fillStyle = academySkin ? '#f4ecd9' : '#ffffff';
      ctx.font = `850 ${20 * uiScale}pt ${this.hudFont}`;
      ctx.fillText(candidate.name, x, hudHeight / 2, slotWidth - 14 * uiScale);
    });

    ctx.textAlign = 'right';
    ctx.fillStyle = academySkin ? '#f4ecd9' : '#ffffff';
    ctx.font = `850 ${21 * uiScale}pt ${this.hudFont}`;
    ctx.fillText(`${winners.length} / ${totalCount}`, width - 10 * uiScale, hudHeight / 2);

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
