const clamp=value=>Math.max(0,Math.min(1,value));
export const CHALK_SECONDS=2.6;
export const CHALK_CONTACT_START=CHALK_SECONDS*.25;
export const CHALK_CONTACT_END=CHALK_SECONDS*.75;

// Gameplay approximation of chalk/grip loss, not permanent leather damage.
// A few shots retain full grip; powerful, off-centre contacts consume more.
export function tipWear(power,spin){
 const p=clamp(power),s=clamp(spin);
 return .018+.038*p*p+.045*s*s+.035*p*s;
}
export function cueResponse(condition,spin){
 const worn=clamp((.7-clamp(condition))/.7),s=clamp(spin);
 return {speed:1-worn*(.14+.16*s),spin:1-.65*worn};
}
