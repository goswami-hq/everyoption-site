/* Home page banner (his yes, 2026-11-03). Source: ai-hq projects/platform/design/centerpiece/. Plays once, then rests on the logo. On a computer the view is wider, so more of the route shows. */
(function(){
var WIDE=window.matchMedia('(min-width: 760px)'),$=function(i){return document.getElementById(i)},NS='http://www.w3.org/2000/svg',svg=$('s'),T=8.6;
var C=function(a,b,x){x=(x-a)/(b-a);x=x<0?0:x>1?1:x;return x*x*(3-2*x)},L=function(a,b,p){return a+(b-a)*p};
var ox=1000,oy=62,or=14.4,wc=1000,len=0;
var stops=[{x:700,y:62,R:58,a:.4,b:1.2,c:2.05},{x:1000,y:110,R:66,a:2.05,b:2.85,c:3.7},{x:1417,y:170,R:50,a:3.7,b:4.5,c:5.35}];
stops.forEach(function(s){var g=document.createElementNS(NS,'circle');g.setAttribute('cx',s.x);g.setAttribute('cy',s.y);g.setAttribute('fill','url(#heat)');$('heats').appendChild(g);s.g=g;s.bd=[];for(var j=0;j<14;j++){var b=document.createElementNS(NS,'circle');b.setAttribute('r',1.5);b.setAttribute('fill','var(--bead)');$('beads').appendChild(b);s.bd.push(b)}});
function lenAt(x){var a=0,b=len;for(var i=0;i<30;i++){var m=(a+b)/2;if($('bg').getPointAtLength(m).x<x)a=m;else b=m}return a}
function layout(){
  $('w1').setAttribute('x',0);$('w2').setAttribute('x',0);var a=$('w1').getComputedTextLength(),b=$('w2').getComputedTextLength(),sp=8.5,w=a+sp+2*or+1+b,x0=1720;
  wc=x0+w/2;ox=x0+a+sp+or;oy=285-15;$('w1').setAttribute('x',x0+a);$('w2').setAttribute('x',ox+or+1);
  var d='M0.0 0.0 C9.7 3.7 38.4 16.1 58.4 22.4 C78.4 28.7 99.6 32.8 120.0 38.0 C140.4 43.2 150.5 56.3 180.8 53.9 C211.1 51.5 264.5 25.2 301.6 23.7 C338.7 22.2 374.4 40.0 403.5 44.8 C432.5 49.5 452.7 54.6 475.6 52.2 C498.6 49.7 513.8 30.3 541.2 30.2 C568.6 30.2 613.5 45.7 640.0 52.0 C666.5 58.3 680.0 67.0 700.0 68.0 C720.0 69.0 736.1 55.7 760.0 58.0 C783.9 60.3 812.9 75.0 843.7 82.0 C874.5 89.0 918.9 94.3 945.0 100.0 C971.1 105.7 981.7 114.7 1000.0 116.0 C1018.3 117.3 1036.9 104.0 1055.0 108.0 C1073.1 112.0 1087.8 133.8 1108.6 140.2 C1129.5 146.5 1148.1 142.7 1180.0 146.0 C1211.9 149.3 1260.5 156.0 1300.0 160.0 C1339.5 164.0 1387.0 166.3 1417.0 170.0 C1447.0 173.7 1457.5 171.8 1480.0 182.0 C1502.5 192.2 1528.6 217.6 1551.9 231.0 C1575.3 244.3 1608.7 256.8 1620.0 262.0 C1660 270 '+(ox-60)+' '+(oy+6)+' '+(ox-or)+' '+oy;
  ['bg','lit','cath'].forEach(function(i){$(i).setAttribute('d',d)});len=$('bg').getTotalLength();
  $('lit').style.strokeDasharray=$('cath').style.strokeDasharray=len;
  stops.forEach(function(s){s.l=lenAt(s.x)});
}
function camY(x){var A=[[0,-16],[700,62],[1000,110],[1417,170],[wc,oy]];if(x<=A[0][0])return A[0][1];for(var i=0;i<A.length-1;i++){if(x<=A[i+1][0])return L(A[i][1],A[i+1][1],C(A[i][0],A[i+1][0],x))}return A[A.length-1][1]}
function seek(n){
  var l=0,t=Math.max(0,n-1.2);
  var p0=C(.4,1.2,t),p1=C(2.05,2.85,t),p2=C(3.7,4.5,t),p3=C(5.35,6,t);
  l=L(L(L(L(0,stops[0].l,p0),stops[1].l,p1),stops[2].l,p2),len,p3);
  var pt=$('bg').getPointAtLength(l);
  $('lit').style.strokeDashoffset=len-l;$('cath').style.strokeDashoffset=len-l;
  var pinOn=C(1.15,1.2,n);var vh=130,f=1;$('tip').setAttribute('cx',pt.x);$('tip').setAttribute('cy',pt.y);
  var endFade=C(5.7,6.1,t);
  $('tip').style.opacity=t>.4?(1-endFade):0;var ff=C(stops[1].b+.05,stops[1].c-.05,t);[['fa',252,135],['fb',150,190]].forEach(function(q){$(q[0]).setAttribute('transform','translate('+q[1]+' '+q[2]+') scale('+(1-.42*ff).toFixed(3)+') translate('+(-q[1])+' '+(-q[2])+')')});var tf=C(stops[0].b+.05,stops[0].c-.05,t);$('ta').setAttribute('transform','translate(178 214) scale('+(1.4*(1-.66*tf)).toFixed(3)+') translate(-178 -214)');var ths=document.querySelectorAll('.th');for(var k=0;k<ths.length;k++)ths[k].style.opacity=1-tf;var fh=document.querySelectorAll('.fh');for(var ii=0;ii<fh.length;ii++)fh[ii].style.opacity=.75*(1-ff);$('cath').style.opacity=1-endFade;$('lit').style.opacity=1-endFade;$('bg').style.opacity=.3*(1-endFade);
  $('pin').setAttribute('r',4.2*f*pinOn);$('pinh').setAttribute('r',1.3*f*pinOn);$('ha').setAttribute('r',20*f);$('tip').setAttribute('r',2.4*f);$('ha').style.opacity=C(.9,1.3,n)*(1-C(.8,1.2,t));
  var fx=Math.min(pt.x,wc),cx=fx-100*C(1150,1417,fx)+100*C(1417,1620,fx),cy=camY(fx),wide=WIDE.matches,vw=wide?1000:390;vh=wide?236:130;svg.setAttribute('viewBox',(cx-vw/2).toFixed(2)+' '+(cy-vh/2).toFixed(2)+' '+vw.toFixed(2)+' '+vh.toFixed(2));$('world').style.opacity=C(.5,1.2,n)*(1-C(5.6,6.1,t));
  stops.forEach(function(s,i){
    var fix=C(s.b+.05,s.c-.05,t),calm=1-fix;s.g.setAttribute('r',s.R+3*Math.sin(t*4+i));s.g.style.opacity=calm*(.8+.2*Math.sin(t*4+i));
    s.bd.forEach(function(b,j){var a=j*2.4+i,u=(t-s.b-.02-j*.025)/.55,pr=u<0?0:u>1?1:u,rad=4+pr*s.R*.5*(.55+.45*Math.sin(j*1.7));b.setAttribute('cx',s.x+Math.cos(a)*rad);b.setAttribute('cy',s.y+Math.sin(a)*rad*.7);b.style.opacity=(u>0&&u<1.3)?(u<1?.95:.95*(1.3-u)/.3):0});
  });
  var g=C(5.7,6.3,t);$('disc').setAttribute('cx',ox);$('disc').setAttribute('cy',oy);$('disc').setAttribute('r',or*g);$('hole').setAttribute('cx',ox);$('hole').setAttribute('cy',oy);$('hole').setAttribute('r',or*.24*g);
  $('w1').style.opacity=$('w2').style.opacity=C(5.8,6.4,t);var su=C(5.8,6.9,t);$('sun').setAttribute('cx',ox);$('sun').setAttribute('cy',oy);$('sun').setAttribute('r',L(12,52,su));$('sun').style.opacity=su;
  var sx=-wc,sy=-16-oy,isIntro=n<1.2,fl=C(.5,1.2,n);
  $('w1').setAttribute('transform',isIntro?'translate('+sx+' '+sy+')':'');$('w2').setAttribute('transform',isIntro?'translate('+sx+' '+sy+')':'');
  if(isIntro){var wo=1-C(.4,.85,n);$('w1').style.opacity=$('w2').style.opacity=wo;
    $('sun').setAttribute('cx',0);$('sun').setAttribute('cy',-16);$('sun').setAttribute('r',52);$('sun').style.opacity=1-C(.4,1.1,n);
    var dx=L(ox+sx,0,fl),dy=L(oy+sy,0,fl),dr=L(or,4.2,fl);$('disc').setAttribute('cx',dx);$('disc').setAttribute('cy',dy);$('disc').setAttribute('r',dr);$('hole').setAttribute('cx',dx);$('hole').setAttribute('cy',dy);$('hole').setAttribute('r',dr*.24);}
}
var t0=null,run=false,reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function frame(n){if(!run)return;if(t0===null)t0=n;var t=(n-t0)/1000;if(t>=T){seek(T);run=false;$('rp').style.opacity=1;return}seek(t);requestAnimationFrame(frame)}
function play(){$('rp').style.opacity=0;t0=null;run=true;requestAnimationFrame(frame)}
$('rp').onclick=function(){run=false;play()};
window.__seek=function(x){run=false;seek(x)};
layout();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){layout();seek(run?0:T)});
if(reduce){seek(T)}else{seek(0);play()}
})();
