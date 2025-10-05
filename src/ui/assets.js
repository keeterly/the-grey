function artSVG({motif='aether'}={}) {
  const gold='#8A8174', bone='#5C5F63';
  const fx={
    fire:`<path d="M150 190c-18-38 12-64 26-90-4 30 18 46 8 78 34-14 48-48 44-92 36 38 32 86-22 122-22 16-44 24-56 26z" fill="${gold}" opacity=".85"/>`,
    lightning:`<path d="M160 120l-48 72h36l-40 60 88-98h-34l30-34z" fill="${bone}" opacity=".9"/>`,
    ice:`<g fill="${bone}" opacity=".85"><path d="M180 120l16 40 40 16-40 16-16 40-16-40-40-16 40-16z"/></g>`,
    aether:`<circle cx="200" cy="180" r="34" fill="none" stroke="${gold}" stroke-width="4" opacity=".9"/>`,
    ward:`<g stroke="${gold}" stroke-width="3" opacity=".9" fill="none"><circle cx="200" cy="180" r="40"/><path d="M200 140l24 40h-48z"/><circle cx="200" cy="180" r="8" stroke-width="2"/></g>`,
    hex:`<g fill="none" stroke="${bone}" opacity=".9"><path d="M164 160h72v40h-72z" stroke-width="3"/><path d="M164 180h72" stroke-width="6" opacity=".4"/></g>`,
    stone:`<g fill="${gold}" opacity=".28"><rect x="172" y="156" width="20" height="32"/><rect x="196" y="148" width="24" height="40"/><rect x="224" y="164" width="18" height="24"/></g>`,
    meditate:`<g fill="none" stroke="${gold}" stroke-width="3" opacity=".9"><circle cx="200" cy="180" r="28"/><circle cx="200" cy="180" r="44" opacity=".45"/></g>`
  }[motif]||'';
  return 'data:image/svg+xml;utf8,'+encodeURIComponent(`
  <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 420'>
    <defs>
      <filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/><feComponentTransfer><feFuncA type='table' tableValues='0 .08'/></feComponentTransfer></filter>
      <linearGradient id='v' x1='0' x2='0' y1='0' y2='1'><stop offset='0' stop-color='#ffffff'/><stop offset='1' stop-color='#F7F2E9'/></linearGradient>
    </defs>
    <rect width='100%' height='100%' fill='url(#v)'/>
    <rect width='100%' height='100%' filter='url(#g)' opacity='.12'/>
    <g transform='translate(-40 0)'>${fx}</g>
  </svg>`);
}
const ART_MAP={
  'flame-lash':artSVG({motif:'fire'}),'spark-javelin':artSVG({motif:'lightning'}),
  'frost-bolt':artSVG({motif:'ice'}),'ember':artSVG({motif:'fire'}),
  'siphon-hex':artSVG({motif:'hex'}),'stonewall':artSVG({motif:'stone'}),
  'aether-core':artSVG({motif:'aether'}),'aether-shard':artSVG({motif:'aether'}),
  'aether-pebble':artSVG({motif:'aether'}),'meditate':artSVG({motif:'meditate'}),
  'glacial-ward':artSVG({motif:'ward'}),'mirror-ward':artSVG({motif:'ward'}),
  'ward-sigil':artSVG({motif:'ward'}),'apprentice-bolt':artSVG({motif:'lightning'}),
  'kindle':artSVG({motif:'fire'})
};
const slug=s=>(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
export function resolveArt(c){const k=(c&&(c.artKey||slug(c.n)))||'card';return ART_MAP[k]||ART_MAP['aether-core'];}
