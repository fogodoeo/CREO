import type { Marble } from './marble';
import { selectCandidateRanks } from './candidateRanking.js';
import { runningParticipantName } from './participantDisplay.js';
import type { RenderParameters } from './rouletteRenderer';
import { HUD_CONTENT_GAP, HUD_HEIGHT, NATIONAL_FINISHER_WIDTH, NATIONAL_FINISHER_INSET, nationalPanelScale } from './rouletteUiLayout';
import type { Rect } from './types/rect.type';
import type { MouseEventArgs, UIObject } from './UIObject';
import { bound } from './utils/bound.decorator';

export class RankRenderer implements UIObject {
  private _currentY = 0;
  private _targetY = 0;
  private layoutFontHeight = 16;
  private _userMoved = 0;
  private _currentWinner = -1;
  private _nationalMode = false;
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
    if (document.documentElement.dataset.rouletteTheme === 'national') {
      this.renderNationalFinishers(ctx, winners, winners.length + marbles.length, width, height);
      return;
    }
    this._nationalMode = false;
    const uiScale = Math.max(1, width / 720);
    this.layoutFontHeight = 19 * uiScale;
    const hudHeight = HUD_HEIGHT * uiScale;
    const listTop = hudHeight + HUD_CONTENT_GAP * uiScale;
    const rankPanelRight = width;
    const rankPanelWidth = 114 * uiScale;
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
    const nationalSkin = document.documentElement.dataset.rouletteTheme === 'national';
    ctx.canvas.dataset.candidateRanks = candidates.map(({ rank }) => rank).join(',');
    ctx.canvas.dataset.candidateNames = candidates.map(({ candidate }) => runningParticipantName(candidate.name)).join('|');
    ctx.fillStyle = nationalSkin ? '#0648bf' : academySkin ? 'rgba(14, 20, 18, 0.94)' : 'rgba(4, 10, 18, 0.9)';
    ctx.fillRect(0, 0, width, hudHeight);
    if (academySkin) {
      ctx.fillStyle = 'rgba(212, 189, 134, 0.55)';
      ctx.fillRect(0, hudHeight - Math.max(1, uiScale), width, Math.max(1, uiScale));
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const candidateAreaWidth = Math.max(280 * uiScale, Math.min(480 * uiScale, width - 190 * uiScale));
    const slotWidth = candidateAreaWidth / Math.max(1, candidates.length);
    const candidateStartX = width / 2 - candidateAreaWidth / 2;
    candidates.forEach(({ candidate }, index) => {
      const x = candidateStartX + slotWidth * (index + 0.5);
      this.drawCandidateLabel(ctx, candidate, x, hudHeight / 2, slotWidth - 8 * uiScale, uiScale, academySkin);
    });

    ctx.textAlign = 'right';
    ctx.fillStyle = academySkin ? '#f4ecd9' : '#ffffff';
    ctx.font = `850 ${17 * uiScale}pt ${this.hudFont}`;
    ctx.fillText(`${winners.length} / ${totalCount}`, width - 6 * uiScale, hudHeight / 2);

    ctx.fillStyle = nationalSkin ? '#102e61' : academySkin ? 'rgba(8, 14, 12, 0.78)' : 'rgba(3, 8, 14, 0.74)';
    ctx.fillRect(rankPanelLeft, listTop, rankPanelWidth, Math.max(0, visibleListHeight));
    ctx.beginPath();
    ctx.rect(rankPanelLeft, listTop, rankPanelWidth, Math.max(0, visibleListHeight));
    ctx.clip();

    ctx.translate(0, -startY);
    winners.forEach((marble: { hue: number; name: string }, rank: number) => {
      const y = rank * this.layoutFontHeight;
      if (y >= startY && y <= startY + visibleListHeight) {
        this.drawRankRow(ctx, marble, rank, true, listTop + y, rankPanelLeft, rankPanelWidth, uiScale, academySkin);
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
    if (winners.length > 0) {
      const boundaryY = listTop + winners.length * this.layoutFontHeight;
      ctx.strokeStyle = academySkin ? 'rgba(244, 236, 217, 0.88)' : 'rgba(255, 255, 255, 0.86)';
      ctx.lineWidth = 1.25 * uiScale;
      ctx.beginPath();
      ctx.moveTo(rankPanelLeft + 5 * uiScale, boundaryY);
      ctx.lineTo(rankPanelRight - 3 * uiScale, boundaryY);
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderNationalFinishers(
    ctx: CanvasRenderingContext2D,
    winners: Marble[],
    total: number,
    width: number,
    height: number
  ) {
    const scale = nationalPanelScale(width);
    const inset = NATIONAL_FINISHER_INSET * scale, panelWidth = NATIONAL_FINISHER_WIDTH * scale;
    const left = width - panelWidth - inset, top = inset;
    const panelHeight = height - inset * 2;
    const listTop = top + 64 * scale, footerHeight = 36 * scale;
    const listHeight = Math.max(0, panelHeight - 64 * scale - footerHeight);
    this.layoutFontHeight = 32 * scale;
    if (!this._nationalMode || winners.length < this._currentWinner) {
      this._currentY = this._targetY = this._userMoved = 0;
    }
    this._nationalMode = true;
    this._currentWinner = winners.length;
    this.winners = winners;
    this.marbles = [];
    this.maxY = Math.max(0, winners.length * this.layoutFontHeight - listHeight);
    this._targetY = Math.max(0, Math.min(this.maxY, this._targetY));
    this._currentY = Math.max(0, Math.min(this.maxY, this._currentY));

    ctx.save();
    ctx.fillStyle = '#1b1e24';
    ctx.strokeStyle = '#454b55';
    ctx.lineWidth = scale;
    ctx.beginPath();
    ctx.roundRect(left, top, panelWidth, panelHeight, 10 * scale);
    ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f6f3ec';
    ctx.font = `750 ${16 * scale}px ${this.hudFont}`;
    ctx.fillText('골인 순서', left + 14 * scale, top + 23 * scale);
    ctx.fillStyle = '#b6bdc9';
    ctx.font = `600 ${12 * scale}px ${this.hudFont}`;
    ctx.fillText(`${winners.length} / ${total}개 공`, left + 14 * scale, top + 46 * scale);

    ctx.save();
    ctx.beginPath();
    ctx.rect(left + scale, listTop, panelWidth - 2 * scale, listHeight);
    ctx.clip();
    if (!winners.length) {
      ctx.fillText('아직 골인 전', left + 14 * scale, listTop + 20 * scale);
    }
    winners.forEach((marble, index) => {
      const y = listTop + index * this.layoutFontHeight - this._currentY;
      if (y + this.layoutFontHeight < listTop || y > listTop + listHeight) return;
      ctx.fillStyle = index % 2 === 0 ? '#242830' : '#1b1e24';
      ctx.fillRect(left + 6 * scale, y, panelWidth - 12 * scale, this.layoutFontHeight);
      ctx.fillStyle = '#d9bd85';
      ctx.font = `650 ${12 * scale}px ${this.hudFont}`;
      ctx.fillText(String(index + 1).padStart(2, '0'), left + 14 * scale, y + 16 * scale);
      ctx.fillStyle = '#f6f3ec';
      ctx.font = `700 ${14 * scale}px ${this.hudFont}`;
      ctx.fillText(this.ellipsize(ctx, runningParticipantName(marble.name), panelWidth - 54 * scale),
        left + 42 * scale, y + 16 * scale);
    });
    ctx.restore();
    ctx.fillStyle = '#f4d48d';
    ctx.font = `650 ${12 * scale}px ${this.hudFont}`;
    ctx.fillText('★ 현재 당첨 후보', left + 14 * scale, top + panelHeight - footerHeight / 2);
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
    const fitted = this.fitText(ctx, text, maxWidth, preferredSize, minimumSize);
    ctx.fillText(fitted, x, y);
  }

  private fitText(
    ctx: CanvasRenderingContext2D,
    text: string,
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
    return this.ellipsize(ctx, text, maxWidth);
  }

  private drawCandidateLabel(
    ctx: CanvasRenderingContext2D,
    candidate: { hue: number; name: string },
    centerX: number,
    centerY: number,
    maxWidth: number,
    uiScale: number,
    academySkin: boolean
  ) {
    const radius = 5 * uiScale;
    const gap = 5 * uiScale;
    const textMaxWidth = Math.max(30 * uiScale, maxWidth - radius * 2 - gap);
    const label = this.fitText(ctx, runningParticipantName(candidate.name), textMaxWidth, 16 * uiScale, 11 * uiScale);
    const textWidth = ctx.measureText(label).width;
    const groupWidth = radius * 2 + gap + textWidth;
    const startX = centerX - groupWidth / 2;

    ctx.save();
    ctx.fillStyle = `hsl(${candidate.hue} 92% 58%)`;
    ctx.beginPath();
    ctx.arc(startX + radius, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.beginPath();
    ctx.arc(startX + radius * 0.68, centerY - radius * 0.35, radius * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = academySkin ? '#f4ecd9' : '#ffffff';
    ctx.fillText(label, startX + radius * 2 + gap, centerY);
    ctx.restore();
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
    marble: { name: string },
    rank: number,
    confirmed: boolean,
    rowTop: number,
    panelLeft: number,
    panelWidth: number,
    uiScale: number,
    academySkin: boolean,
    compact = false
  ) {
    const inset = 2 * uiScale;
    const rowHeight = this.layoutFontHeight - uiScale;
    const rowCenter = rowTop + this.layoutFontHeight / 2;
    ctx.fillStyle = academySkin ? 'rgba(244, 236, 217, 0.07)' : 'rgba(255, 255, 255, 0.07)';
    ctx.fillRect(panelLeft + inset, rowTop + uiScale * 0.5, panelWidth - inset, rowHeight);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = confirmed ? '#ffffff' : 'rgba(255, 255, 255, 0.48)';
    ctx.font = `800 ${compact ? 8 * uiScale : 9 * uiScale}pt ${this.hudFont}`;
    ctx.fillText(`#${rank + 1}`, panelLeft + 7 * uiScale, rowCenter);

    const nameX = panelLeft + 31 * uiScale;
    const nameWidth = panelWidth - 34 * uiScale;
    ctx.fillStyle = confirmed ? '#ffffff' : 'rgba(255, 255, 255, 0.78)';
    this.drawFittedText(
      ctx,
      runningParticipantName(marble.name),
      nameX,
      rowCenter,
      nameWidth,
      (compact ? 9 : 10.5) * uiScale,
      8 * uiScale
    );
  }

  update(deltaTime: number) {
    if (this._currentWinner === -1) {
      return;
    }
    if (this._userMoved > 0) {
      this._userMoved -= deltaTime;
    } else {
      this._targetY = this._nationalMode ? this.maxY : this._currentWinner * this.layoutFontHeight + this.layoutFontHeight;
    }
    if (this._nationalMode) this._targetY = Math.max(0, Math.min(this.maxY, this._targetY));
    if (this._currentY !== this._targetY) {
      this._currentY += (this._targetY - this._currentY) * Math.min(1, deltaTime / 250);
    }
    if (Math.abs(this._currentY - this._targetY) < 1) {
      this._currentY = this._targetY;
    }
  }

  getBoundingBox(): Rect | null {
    return null;
  }
}
