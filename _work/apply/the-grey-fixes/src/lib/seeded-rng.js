
export function mulberry32(a){let t=(a+=0x6D2B79F5);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;}
export function createRNG(seed){const s=(seed>>>0)||0;let x=s||0x1A2B3C4D;return()=>mulberry32(x=(x+0x9E3779B9)>>>0);}
export function createUID(seed=0){const rand=createRNG(seed);return()=>Math.floor(rand()*0xFFFFFFFF).toString(16);}
