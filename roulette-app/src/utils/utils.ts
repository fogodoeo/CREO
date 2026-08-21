import { random } from './random';
import { parseParticipantName } from '../participantName.js';

export function rad(degree: number) {
  return (Math.PI * degree) / 180;
}

export function parseName(nameStr: string) {
  return parseParticipantName(nameStr);
}

export function pad(v: number) {
  return v.toString().padStart(2, '0');
}

export function shuffle<T>(originalArray: T[]): T[] {
  const array = originalArray.slice();
  let currentIndex = array.length;
  let randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex !== 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }

  return array;
}
