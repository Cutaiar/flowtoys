// One shared loop length: every periodic idle motion uses integer multiples
// of LOOP_W, so a LOOP_SECONDS-second recording loops seamlessly.
export const LOOP_SECONDS = 12;
export const LOOP_W = (2 * Math.PI) / LOOP_SECONDS;
