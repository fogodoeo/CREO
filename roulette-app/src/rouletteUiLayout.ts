export const HUD_HEIGHT = 38;
export const HUD_CONTENT_GAP = 6;
export const CONTROLS_RESERVE_HEIGHT = 30;
export const NATIONAL_FINISHER_WIDTH = 164;
export const NATIONAL_FINISHER_INSET = 12;
export function nationalPanelScale(width: number) {
  return Math.max(.6, width / 960);
}
export function nationalPlayfieldRatio(width: number) {
  return Math.max(.5, 1 - (NATIONAL_FINISHER_WIDTH + 2 * NATIONAL_FINISHER_INSET) * nationalPanelScale(width) / width);
}
