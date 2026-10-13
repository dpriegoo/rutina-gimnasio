// =====================================================================
// Animaciones del movimiento  (feel-anim.js)
// Muñeco esquemático en SVG con "huesos" (cinemática inversa de 2 tramos).
// Cada patrón define: vista, tempo (fases), cómo se construye y cómo se pinta
// según u (posición 0..1) y tn (tensión del músculo 0..1).
// API pública: FeelAnim.has(clave), FeelAnim.start(clave, svg, fasesEl, tempoEl) -> parar()
// Sin dependencias.
// =====================================================================
const FeelAnim = (function(){
const NS='http://www.w3.org/2000/svg';
const ease=x=>x<0?0:x>1?1:x*x*(3-2*x);
function twoBone(S,W,l1,l2,sign){let dx=W[0]-S[0],dy=W[1]-S[1];let d=Math.hypot(dx,dy);d=Math.min(d,l1+l2-0.01);const a=(l1*l1-l2*l2+d*d)/(2*d);const h=Math.sqrt(Math.max(0,l1*l1-a*a));
 const ux=dx/Math.hypot(dx,dy),uy=dy/Math.hypot(dx,dy);const P=[S[0]+a*ux,S[1]+a*uy];return[P[0]+sign*h*(-uy),P[1]+sign*h*ux]}
const SK='#cfd6e0',TR='#aab2bd';
function el(svg,tag,attrs){const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);svg.appendChild(e);return e}
function limb(svg,w,col){return el(svg,'polyline',{fill:'none',stroke:col||SK,'stroke-width':w,'stroke-linecap':'round','stroke-linejoin':'round'})}
function pts(pl,a){pl.setAttribute('points',a.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' '))}


function dims(svg,xs,txt){const y=50;el(svg,'line',{x1:xs[0],y1:y,x2:xs[1],y2:y,stroke:'#f2a93b','stroke-width':1.5});el(svg,'line',{x1:xs[0],y1:y-4,x2:xs[0],y2:y+4,stroke:'#f2a93b','stroke-width':1.5});el(svg,'line',{x1:xs[1],y1:y-4,x2:xs[1],y2:y+4,stroke:'#f2a93b','stroke-width':1.5});
 el(svg,'text',{x:150,y:y-6,fill:'#f2a93b','font-size':9,'text-anchor':'middle'}).textContent=txt;
 el(svg,'line',{x1:100,y1:62,x2:200,y2:62,stroke:'#7c8490','stroke-width':1,'stroke-dasharray':'3 3'});el(svg,'text',{x:150,y:73,fill:'#7c8490','font-size':8.5,'text-anchor':'middle'}).textContent='anchura de hombros'}
function outwardElbow(S,W,l1,l2){const a=twoBone(S,W,l1,l2,1),b=twoBone(S,W,l1,l2,-1);return a[0]<b[0]?a:b}
function armPair(o,S,wx,wy,l1,l2){const W=[wx,wy];const E=outwardElbow(S,W,l1,l2);
 pts(o.upL,[S,E]);pts(o.foL,[E,W]);pts(o.upR,[[300-S[0],S[1]],[300-E[0],E[1]]]);pts(o.foR,[[300-E[0],E[1]],[300-W[0],W[1]]])}
function dumbbell(svg){const g=el(svg,'g',{});el(g,'rect',{x:-16,y:-3,width:32,height:6,rx:3,fill:'#9aa2ad'});el(g,'rect',{x:-24,y:-11,width:10,height:22,rx:3,fill:'#3a3f47',stroke:'#7c8490'});el(g,'rect',{x:14,y:-11,width:10,height:22,rx:3,fill:'#3a3f47',stroke:'#7c8490'});return g}
function place(g,x,y){g.setAttribute('transform','translate('+x.toFixed(1)+','+y.toFixed(1)+')')}
function headView(svg){el(svg,'text',{x:150,y:24,fill:'#7c8490','font-size':9,'text-anchor':'middle'}).textContent='Vista desde detrás de la cabeza'}
// ---------- utilidades comunes de los patrones nuevos ----------
const SV='20 -10 260 194', D2R=Math.PI/180;
const add=(P,dx,dy)=>[P[0]+dx,P[1]+dy];
const pol=(P,len,deg)=>[P[0]+len*Math.cos(deg*D2R),P[1]+len*Math.sin(deg*D2R)];
const pick=(S,W,l1,l2,f)=>{const a=twoBone(S,W,l1,l2,1),b=twoBone(S,W,l1,l2,-1);return f(a,b)?a:b};
const minX=(a,b)=>a[0]<b[0], maxX=(a,b)=>a[0]>b[0], minY=(a,b)=>a[1]<b[1], maxY=(a,b)=>a[1]>b[1];
function ground(svg){el(svg,'line',{x1:20,y1:176,x2:280,y2:176,stroke:'#3a3f47','stroke-width':2})}
function label(svg,txt,x,y){el(svg,'text',{x:x||150,y:y||6,fill:'#7c8490','font-size':9,'text-anchor':'middle'}).textContent=txt}
// Muñeco lateral: piernas, tronco, cabeza, brazo
function sideFig(svg,o,noArm){
  o.legT=limb(svg,10,'#9aa2ad');o.legS=limb(svg,9,'#9aa2ad');o.foot=limb(svg,6,'#9aa2ad');
  o.torso=limb(svg,15,TR);
  o.glow=el(svg,'ellipse',{fill:'#ff6b57',opacity:.2});
  o.head=el(svg,'circle',{r:10,fill:TR});
  if(!noArm){o.up=limb(svg,8);o.fore=limb(svg,7);o.hand=el(svg,'circle',{r:5,fill:'#cfd6e0'})}
}
function leg(o,H,K,A,ground){pts(o.legT,[H,K]);pts(o.legS,[K,A]);pts(o.foot,A[1]>168?[add(A,-3,0),add(A,13,0)]:[A,A])}
function body(o,H,S,hl){pts(o.torso,[H,S]);const d=Math.hypot(S[0]-H[0],S[1]-H[1])||1;const h=add(S,(S[0]-H[0])/d*(hl||14),(S[1]-H[1])/d*(hl||14));o.head.setAttribute('cx',h[0].toFixed(1));o.head.setAttribute('cy',h[1].toFixed(1))}
function arm(o,S,E,W){pts(o.up,[S,E]);pts(o.fore,[E,W]);o.hand.setAttribute('cx',W[0].toFixed(1));o.hand.setAttribute('cy',W[1].toFixed(1))}
// Resplandor del músculo sobre un segmento P->Q, desplazado "off" en perpendicular
function glowSeg(o,P,Q,off,thick,tn,lenK){const dx=Q[0]-P[0],dy=Q[1]-P[1],l=Math.hypot(dx,dy)||1;const cx=(P[0]+Q[0])/2+(-dy/l)*off,cy=(P[1]+Q[1])/2+(dx/l)*off;
  const g=o.glow;g.setAttribute('cx',cx.toFixed(1));g.setAttribute('cy',cy.toFixed(1));g.setAttribute('rx',(l*(lenK||.38)).toFixed(1));g.setAttribute('ry',thick);
  g.setAttribute('transform','rotate('+(Math.atan2(dy,dx)/D2R).toFixed(1)+' '+cx.toFixed(1)+' '+cy.toFixed(1)+')');g.setAttribute('opacity',tn.toFixed(2))}
// Tempo: 'down' = baja lento (2 s), pausa, sube; 'up' = esfuerzo 1 s, aprieta 1 s, vuelve 2 s
function mk(mode,lab,txt,rest){
  const T=mode==='down'
   ?{cycle:4,phases:[[0,2,lab[0],txt[0]],[2,3,lab[1],txt[1]],[3,4,lab[2],txt[2]]],u:t=>t<2?ease(t/2):t<3?1:1-ease(t-3),tension:(t,u)=>t<2?.35+.15*u:t<3?.55:.55+.45*ease(t-3)}
   :{cycle:4,phases:[[0,1,lab[0],txt[0]],[1,2,lab[1],txt[1]],[2,4,lab[2],txt[2]]],u:t=>t<1?ease(t):t<2?1:1-ease((t-2)/2),tension:(t,u)=>t<1?.3+.6*ease(t):t<2?1:.35+.55*(1-ease((t-2)/2))};
  return Object.assign({vb:SV},T,rest);
}
// Muñeco de frente (sentado)
function frontFig(svg,o){
  el(svg,'rect',{x:132,y:44,width:36,height:78,rx:8,fill:'#3a3f47'});el(svg,'rect',{x:120,y:118,width:60,height:8,rx:4,fill:'#4a505a'});el(svg,'rect',{x:146,y:126,width:8,height:50,fill:'#3a3f47'});
  el(svg,'line',{x1:150,y1:50,x2:150,y2:112,stroke:TR,'stroke-width':30,'stroke-linecap':'round'});
  o.gl=el(svg,'ellipse',{cx:122,cy:60,rx:11,ry:9,fill:'#ff6b57',opacity:.2});o.gr=el(svg,'ellipse',{cx:178,cy:60,rx:11,ry:9,fill:'#ff6b57',opacity:.2});
  el(svg,'line',{x1:140,y1:112,x2:130,y2:170,stroke:'#9aa2ad','stroke-width':10,'stroke-linecap':'round'});el(svg,'line',{x1:160,y1:112,x2:170,y2:170,stroke:'#9aa2ad','stroke-width':10,'stroke-linecap':'round'});
  el(svg,'circle',{cx:150,cy:30,r:12,fill:TR});
  o.aL=limb(svg,9);o.fL=limb(svg,8);o.aR=limb(svg,9);o.fR=limb(svg,8);o.hL=el(svg,'circle',{r:5.5,fill:'#e8ecf2'});o.hR=el(svg,'circle',{r:5.5,fill:'#e8ecf2'});
}
function frontArms(o,SL,E,W){const SR=[300-SL[0],SL[1]],ER=[300-E[0],E[1]],WR=[300-W[0],W[1]];pts(o.aL,[SL,E]);pts(o.fL,[E,W]);pts(o.aR,[SR,ER]);pts(o.fR,[ER,WR]);
  o.hL.setAttribute('cx',W[0]);o.hL.setAttribute('cy',W[1]);o.hR.setAttribute('cx',WR[0]);o.hR.setAttribute('cy',WR[1])}
// Vista desde arriba (aperturas)
function topFig(svg,o,front){
  label(svg,'Vista desde arriba',150,6);
  el(svg,'ellipse',{cx:150,cy:118,rx:38,ry:15,fill:TR});
  o.gl=el(svg,'ellipse',{cx:front?136:116,cy:front?106:112,rx:front?14:11,ry:front?8:7,fill:'#ff6b57',opacity:.2});o.gr=el(svg,'ellipse',{cx:front?164:184,cy:front?106:112,rx:front?14:11,ry:front?8:7,fill:'#ff6b57',opacity:.2});
  el(svg,'circle',{cx:150,cy:126,r:11,fill:'#d4dae2'});
  o.aL=limb(svg,9);o.fL=limb(svg,8);o.aR=limb(svg,9);o.fR=limb(svg,8);o.hL=el(svg,'circle',{r:6,fill:'#e8ecf2'});o.hR=el(svg,'circle',{r:6,fill:'#e8ecf2'});
}
function topArms(o,beta){const S=[124,104],W=pol(S,64,-90-beta*-1);// dirección "adelante" = -90°; beta>0 abre hacia fuera/atrás
  const ang=-90-beta, Wp=pol(S,64,ang), M=pol(S,32,ang), n=[Math.sin(ang*D2R),-Math.cos(ang*D2R)], E=[M[0]+n[0]*5,M[1]+n[1]*5];
  const SR=[300-S[0],S[1]],ER=[300-E[0],E[1]],WR=[300-Wp[0],Wp[1]];pts(o.aL,[S,E]);pts(o.fL,[E,Wp]);pts(o.aR,[SR,ER]);pts(o.fR,[ER,WR]);
  o.hL.setAttribute('cx',Wp[0]);o.hL.setAttribute('cy',Wp[1]);o.hR.setAttribute('cx',WR[0]);o.hR.setAttribute('cy',WR[1])}
const BAR=(svg)=>el(svg,'circle',{r:7,fill:'#9aa2ad',stroke:'#7c8490'});
const mv=(c,P)=>{c.setAttribute('cx',P[0].toFixed(1));c.setAttribute('cy',P[1].toFixed(1))};
const ln=(svg,a,b,w,col)=>el(svg,'line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:col||'#3a3f47','stroke-width':w||4,'stroke-linecap':'round'});
const A0=[150,176];
const standing=(o)=>{leg(o,[150,98],[152,138],A0)};
function setLine(l,a,b){l.setAttribute('x1',a[0]);l.setAttribute('y1',a[1]);l.setAttribute('x2',b[0]);l.setAttribute('y2',b[1])}

// Codo "hacia fuera y abajo": entre las dos soluciones del brazo elige la más baja y más lejos del tronco
function elbowOut(S,W,l1,l2){return pick(S,W,l1,l2,(a,b)=>Math.abs(a[0]-150)+a[1]*1.5>Math.abs(b[0]-150)+b[1]*1.5)}
// Jalón visto desde detrás del muñeco: se ve cómo se agarra la barra según el tipo de agarre
function pulldownBack(grip){
  const G={neutro:{x:11,txt:'Agarre neutro (asa en V): palmas enfrentadas',hand:'v'},supino:{x:22,txt:'Agarre supino: palmas hacia ti, a la anchura de los hombros',hand:'h'},ancho:{x:54,txt:'Agarre ancho: palmas al frente, más ancho que los hombros',hand:'h'}}[grip];
  return mk('up',['TIRA','APRIETA','VUELVE'],['Baja los codos hacia los costados, 1 s','Aprieta los dorsales 1 s','Sube lento, 2 s · estira los dorsales'],{
    build(svg){const o={};label(svg,'Vista desde detrás',64,6);
      el(svg,'rect',{x:112,y:150,width:76,height:9,rx:4,fill:'#4a505a'});el(svg,'rect',{x:146,y:159,width:8,height:17,fill:'#3a3f47'});ground(svg);
      el(svg,'line',{x1:150,y1:62,x2:150,y2:146,stroke:TR,'stroke-width':44,'stroke-linecap':'round'});
      o.gl=el(svg,'ellipse',{cx:131,cy:108,rx:11,ry:27,fill:'#ff6b57',opacity:.2,transform:'rotate(8 131 108)'});o.gr=el(svg,'ellipse',{cx:169,cy:108,rx:11,ry:27,fill:'#ff6b57',opacity:.2,transform:'rotate(-8 169 108)'});
      el(svg,'circle',{cx:150,cy:40,r:13,fill:TR});
      o.cab=ln(svg,[150,-4],[150,10],2,'#7c8490');o.cabL=ln(svg,[150,0],[150,10],2,'#7c8490');o.cabR=ln(svg,[150,0],[150,10],2,'#7c8490');
      o.aL=limb(svg,9);o.fL=limb(svg,8);o.aR=limb(svg,9);o.fR=limb(svg,8);
      o.bar=ln(svg,[0,0],[0,0],6,'#9aa2ad');
      o.hL=el(svg,'rect',{rx:3,fill:'#e8ecf2'});o.hR=el(svg,'rect',{rx:3,fill:'#e8ecf2'});
      const y=170;el(svg,'line',{x1:150-G.x-3,y1:y,x2:150+G.x+3,y2:y,stroke:'#f2a93b','stroke-width':1.5});
      el(svg,'text',{x:150,y:182,fill:'#f2a93b','font-size':8.5,'text-anchor':'middle'}).textContent=G.txt;return o},
    draw(o,u,tn){const SL=[128,70],y=16+u*68,WL=[150-G.x,y],E=elbowOut(SL,WL,36,26),SR=[300-SL[0],SL[1]],ER=[300-E[0],E[1]],WR=[300-WL[0],y];
      pts(o.aL,[SL,E]);pts(o.fL,[E,WL]);pts(o.aR,[SR,ER]);pts(o.fR,[ER,WR]);
      const half=G.hand==='v'?[6,14]:[16,8];[[o.hL,WL],[o.hR,WR]].forEach(([h,W])=>{h.setAttribute('width',half[0]);h.setAttribute('height',half[1]);h.setAttribute('x',(W[0]-half[0]/2).toFixed(1));h.setAttribute('y',(W[1]-half[1]/2).toFixed(1))});
      const bx=G.hand==='v'?[WL[0]-4,WR[0]+4]:[WL[0]-16,WR[0]+16];setLine(o.bar,[bx[0],y-5],[bx[1],y-5]);
      setLine(o.cabL,[150,-4],[bx[0],y-5]);setLine(o.cabR,[150,-4],[bx[1],y-5]);setLine(o.cab,[150,-8],[150,-4]);
      o.gl.setAttribute('opacity',tn.toFixed(2));o.gr.setAttribute('opacity',tn.toFixed(2))}});
}
const ANIMS={
 press:{vb:'28 14 244 172',cycle:4,phases:[[0,2,'BAJA','Controlado, 2 s · estira el pecho'],[2,3,'PAUSA','1 s sin rebotar, codos ~45°'],[3,4,'EMPUJA','1 s · aprieta el pecho']],
  u:t=>t<2?ease(t/2):t<3?1:1-ease(t-3),
  tension:(t,u)=>t<2?.35+.15*u:t<3?.55:.55+.45*ease(t-3),
  build(svg){headView(svg);const o={};
   el(svg,'line',{x1:30,y1:176,x2:270,y2:176,stroke:'#3a3f47','stroke-width':2});
   el(svg,'rect',{x:146,y:162,width:8,height:14,fill:'#3a3f47'});el(svg,'rect',{x:118,y:154,width:64,height:9,rx:4,fill:'#4a505a'});
   el(svg,'ellipse',{cx:150,cy:140,rx:56,ry:17,fill:TR});
   o.glowL=el(svg,'ellipse',{cx:123,cy:132,rx:24,ry:9,fill:'#ff6b57',opacity:.2});o.glowR=el(svg,'ellipse',{cx:177,cy:132,rx:24,ry:9,fill:'#ff6b57',opacity:.2});
   el(svg,'circle',{cx:150,cy:146,r:10,fill:'#d4dae2'});
   o.upL=limb(svg,10);o.foL=limb(svg,8);o.upR=limb(svg,10);o.foR=limb(svg,8);
   o.bar=el(svg,'line',{x1:56,x2:244,stroke:'#9aa2ad','stroke-width':5,'stroke-linecap':'round'});
   o.pl=el(svg,'rect',{x:44,width:11,height:46,rx:3,fill:'#3a3f47',stroke:'#7c8490'});o.pr=el(svg,'rect',{x:245,width:11,height:46,rx:3,fill:'#3a3f47',stroke:'#7c8490'});
   o.hl=el(svg,'rect',{x:80,width:16,height:12,rx:5,fill:'#e8ecf2'});o.hr=el(svg,'rect',{x:204,width:16,height:12,rx:5,fill:'#e8ecf2'});
   dims(svg,[88,212],'Agarre: algo más ancho que los hombros');return o},
  draw(o,u,tn){const yb=78+u*46;armPair(o,[100,132],88,yb,42,36);
   o.bar.setAttribute('y1',yb);o.bar.setAttribute('y2',yb);o.pl.setAttribute('y',yb-23);o.pr.setAttribute('y',yb-23);o.hl.setAttribute('y',yb-6);o.hr.setAttribute('y',yb-6);
   o.glowL.setAttribute('opacity',tn.toFixed(2));o.glowR.setAttribute('opacity',tn.toFixed(2))}},
 incline:{vb:'28 14 244 172',cycle:4,phases:[[0,2,'BAJA','Controlado, 2 s · estira bajo la clavícula'],[2,3,'PAUSA','1 s · mancuernas a la altura del pecho alto'],[3,4,'EMPUJA','1 s · junta las manos arriba']],
  u:t=>t<2?ease(t/2):t<3?1:1-ease(t-3),
  tension:(t,u)=>t<2?.35+.15*u:t<3?.55:.55+.45*ease(t-3),
  build(svg){const o={};
   el(svg,'line',{x1:30,y1:176,x2:270,y2:176,stroke:'#3a3f47','stroke-width':2});
   el(svg,'rect',{x:146,y:150,width:8,height:26,fill:'#3a3f47'});el(svg,'rect',{x:116,y:104,width:68,height:56,rx:8,fill:'#4a505a'});
   el(svg,'ellipse',{cx:150,cy:144,rx:52,ry:15,fill:TR});
   o.glowL=el(svg,'ellipse',{cx:125,cy:127,rx:22,ry:7,fill:'#ff6b57',opacity:.2});o.glowR=el(svg,'ellipse',{cx:175,cy:127,rx:22,ry:7,fill:'#ff6b57',opacity:.2});
   el(svg,'circle',{cx:150,cy:116,r:10,fill:'#d4dae2'});
   o.upL=limb(svg,10);o.foL=limb(svg,8);o.upR=limb(svg,10);o.foR=limb(svg,8);
   o.dl=dumbbell(svg);o.dr=dumbbell(svg);
   const t=el(svg,'text',{x:150,y:26,fill:'#7c8490','font-size':9,'text-anchor':'middle'});t.textContent='Banco a 30-45° · vista desde detrás de la cabeza';return o},
  draw(o,u,tn){const yb=58+u*64;const xw=128-u*38;armPair(o,[100,130],xw,yb,42,36);
   place(o.dl,xw,yb);place(o.dr,300-xw,yb);o.glowL.setAttribute('opacity',tn.toFixed(2));o.glowR.setAttribute('opacity',tn.toFixed(2))}},
 row:{vb:'20 6 235 178',cycle:4,phases:[[0,1,'TIRA','Codos atrás y abajo, 1 s'],[1,2,'APRIETA','Junta omóplatos, 1 s'],[2,4,'VUELVE','Lento, 2 s · estira el dorsal']],
  u:t=>t<1?ease(t):t<2?1:1-ease((t-2)/2),
  tension:(t,u)=>t<1?.3+.6*ease(t):t<2?1:.35+.55*(1-ease((t-2)/2)),
  build(svg){el(svg,'line',{x1:20,y1:178,x2:280,y2:178,stroke:'#3a3f47','stroke-width':2});
   el(svg,'rect',{x:30,y:60,width:34,height:80,rx:6,fill:'#3a3f47'});el(svg,'rect',{x:34,y:64,width:26,height:10,rx:3,fill:'#4a505a'});
   el(svg,'rect',{x:190,y:140,width:48,height:10,rx:5,fill:'#4a505a'});el(svg,'rect',{x:210,y:150,width:6,height:28,fill:'#3a3f47'});
   el(svg,'rect',{x:176,y:58,width:8,height:60,rx:4,fill:'#4a505a'});el(svg,'rect',{x:108,y:164,width:50,height:8,rx:4,fill:'#3a3f47'});
   const o={};o.cable=el(svg,'line',{x1:64,y1:100,x2:140,y2:88,stroke:'#7c8490','stroke-width':2});
   o.legT=limb(svg,9,'#9aa2ad');o.legS=limb(svg,9,'#9aa2ad');o.torso=limb(svg,15,TR);
   o.glow=el(svg,'ellipse',{cx:212,cy:92,rx:9,ry:30,fill:'#ff6b57',opacity:.2,transform:'rotate(8 212 92)'});
   o.head=el(svg,'circle',{cx:208,cy:42,r:11,fill:TR});o.up=limb(svg,8);o.fore=limb(svg,7);o.hand=el(svg,'circle',{r:5,fill:'#cfd6e0'});
   const l=el(svg,'text',{x:228,y:16,fill:'#7c8490','font-size':10,'text-anchor':'middle'});l.textContent='Dorsal';
   return o},
  draw(o,u,tn){const S=[203,66],W=[138+u*54,88+u*4];const E=twoBone(S,W,34,32,-1);
   pts(o.torso,[[203,128],[203,66]]);pts(o.legT,[[203,128],[160,128]]);pts(o.legS,[[160,128],[148,164]]);pts(o.up,[S,E]);pts(o.fore,[E,W]);
   o.hand.setAttribute('cx',W[0]);o.hand.setAttribute('cy',W[1]);o.cable.setAttribute('x2',W[0]);o.cable.setAttribute('y2',W[1]);o.glow.setAttribute('opacity',tn.toFixed(2))}},
 // ===== Patrones nuevos =====
 fly:mk('up',['CIERRA','APRIETA','ABRE'],['Junta los brazos al frente, 1 s','Aprieta el pecho 1 s','Vuelve lento, 2 s · estira el pecho'],{
   build(svg){const o={};topFig(svg,o,true);return o},draw(o,u,tn){topArms(o,78-u*100);o.gl.setAttribute('opacity',tn.toFixed(2));o.gr.setAttribute('opacity',tn.toFixed(2))}}),
 rearfly:mk('up',['ABRE','APRIETA','VUELVE'],['Abre los brazos hacia atrás, 1 s','Junta omóplatos 1 s','Vuelve lento, 2 s'],{
   build(svg){const o={};topFig(svg,o,false);return o},draw(o,u,tn){topArms(o,-22+u*118);o.gl.setAttribute('opacity',tn.toFixed(2));o.gr.setAttribute('opacity',tn.toFixed(2))}}),
 lateral:mk('up',['SUBE','APRIETA','BAJA'],['Eleva hasta la altura del hombro, 1 s','Codos algo por encima de las manos','Baja lento, 2 s'],{
   build(svg){const o={};frontFig(svg,o);label(svg,'Vista de frente',62);o.dl=dumbbell(svg);o.dr=dumbbell(svg);return o},
   draw(o,u,tn){const al=(6+u*76)*D2R,S=[122,58],d=[-Math.sin(al),Math.cos(al)],W=[S[0]+d[0]*62,S[1]+d[1]*62],M=[S[0]+d[0]*31,S[1]+d[1]*31],E=[M[0]-Math.cos(al)*5,M[1]-Math.sin(al)*5];
     frontArms(o,S,E,W);place(o.dl,W[0],W[1]);place(o.dr,300-W[0],W[1]);o.gl.setAttribute('opacity',tn.toFixed(2));o.gr.setAttribute('opacity',tn.toFixed(2))}}),
 shpress:mk('down',['BAJA','PAUSA','EMPUJA'],['Baja controlado hasta la altura de las orejas','1 s sin rebotar','Empuja arriba sin bloquear los codos'],{
   build(svg){const o={};frontFig(svg,o);label(svg,'Vista de frente',62);return o},
   draw(o,u,tn){const S=[122,58],W=[120-u*16,-4+u*58],E=pick(S,W,36,34,minX);frontArms(o,S,E,W);o.gl.setAttribute('opacity',tn.toFixed(2));o.gr.setAttribute('opacity',tn.toFixed(2))}}),
 curl:mk('up',['SUBE','APRIETA','BAJA'],['Sube sin balancear, codo pegado, 1 s','Aprieta el bíceps 1 s','Baja lento, 2 s · extiende casi del todo'],{
   build(svg){const o={};ground(svg);sideFig(svg,o);o.bar=BAR(svg);return o},
   draw(o,u,tn){const H=[150,98],S=[150,50],E=add(S,2,30),W=pol(E,28,90-(8+u*138));leg(o,H,[152,138],A0);body(o,H,S);arm(o,S,E,W);mv(o.bar,W);glowSeg(o,S,E,-7,6,tn)}}),
 preacher:mk('up',['SUBE','APRIETA','BAJA'],['Sube sin despegar el brazo del banco, 1 s','Aprieta 1 s','Baja lento, 2 s · extiende casi del todo'],{
   build(svg){const o={};ground(svg);el(svg,'rect',{x:104,y:126,width:56,height:8,rx:4,fill:'#4a505a'});el(svg,'rect',{x:128,y:134,width:6,height:42,fill:'#3a3f47'});ln(svg,[140,92],[170,130],16,'#4a505a');sideFig(svg,o);o.bar=BAR(svg);return o},
   draw(o,u,tn){const H=[120,124],S=[128,78],E=add(S,16,25),W=pol(E,28,56-(8+u*130));leg(o,H,[152,124],[152,172]);body(o,H,S);arm(o,S,E,W);mv(o.bar,W);glowSeg(o,S,E,-7,6,tn)}}),
 pushdown:mk('up',['EMPUJA','APRIETA','SUBE'],['Estira los codos hacia abajo, 1 s','Aprieta el tríceps 1 s','Sube lento, 2 s · codo pegado al cuerpo'],{
   build(svg){const o={};ground(svg);el(svg,'circle',{cx:196,cy:-4,r:5,fill:'#7c8490'});o.cable=ln(svg,[196,-4],[190,40],2,'#7c8490');sideFig(svg,o);o.bar=BAR(svg);return o},
   draw(o,u,tn){const H=[150,98],S=[150,50],E=add(S,6,28),W=pol(E,28,-10+u*98);leg(o,H,[152,138],A0);body(o,H,S);arm(o,S,E,W);mv(o.bar,W);setLine(o.cable,[196,-4],W);glowSeg(o,S,E,7,6,tn)}}),
 overhead:mk('up',['EXTIENDE','APRIETA','VUELVE'],['Estira los brazos arriba, 1 s','Aprieta el tríceps 1 s','Baja lento, 2 s · codos fijos'],{
   build(svg){const o={};ground(svg);sideFig(svg,o);o.bar=BAR(svg);return o},
   draw(o,u,tn){const H=[150,98],S=[150,50],E=add(S,8,-26),W=pol(E,24,150+130*u);leg(o,H,[152,138],A0);body(o,H,S);arm(o,S,E,W);mv(o.bar,W);glowSeg(o,S,E,-7,6,tn)}}),
 pulldown:pulldownBack('neutro'), pulldownS:pulldownBack('supino'), pulldownW:pulldownBack('ancho'),
 bentrow:mk('up',['TIRA','APRIETA','BAJA'],['Lleva los codos atrás, barra al abdomen, 1 s','Junta omóplatos 1 s','Baja lento, 2 s · espalda recta'],{
   build(svg){const o={};ground(svg);sideFig(svg,o);o.bar=BAR(svg);return o},
   draw(o,u,tn){const H=[140,98],S=[176,64],W=[176-6*u,122-32*u],E=pick(S,W,30,28,minX);leg(o,H,[156,138],[142,176]);body(o,H,S,12);arm(o,S,E,W);mv(o.bar,W);glowSeg(o,H,S,-8,8,tn)}}),
 pullover:mk('up',['TIRA','APRIETA','VUELVE'],['Brazos casi rectos hasta los muslos, 1 s','Aprieta dorsales y serrato 1 s','Sube lento, 2 s'],{
   build(svg){const o={};ground(svg);el(svg,'circle',{cx:205,cy:-6,r:5,fill:'#7c8490'});o.cable=ln(svg,[205,-6],[190,20],2,'#7c8490');sideFig(svg,o);o.bar=BAR(svg);return o},
   draw(o,u,tn){const H=[150,98],S=[157,50],ps=(150-125*u)*D2R,W=[S[0]+62*Math.sin(ps),S[1]+62*Math.cos(ps)],M=[(S[0]+W[0])/2+3,(S[1]+W[1])/2],E=M;leg(o,H,[152,138],A0);body(o,H,S);arm(o,S,E,W);mv(o.bar,W);setLine(o.cable,[205,-6],W);glowSeg(o,H,S,-9,8,tn)}}),
 squat:mk('down',['BAJA','PAUSA','SUBE'],['Baja controlado, rodillas hacia los pies, 2 s','1 s abajo sin rebotar','Empuja el suelo con todo el pie'],{
   build(svg){const o={};ground(svg);sideFig(svg,o,true);o.bar=BAR(svg);return o},
   draw(o,u,tn){const H=[150-26*u,98+36*u],K=pick(H,A0,40,38,maxX),th=u*42*D2R,S=[H[0]+48*Math.sin(th),H[1]-48*Math.cos(th)];leg(o,H,K,A0);body(o,H,S);mv(o.bar,add(S,-3,-3));glowSeg(o,H,K,-7,7,tn)}}),
 lunge:mk('down',['BAJA','PAUSA','SUBE'],['Baja en vertical, rodilla trasera al suelo, 2 s','1 s abajo','Empuja con el talón delantero'],{
   build(svg){const o={};ground(svg);sideFig(svg,o);o.leg2T=limb(svg,10,'#7c8490');o.leg2S=limb(svg,9,'#7c8490');o.bar=BAR(svg);return o},
   draw(o,u,tn){const H=[148,104+34*u],A1=[178,176],A2=[112,176],K1=pick(H,A1,40,38,maxX),K2=pick(H,A2,40,38,maxY),S=add(H,0,-48);
     leg(o,H,K1,A1);pts(o.leg2T,[H,K2]);pts(o.leg2S,[K2,A2]);body(o,H,S);const W=add(S,3,52);arm(o,S,add(S,2,26),W);mv(o.bar,W);glowSeg(o,H,K1,-7,7,tn)}}),
 hinge:mk('down',['BAJA','PAUSA','SUBE'],['Lleva la cadera atrás, barra pegada a las piernas, 2 s','1 s notando el estiramiento','Empuja la cadera adelante'],{
   build(svg){const o={};ground(svg);sideFig(svg,o);o.bar=BAR(svg);return o},
   draw(o,u,tn){const H=[150-22*u,98+4*u],K=[152,136],th=u*68*D2R,S=[H[0]+48*Math.sin(th),H[1]-48*Math.cos(th)],W=add(S,4,56);leg(o,H,K,A0);body(o,H,S);arm(o,S,add(S,3,28),W);mv(o.bar,W);glowSeg(o,H,K,7,7,tn)}}),
 legpress:mk('down',['BAJA','PAUSA','EMPUJA'],['Dobla las rodillas hasta unos 90°, 2 s','1 s sin despegar la espalda','Empuja con todo el pie, sin bloquear'],{
   build(svg){const o={};ground(svg);ln(svg,[88,138],[52,86],8,'#4a505a');ln(svg,[120,160],[248,48],2,'#3a3f47');sideFig(svg,o,true);o.plat=ln(svg,[0,0],[0,0],8,'#9aa2ad');return o},
   draw(o,u,tn){const H=[100,128],S=[66,94],L=76-46*u,A=[H[0]+L*.77,H[1]-L*.64],K=pick(H,A,40,38,minY);leg(o,H,K,A);pts(o.foot,[A,A]);body(o,H,S);setLine(o.plat,add(A,-9,-11),add(A,9,11));glowSeg(o,H,K,-7,7,tn)}}),
 legext:mk('up',['EXTIENDE','APRIETA','BAJA'],['Estira las rodillas, 1 s','Aprieta el cuádriceps 1 s','Baja lento, 2 s'],{
   build(svg){const o={};ground(svg);el(svg,'rect',{x:108,y:124,width:76,height:8,rx:4,fill:'#4a505a'});el(svg,'rect',{x:144,y:132,width:8,height:44,fill:'#3a3f47'});ln(svg,[112,126],[104,62],8,'#4a505a');sideFig(svg,o,true);o.pad=BAR(svg);return o},
   draw(o,u,tn){const H=[130,118],K=[172,118],S=[124,70],A=pol(K,38,88-82*u);pts(o.legT,[H,K]);pts(o.legS,[K,A]);pts(o.foot,[A,A]);body(o,H,S);mv(o.pad,A);glowSeg(o,H,K,-7,6,tn)}}),
 legcurl:mk('up',['FLEXIONA','APRIETA','VUELVE'],['Lleva los talones hacia abajo y atrás, 1 s','Aprieta el femoral 1 s','Vuelve lento, 2 s'],{
   build(svg){const o={};ground(svg);el(svg,'rect',{x:108,y:124,width:76,height:8,rx:4,fill:'#4a505a'});el(svg,'rect',{x:144,y:132,width:8,height:44,fill:'#3a3f47'});ln(svg,[112,126],[104,62],8,'#4a505a');sideFig(svg,o,true);o.pad=BAR(svg);return o},
   draw(o,u,tn){const H=[130,118],K=[172,118],S=[124,70],A=pol(K,38,90-(84-109*u));pts(o.legT,[H,K]);pts(o.legS,[K,A]);pts(o.foot,[A,A]);body(o,H,S);mv(o.pad,A);glowSeg(o,H,K,7,6,tn)}}),
 crunch:mk('up',['CONTRAE','APRIETA','VUELVE'],['Enrolla el tronco llevando costillas a cadera, 1 s','Aprieta el abdomen 1 s','Vuelve lento, 2 s'],{
   build(svg){const o={};ground(svg);el(svg,'rect',{x:110,y:134,width:96,height:8,rx:4,fill:'#4a505a'});el(svg,'rect',{x:150,y:142,width:8,height:34,fill:'#3a3f47'});sideFig(svg,o);return o},
   draw(o,u,tn){const H=[140,128],th=(-8+46*u)*D2R,S=[H[0]+48*Math.sin(th),H[1]-48*Math.cos(th)];leg(o,H,[190,124],[190,172]);body(o,H,S);arm(o,add(S,0,6),add(S,14,20),add(S,24,10));glowSeg(o,H,S,8,8,tn)}}),
 legraise:mk('up',['SUBE','APRIETA','BAJA'],['Sube las piernas sin balancear, 1 s','Aprieta el abdomen bajo 1 s','Baja lento, 2 s sin apoyar del todo'],{
   build(svg){const o={};ground(svg);el(svg,'rect',{x:34,y:156,width:116,height:8,rx:4,fill:'#4a505a'});el(svg,'rect',{x:44,y:164,width:6,height:12,fill:'#3a3f47'});el(svg,'rect',{x:134,y:164,width:6,height:12,fill:'#3a3f47'});sideFig(svg,o,true);return o},
   draw(o,u,tn){const H=[128,150],S=[64,150],f=(8+80*u)*D2R,K=[H[0]+40*Math.cos(f),H[1]-40*Math.sin(f)],A=[H[0]+78*Math.cos(f),H[1]-78*Math.sin(f)];pts(o.legT,[H,K]);pts(o.legS,[K,A]);pts(o.foot,[A,A]);body(o,H,S,15);glowSeg(o,S,H,-3,7,tn,.25)}}),
 plank:{vb:SV,cycle:4,phases:[[0,2,'AGUANTA','Cuerpo en línea recta, aprieta abdomen y glúteo'],[2,4,'RESPIRA','Sin hundir la cadera ni subirla']],u:t=>1,tension:t=>.75+.15*Math.sin(t*Math.PI/2*2),
   build(svg){const o={};ground(svg);label(svg,'Isométrico: aguanta el tiempo');sideFig(svg,o);return o},
   draw(o,u,tn){const br=Math.sin(tn*10)*0;const A=[48,170],S=[196,150],H=[122,160],E=[196,172],W=[230,172];leg(o,H,[85,165],A);pts(o.foot,[add(A,-3,0),add(A,10,0)]);body(o,H,S,15);arm(o,S,E,W);glowSeg(o,H,S,-3,7,tn,.3)}},
};
 const RUN=[];
 function start(key,svg,ph,tp){
   const A=ANIMS[key];if(!A)return function(){};svg.innerHTML='';svg.setAttribute('viewBox',A.vb);const o=A.build(svg);
   tp.innerHTML=A.phases.map(p=>`<i style="flex:${p[1]-p[0]}"><em></em></i>`).join('');
   let stop=false;const t0=performance.now();const freeze=(typeof window!=='undefined'&&window.FEEL_FREEZE!=null)?Number(window.FEEL_FREEZE):null;
   (function frame(now){
     if(stop||!svg.isConnected)return;
     const t=freeze!==null?freeze:((now-t0)/1000)%A.cycle;const u=A.u(t),tn=A.tension(t,u);A.draw(o,u,tn);
     const idx=A.phases.findIndex(p=>t>=p[0]&&t<p[1]);const p=A.phases[idx<0?0:idx];ph.innerHTML=`<b>${p[2]}</b><span>${p[3]}</span>`;
     [...tp.children].forEach((c,k)=>{const q=A.phases[k];c.firstChild.style.transform='scaleX('+Math.max(0,Math.min(1,(t-q[0])/(q[1]-q[0])))+')'});
     if(freeze===null)requestAnimationFrame(frame);
   })(performance.now());
   return function(){stop=true};
 }
 return {has:k=>!!ANIMS[k],keys:()=>Object.keys(ANIMS),start:start};
})();
