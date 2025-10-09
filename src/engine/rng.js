export function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]} return a; } export function uid(){ return Math.random().toString(36).slice(2,9); }
