import type { Marble } from './marble';
import { selectCandidateRanks } from './candidateRanking.js';
import type { RenderParameters } from './rouletteRenderer';
import { HUD_CONTENT_GAP, HUD_HEIGHT } from './rouletteUiLayout';
import type { Rect } from './types/rect.type';
import type { MouseEventArgs, UIObject } from './UIObject';
import { bound } from './utils/bound.decorator';

export class RankRenderer implements UIObject {
  private _currentY = 0;
  private _targetY = 0;
  private layoutFontHeight = 16;
  private _userMoved = 0;
  private _currentWinner = -1;
  private maxY = 0;
  private winners: Marble[] = [];
  private marbles: Marble[] = [];
  private winnerRank: number = -1;
  private messageHandler?: (msg: string) => void;
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
    { winners, marbles, winnerRank }: RenderParameters,
    width: number,
    height: number
  ) {
    const uiScale = Math.max(1, width / 720);
    this.layoutFontHeight = 24 * uiScale;
    const hudHeight = HUD_HEIGHT * uiScale;
    const listTop = hudHeight + HUD_CONTENT_GAP * uiScale;
    const rankPanelRight = width - 10 * uiScale;
    const rankPanelWidth = 142 * uiScale;
    const rankPanelLeft = rankPanelRight - rankPanelWidth;
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
      this.drawFittedText(ctx, candidate.name, x, hudHeight / 2, slotWidth - 14 * uiScale, 20 * uiScale, 13 * uiScale);
    });

    ctx.textAlign = 'right';
    ctx.fillStyle = academySkin ? '#f4ecd9' : '#ffffff';
    ctx.font = `850 ${21 * uiScale}pt ${this.hudFont}`;
    ctx.fillText(`${winners.length} / ${totalCount}`, width - 10 * uiScale, hudHeight / 2);

    ctx.fillStyle = academySkin ? 'rgba(8, 14, 12, 0.78)' : 'rgba(3, 8, 14, 0.74)';
    ctx.fillRect(rankPanelLeft, listTop, rankPanelWidth, Math.max(0, visibleListHeight));
    ctx.beginPath();
    ctx.rect(rankPanelLeft, listTop, rankPanelWidth, Math.max(0, visibleListHeight));
    ctx.clip();

    ctx.translate(0, -startY);
    winners.forEach((marble: { hue: number; name: string }, rank: number) => {
      const y = rank * this.layoutFontHeight;
      if (y >= startY && y <= startY + visibleListHeight) {
        this.drawRankRow(ctx, marble, rank, rank === winnerRank, listTop + y, rankPanelLeft, rankPanelWidth, uiScale, academySkin);
      }
    });
    marbles.forEach((marble: { hue: number; name: string }, rank: number) => {
      const y = (rank + winners.length) * this.layoutFontHeight;
      if (y >= startY && y <= startY + visibleListHeight) {
        this.drawRankRow(
          ctx,
          marble,
          rank + winners.length,
          false,
          listTop + y,
          rankPanelLeft,
          rankPanelWidth,
          uiScale,
          academySkin,
          useSimpleLabels
        );
      }
    });
    ctx.restore();
  }

  private drawFittedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    preferredSize: number,
    minimumSize: number
  ) {
    let fontSize = preferredSize;
    ctx.font = `850 ${fontSize}pt ${this.hudFont}`;
    while (fontSize > minimumSize && ctx.measureText(text).width > maxWidth) {
      fontSize -= 1;
      ctx.font = `850 ${fontSize}pt ${this.hudFont}`;
    }
    ctx.fillText(this.ellipsize(ctx, text, maxWidth), x, y);
  }

  private ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    const characters = Array.from(text);
    while (characters.length > 1 && ctx.measureText(`${characters.join('')}…`).width > maxWidth) {
      characters.pop();
    }
    return `${characters.join('')}…`;
  }

  private drawRankRow(
    ctx: CanvasRenderingContext2D,
    marble: { hue: number; name: string },
    rank: number,
    isWinner: boolean,
    rowTop: number,
    panelLeft: number,
    panelWidth: number,
    uiScale: number,
    academySkin: boolean,
    compact = false
  ) {
    const inset = 4 * uiScale;
    const rowHeight = this.layoutFontHeight - 2 * uiScale;
    const rowCenter = rowTop + this.layoutFontHeight / 2;
    ctx.fillStyle = academySkin ? 'rgba(244, 236, 217, 0.07)' : 'rgba(255, 255, 255, 0.07)';
    ctx.fillRect(panelLeft + inset, rowTop + uiScale, panelWidth - inset * 2, rowHeight);
    ctx.fillStyle = `hsl(${marble.hue} 92% 58%)`;
    ctx.fillRect(panelLeft + inset, rowTop + uiScale, 3 * uiScale, rowHeight);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = isWinner && academySkin ? '#d4bd86' : 'rgba(244, 236, 217, 0.72)';
    ctx.font = `800 ${compact ? 10 * uiScale : 11 * uiScale}pt ${this.hudFont}`;
    ctx.fillText(`#${rank + 1}`, panelLeft + 12 * uiScale, rowCenter);

    const nameX = panelLeft + 45 * uiScale;
    const nameWidth = panelWidth - 53 * uiScale;
    ctx.fillStyle = '#ffffff';
    this.drawFittedText(
      ctx,
      marble.name,
      nameX,
      rowCenter,
      nameWidth,
      (compact ? 11 : 13) * uiScale,
      9 * uiScale
    );
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
