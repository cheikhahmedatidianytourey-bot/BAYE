const DIRECTIONS = {
  realism: 'Visual direction: highly photorealistic live-action footage, physically plausible motion, natural lighting and shadows, realistic camera optics, detailed textures, coherent scene geometry; avoid cartoon or artificial CGI appearance.',
  humans: 'Human subjects: anatomically accurate human proportions, natural skin texture and pores, believable facial expressions, realistic eyes, natural hands and fingers, subtle body movement and lifelike gestures.',
  continuity: 'Character continuity: maintain the same identity, facial features, hairstyle, clothing and body proportions for each recurring character throughout the entire clip.',
  documentary: 'Camera style: observational documentary, natural available light, restrained camera movement.',
  cinematic: 'Camera style: cinematic live-action photography, controlled camera movement and realistic depth of field.'
};
export function buildVideoPrompt({prompt,humanFocus=true,characterConsistency=true,videoLook='live-action'}={}) {
  const subject = typeof prompt === 'string' ? prompt.trim().slice(0,1200) : '';
  if (!subject) return '';
  return [subject,DIRECTIONS.realism,humanFocus?DIRECTIONS.humans:'',characterConsistency?DIRECTIONS.continuity:'',videoLook==='documentary'?DIRECTIONS.documentary:DIRECTIONS.cinematic].filter(Boolean).join('\n\n');
}
