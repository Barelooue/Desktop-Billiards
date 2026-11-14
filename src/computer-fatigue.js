const minute=60000;
const sensitivity={low:1,medium:.83,high:.64,star:.50};
const saturate=value=>Math.max(0,Math.min(1,value));

export function freshComputerFatigue(rng=Math.random){
 return {priorMs:0,strokes:0,effort:0,pace:.9+.2*rng()};
}

export function validComputerFatigue(state){
 return state&&Number.isFinite(state.pace)&&state.pace>=.9&&state.pace<=1.1&&
  [state.priorMs,state.strokes,state.effort].every(value=>Number.isFinite(value)&&value>=0);
}

export function computerFatigueLevel(state,elapsedMs,difficulty){
 if(!state)return 0;
 const time=saturate((state.priorMs+elapsedMs)/(75*minute));
 const strokes=saturate(state.strokes/100),effort=saturate(state.effort/55);
 const load=state.pace*(.65*time+.22*strokes+.13*effort);
 const progress=saturate((load-.21)/.68);
 return sensitivity[difficulty]*progress*progress*(3-2*progress);
}

export function recordComputerStroke(state,shot){
 state.strokes++;
 const spin=saturate(Math.hypot(shot.top,shot.side)/.55);
 const demanding=saturate((shot.speed-1.6)/3);
 const difficultLine=shot.quality===undefined ? .25 : saturate((1-shot.quality)/3);
 state.effort+=.08+.34*spin+.24*demanding+.24*difficultLine+(shot.placement ? .10 : 0);
}

export function nextFrameFatigue(state,elapsedMs){
 return {...state,priorMs:Math.max(0,state.priorMs+elapsedMs-.35*minute),
  strokes:Math.max(0,state.strokes-1),effort:Math.max(0,state.effort-.5)};
}
