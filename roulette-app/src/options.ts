class Options {
  useSkills = false;
  winningRank = 0;
  autoRecording = false;
  winnerLabel = '당첨';
  candidateLabel = '1위 당첨 유력';
  marbleStyle: 'glass' | 'flat' = 'glass';
}

const options = new Options();
export default options;
