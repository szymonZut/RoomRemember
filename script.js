// ===== SETTINGS =====

const REQ_START=0.45;    // round 1: need 35% of the max tile points
const REQ_STEP=0.06;     // the share grows by 3 percentage points every round
const REQ_MAX=0.90;      // ...up to 85%
const START_SIZE=6;      // room starts at 5x5
const GROW_EVERY=3;      // room grows every 3 rounds
const GROW_BY=1;         // by this many tiles (width and height)
const MAX_SIZE=10;       // biggest possible room
const TILE_POINTS=10;    // perfect tile
const NEAR_POINTS=5;     // 1 tile off
const PERFECT_BONUS=10;  // every item perfect = bonus
const KEY="roomgame_lb_v3";

const BIG=[
  {name:"Bed",emoji:"🛏️",w:3,h:2,color:"#c9b6e4"},
  {name:"Wardrobe",emoji:"🧥",w:2,h:1,color:"#c8a77a"},
  {name:"Table",emoji:"🍽️",w:2,h:2,color:"#e0b878"},
  {name:"Sofa",emoji:"🛋️",w:3,h:1,color:"#9fc5d8"},
  {name:"Bookshelf",emoji:"📚",w:1,h:2,color:"#b5c99a"},
  {name:"Desk",emoji:"🖥️",w:2,h:1,color:"#d9b99b"},
  {name:"Fridge",emoji:"🧊",w:1,h:2,color:"#bcd7e6"},
  {name:"Piano",emoji:"🎹",w:2,h:1,color:"#b8b8c8"}
];
const SMALL=[
  {name:"Lamp",emoji:"💡"},{name:"Plant",emoji:"🪴"},{name:"Laptop",emoji:"💻"},
  {name:"Mug",emoji:"☕"},{name:"Book",emoji:"📖"},{name:"TV",emoji:"📺"},
  {name:"Clock",emoji:"🕰️"},{name:"Phone",emoji:"📱"},{name:"Flowers",emoji:"💐"},{name:"Guitar",emoji:"🎸"}
];

const $=id=>document.getElementById(id);
const board=$("board");
const rnd=n=>Math.floor(Math.random()*n);
const shuffle=a=>[...a].sort(()=>Math.random()-.5);
const overlap=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;

// current geometry: room W x H, shelf SH rows below it, ROWS = H + SH
let W=START_SIZE,H=START_SIZE,SH=3,ROWS=H+SH,trayPos={};
const pctX=v=>v*100/W+"%", pctY=v=>v*100/ROWS+"%";

let nick="",round=0,score=0,goalBase=0,goalPts=0,passed=false,room=[],cur={},verdict={},phase="idle",timer=null,introT=null,t0=0,dur=0;

const roomSize=r=>Math.min(MAX_SIZE,START_SIZE+Math.floor((r-1)/GROW_EVERY)*GROW_BY);

// ---- local leaderboard
function lbGet(){try{return JSON.parse(localStorage.getItem(KEY))||[]}catch(e){return[]}}
function lbRender(hl){
  const l=lbGet();
  const h=l.length?`<table><tr><th>#</th><th>Player</th><th>Round</th><th>Pts</th></tr>${l.map((r,i)=>`<tr class="${hl&&r.t===hl?"me":""}"><td>${i+1}</td><td>${String(r.n).replace(/[<>&]/g,"")}</td><td>${r.r||"-"}</td><td>${r.s}</td></tr>`).join("")}</table>`:`<p class="empty">No scores yet – be the first!</p>`;
  document.querySelectorAll(".lb").forEach(e=>e.innerHTML=h);
}

// ---- board geometry
function setCell(){
  board.style.setProperty("--cell",board.clientWidth/W+"px"); // one tile
  board.style.setProperty("--u",board.clientWidth/10+"px");   // unit for big texts
}
function applyGeom(){
  ROWS=H+SH;
  board.style.setProperty("--cols",W);
  board.style.setProperty("--rows",ROWS);
  board.style.setProperty("--roomh",H);
  board.style.setProperty("--shelf",SH);
  board.style.setProperty("--ar",(W/ROWS).toFixed(4));
  setCell();
}
new ResizeObserver(setCell).observe(board);

// ---- room generation
function genRoom(r){
  const n=Math.min(r+3,14);
  let nb=Math.ceil(n/2),tries=0,bigs,ok;
  do{
    ok=true;
    if(++tries>80&&nb>1)nb--;   // safety: too many items for the room
    bigs=shuffle(BIG).slice(0,nb).map((d,i)=>({...d,id:"b"+i,small:false}));
    const placed=[];
    for(const it of bigs){
      let done=false;
      for(let t=0;t<300&&!done;t++){
        it.x=rnd(W-it.w+1);it.y=rnd(H-it.h+1);
        if(!placed.some(p=>overlap(it,p))){placed.push(it);done=true}
      }
      if(!done)ok=false;
    }
  }while(!ok);
  const smalls=shuffle(SMALL).slice(0,n-nb).map((d,i)=>({...d,id:"s"+i,small:true,w:1,h:1}));
  smalls.forEach(s=>{
    for(let t=0;t<300;t++){
      if(Math.random()<.5){const b=bigs[rnd(bigs.length)];s.x=b.x+rnd(b.w);s.y=b.y+rnd(b.h)}
      else{s.x=rnd(W);s.y=rnd(H)}
      if(!smalls.some(o=>o!==s&&o.done&&o.x===s.x&&o.y===s.y)){s.done=true;break}
    }
  });
  return [...bigs,...smalls];
}

// ---- starting layout on the shelf (rows H .. H+sh-1); null if it doesn't fit
function packTray(items,sh){
  const occ=new Set(),out={};
  for(const it of [...items].sort((a,b)=>b.w*b.h-a.w*a.h)){
    let placed=false;
    for(let y=H;y<=H+sh-it.h&&!placed;y++)for(let x=0;x<=W-it.w&&!placed;x++){
      let free=true;
      for(let i=0;i<it.w;i++)for(let j=0;j<it.h;j++)if(occ.has((x+i)+","+(y+j)))free=false;
      if(free){
        for(let i=0;i<it.w;i++)for(let j=0;j<it.h;j++)occ.add((x+i)+","+(y+j));
        out[it.id]={x,y};placed=true;
      }
    }
    if(!placed)return null;
  }
  return out;
}

// ---- drawing
function el(it,pos,cls){
  const d=document.createElement("div");
  d.className="it "+(it.small?"sm":"bg")+(cls?" "+cls:"");
  d.style.left=pctX(pos.x);d.style.top=pctY(pos.y);
  d.style.width=pctX(it.w);d.style.height=pctY(it.h);
  if(!it.small)d.style.background=it.color;
  const f=it.small?.7:Math.min(it.w,it.h)*.6;
  d.title=it.name;
  d.innerHTML=`<span class="em" style="font-size:calc(var(--cell) * ${f})">${it.emoji}</span>`+(it.small?"":`<span class="lb">${it.name}</span>`);
  return d;
}
function render(mode){
  setCell();
  board.querySelectorAll(".it,.pt").forEach(e=>e.remove());
  room.forEach((it,i)=>{
    if(mode==="show"){
      const d=el(it,it,"enter");d.style.setProperty("--i",i);
      d.addEventListener("animationend",()=>d.classList.remove("enter"),{once:true});
      board.appendChild(d);return;
    }
    const d=el(it,cur[it.id],mode==="result"?verdict[it.id].cls:(mode==="build"?"enter":""));
    d.style.setProperty("--i",i);
    if(mode==="build"){
      d.addEventListener("animationend",()=>d.classList.remove("enter"),{once:true});
      bind(d,it);
    }
    board.appendChild(d);
    if(mode==="result"&&verdict[it.id].cls!=="ok")board.appendChild(el(it,it,"ghost"));
  });
}

// ---- dragging with grid snap + swing + drop preview
function bind(d,it){
  d.addEventListener("pointerdown",e=>{
    if(phase!=="build")return;
    e.preventDefault();d.setPointerCapture(e.pointerId);
    const cx=board.clientWidth/W,cy=board.clientHeight/ROWS,sx=e.clientX,sy=e.clientY,o={...cur[it.id]};
    let px=e.clientX,tx=0,ty=0,ang=0,av=0,raf=0;
    let sc=1,sv=0;
    const LIFT=1.12;
    d.classList.remove("enter","settle");
    d.classList.add("drag","fromshelf");
    d.style.transformOrigin="50% 20%";

    // target tile after snapping + whether it is free
    const target=ev=>{
      let x=Math.round(o.x+(ev.clientX-sx)/cx),y=Math.round(o.y+(ev.clientY-sy)/cy);
      x=Math.max(0,Math.min(W-it.w,x));y=Math.max(0,Math.min(ROWS-it.h,y));
      const np={x,y,w:it.w,h:it.h};
      // big items can't overlap big items, small can't overlap small
      const clash=room.some(o2=>o2!==it&&o2.small===it.small&&overlap(np,{...cur[o2.id],w:o2.w,h:o2.h}));
      return {x,y,clash};
    };

    // drop preview
    const pv=document.createElement("div");
    pv.className="drop";
    pv.style.width=pctX(it.w);pv.style.height=pctY(it.h);
    board.appendChild(pv);
    const showPv=ev=>{
      const t=target(ev);
      pv.style.left=pctX(t.x);pv.style.top=pctY(t.y);
      pv.classList.toggle("bad",t.clash);
    };
    showPv(e);

    const loop=()=>{
      av+=-ang*0.05;
      av*=0.6;
      ang=Math.max(-30,Math.min(30,ang+av));
      sv+=(LIFT-sc)*0.22;
      sv*=0.72;
      sc+=sv;
      d.style.transform=`translate(${tx}px,${ty}px) rotate(${ang}deg) scale(${sc})`;
      raf=requestAnimationFrame(loop);
    };
    raf=requestAnimationFrame(loop);

    const mv=ev=>{
      tx=ev.clientX-sx;ty=ev.clientY-sy;
      av+=(ev.clientX-px)*0.22;
      px=ev.clientX;
      showPv(ev);
    };
    const up=ev=>{
      cancelAnimationFrame(raf);
      pv.remove();
      d.removeEventListener("pointermove",mv);
      d.removeEventListener("pointerup",up);
      d.removeEventListener("pointercancel",up);
      d.classList.remove("drag","fromshelf");d.style.transform="";d.style.transformOrigin="";
      const t=target(ev);
      if(!t.clash)cur[it.id]={x:t.x,y:t.y};
      d.style.left=pctX(cur[it.id].x);d.style.top=pctY(cur[it.id].y);
      d.classList.add("settle");
      d.addEventListener("animationend",()=>d.classList.remove("settle"),{once:true});
    };
    d.addEventListener("pointermove",mv);
    d.addEventListener("pointerup",up);
    d.addEventListener("pointercancel",up);
  });
}

// ---- game phases
function setPhase(p,label,btn,msg,dis){
  phase=p;board.dataset.phase=p;
  $("phase").textContent=label;$("act").textContent=btn;$("msg").textContent=msg;
  $("act").disabled=!!dis;
}
function resetFx(){
  board.style.setProperty("--danger",0);
  $("fill").style.background="";
  ["banner","perfect"].forEach(id=>$(id).classList.remove("show"));
}

// 1) intro: "Memorize the room layout" + countdown
function startRound(){
  const size=roomSize(round),prev=round>1?roomSize(round-1):size;
  W=H=size;
  room=genRoom(round);cur={};verdict={};
  // shelf gets as many rows as needed to hold every item
  let sh=2,tp=null;
  for(;sh<=8;sh++){tp=packTray(room,sh);if(tp)break}
  if(!tp){sh=8;tp=packTray(room,8)||{}}
  trayPos=tp;SH=sh;
  applyGeom();

  clearInterval(timer);clearInterval(introT);
  board.querySelectorAll(".it,.pt").forEach(e=>e.remove());
  $("fill").style.width="0";
  resetFx();
  const pct=Math.min(REQ_MAX,REQ_START+(round-1)*REQ_STEP);
  goalPts=goalBase+Math.ceil(room.length*TILE_POINTS*pct);
  $("goal").textContent=goalPts;$("goalw").classList.remove("met");
  $("irn").textContent=`Round ${round} • Room ${W}×${H}`;
  $("igoal").textContent=`🎯 Goal: ${goalPts} pts total`;
  $("igrow").textContent=size>prev?"📈 The room just got bigger!":"";
  $("intro").classList.remove("out");
  setPhase("intro","Get ready…","Get ready…","",true);
  let n=4;$("cd").innerHTML=`<span>${n}</span>`;   // countdown start (4) and speed (800 ms)
  introT=setInterval(()=>{
    n--;
    if(n>0){$("cd").innerHTML=`<span>${n}</span>`;return}
    clearInterval(introT);beginShow();
  },800);
}

// 2) the room appears
function beginShow(){
  $("intro").classList.add("out");
  render("show");
  setPhase("show","👀 Memorize!","I'm ready ▶","Remember what stands where, including items on furniture.");
  dur=(4+2*room.length)*1000;t0=Date.now();
  $("fill").style.width="100%";
  timer=setInterval(()=>{
    const left=dur-(Date.now()-t0),r=Math.max(0,left/dur);
    $("fill").style.width=(r*100)+"%";
    // green → yellow → orange → red
    $("fill").style.background=`hsl(${Math.round(120*r)} 75% 44%)`;
    // red glow outside the board in the last seconds
    const th=Math.min(5000,dur*0.35);
    const k=left<th?Math.min(1,1-left/th):0;
    board.style.setProperty("--danger",k.toFixed(2));
    if(left<=0)startBuild();
  },100);
}

// 3) room disappears, items land on the shelf
function startBuild(){
  if(phase!=="show")return;
  clearInterval(timer);$("fill").style.width="0";
  board.style.setProperty("--danger",0);$("fill").style.background="";
  setPhase("trans","…","…","",true);
  board.querySelectorAll(".it").forEach((e,i)=>{e.style.setProperty("--i",i);e.classList.add("leave")});
  setTimeout(()=>{
    cur={...trayPos};
    render("build");
    setPhase("build","🧩 Rebuild!","Check ✔","Drag items from the shelf and rebuild the room from memory.");
    const bn=$("banner");bn.classList.remove("show");void bn.offsetWidth;bn.classList.add("show");
  },450);
}

// 4) results with point badges + perfect bonus
function bump(){const s=$("sc");s.classList.remove("bump");void s.offsetWidth;s.classList.add("bump")}
function check(){
  let pts=0,allOk=true;
  room.forEach(it=>{
    const p=cur[it.id];let cls="bad",v=0;
    if(p.y<H){
      const d=Math.max(Math.abs(p.x-it.x),Math.abs(p.y-it.y));
      if(d===0){cls="ok";v=TILE_POINTS}else if(d===1){cls="near";v=NEAR_POINTS}
    }
    if(cls!=="ok")allOk=false;
    verdict[it.id]={cls,v};pts+=v;
  });
  const bonus=allOk?PERFECT_BONUS:0;
  let shown=score;
  score+=pts+bonus;
  render("result");
  // badge next to every item + counter ticking up item by item
  room.forEach((it,i)=>{
    const v=verdict[it.id],p=cur[it.id],b=document.createElement("div");
    b.className="pt "+v.cls;
    b.textContent=v.v?"+"+v.v:"0";
    b.style.left=pctX(p.x+it.w);b.style.top=pctY(p.y);
    b.style.setProperty("--i",i);
    board.appendChild(b);
    setTimeout(()=>{shown+=v.v;$("sc").textContent=shown;if(v.v)bump()},i*220+300);
  });
  const tEnd=room.length*220+300;
  if(allOk){
    setTimeout(()=>{
      const pf=$("perfect");
      pf.innerHTML=`PERFECT ROOM!<br>+${PERFECT_BONUS}`;
      pf.classList.remove("show");void pf.offsetWidth;pf.classList.add("show");
      shown+=bonus;$("sc").textContent=shown;bump();
    },tEnd+100);
  }
  passed=score>=goalPts;
  if(passed)goalBase=goalPts;
  setPhase("result","📋 Results",passed?"Next round →":"Game over 🏁",
    `Round ${round}: ${pts} / ${room.length*TILE_POINTS} pts`+
    (allOk?` + ${PERFECT_BONUS} perfect room bonus! 🌟`:"")+
    (passed?` • Goal reached (${score}/${goalPts}) ✅`:` • Goal missed (${score}/${goalPts}) ❌`)+
    ` Green = perfect, yellow = 1 tile off, red = miss.`,true);
  // unlock the button after the point badges finish animating
  setTimeout(()=>{$("act").disabled=false;$("sc").textContent=score;$("goalw").classList.toggle("met",passed)},tEnd+(allOk?1700:400));
}


function nextRound(){round++;$("rn").textContent=round;startRound()}
function start(){
  nick=$("nick").value.trim();
  if(!nick){$("nick").focus();$("nick").style.borderColor="var(--bad)";return}
  round=0;score=0;goalBase=0;goalPts=0;$("sc").textContent=0;
  $("o-start").classList.add("hide");$("o-end").classList.add("hide");
  nextRound();
}
function finish(){
  const t=Date.now();
  try{const l=lbGet();l.push({n:nick,s:score,r:round,t});l.sort((a,b)=>b.s-a.s||a.t-b.t);localStorage.setItem(KEY,JSON.stringify(l.slice(0,10)))}catch(e){}
  $("en").textContent=nick;$("fs").textContent=score;
  $("fm").innerHTML=`You reached round <b>${round}</b> 🏁<br>`+(round>=12?"Photographic memory! 📸":round>=7?"Nice memory! 🧠":"Keep practicing, you'll get better 🐢");
  lbRender(t);$("o-end").classList.remove("hide");
}

// ---- events
$("act").onclick=()=>{
  if(phase==="show")startBuild();
  else if(phase==="build")check();
  else if(phase==="result")passed?nextRound():finish();
};
$("go").onclick=start;
$("nick").onkeydown=e=>{if(e.key==="Enter")start()};
$("again").onclick=()=>{$("o-end").classList.add("hide");lbRender();$("o-start").classList.remove("hide")};

// ---- init
$("rules").innerHTML=`Endless: reach the point goal after every round to keep going. The goal grows each round.<br>The room grows every ${GROW_EVERY} rounds (starts at ${START_SIZE}×${START_SIZE})<br>perfect tile = ${TILE_POINTS} pts • 1 tile off = ${NEAR_POINTS} pts • perfect room = +${PERFECT_BONUS} bonus<br>Small items can be placed on furniture.`;
applyGeom();
lbRender();