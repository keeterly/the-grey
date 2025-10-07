
export function animateFly(el,{x=0,y=0,ms=250,easing='ease-out'}={}){
  return new Promise((resolve)=>{
    el.classList.add('anim-layer');
    el.style.transition=`transform ${ms}ms ${easing}, opacity ${ms}ms ${easing}`;
    el.style.transform=`translate(0px,0px)`;
    requestAnimationFrame(()=>{
      el.style.transform=`translate(${x}px,${y}px)`;
      setTimeout(()=>{el.style.transition='';resolve();},ms+16);
    });
  });
}
