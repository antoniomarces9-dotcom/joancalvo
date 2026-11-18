const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,rooms={};let mid=0;
const server=http.createServer((q,s)=>{if(q.url==='/health')return s.end('ok');
  s.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});s.end(fs.readFileSync(path.join(__dirname,'public','index.html')))});
server.on('upgrade',(q,sock)=>{const k=q.headers['sec-websocket-key'];if(!k)return sock.destroy();
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+
  crypto.createHash('sha1').update(k+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')+'\r\n\r\n');
  sock.buf=Buffer.alloc(0);sock.on('data',c=>onData(sock,c));sock.on('close',()=>drop(sock));sock.on('error',()=>sock.destroy())});
function enc(s){const b=Buffer.from(s),n=b.length;let h;
  if(n<126)h=Buffer.from([0x81,n]);else{h=Buffer.alloc(4);h[0]=0x81;h[1]=126;h.writeUInt16BE(n,2)}return Buffer.concat([h,b])}
function send(s,o){if(s&&!s.destroyed)s.write(enc(JSON.stringify(o)))}
function onData(sock,c){sock.buf=Buffer.concat([sock.buf,c]);if(sock.buf.length>1e5)return sock.destroy();
  while(sock.buf.length>=2){const b=sock.buf,op=b[0]&15;let len=b[1]&127,off=2;
    if(len===126){if(b.length<4)return;len=b.readUInt16BE(2);off=4}else if(len===127)return sock.destroy();
    const mk=b[1]&128?4:0;if(b.length<off+mk+len)return;
    let p=Buffer.from(b.slice(off+mk,off+mk+len));if(mk){const m=b.slice(off,off+4);for(let i=0;i<p.length;i++)p[i]^=m[i%4]}
    sock.buf=b.slice(off+mk+len);
    if(op===8)return sock.end();if(op===9){sock.write(Buffer.concat([Buffer.from([0x8A,p.length]),p]));continue}
    if(op===1){try{handle(sock,JSON.parse(p.toString()))}catch(e){}}}}
const clean=n=>String(n||'Blob').replace(/[<>&"]/g,'').slice(0,12)||'Blob';
function newP(sock,m){return{id:crypto.randomBytes(8).toString('hex'),sock,n:clean(m.n),k:(m.k|0)%6,ready:0,rm:0,sc:0,x:0,y:0,vx:0,vy:0,cd:0,dashT:0,heavy:0,slow:0,in:{x:0,y:0,d:0}}}
function handle(sock,m){
  if(m.t==='ping')return send(sock,{t:'pong',c:m.c});
  if(m.t==='create'){let c;do{c=Array.from({length:5},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random()*24|0]).join('')}while(rooms[c]);
    const r=rooms[c]={code:c,ph:'lobby',players:[],pu:[],ev:[],until:0,time:0,R:300,msg:'',winner:-1,mid:0};
    const p=newP(sock,m);r.players.push(p);sock.p=p;sock.r=r;return send(sock,{t:'joined',code:c,you:0,tok:p.id})}
  if(m.t==='join'){const r=rooms[String(m.code||'').toUpperCase()];if(!r)return send(sock,{t:'err',m:'Esa sala no existe'});
    let i=r.players.findIndex(p=>p.id===m.tok);
    if(i>=0){r.players[i].sock=sock;r.players[i].dcAt=0}
    else if(r.players.length<2&&r.ph==='lobby'){r.players.push(newP(sock,m));i=1}
    else return send(sock,{t:'err',m:'La sala está llena'});
    sock.p=r.players[i];sock.r=r;return send(sock,{t:'joined',code:r.code,you:i,tok:sock.p.id})}
  const p=sock.p,r=sock.r;if(!p)return;
  if(m.t==='ready'&&r.ph==='lobby'){p.ready=1;if(r.players.length===2&&r.players.every(q=>q.ready))startMatch(r)}
  if(m.t==='rematch'&&r.ph==='over'){p.rm=1;if(r.players.every(q=>q.rm))startMatch(r)}
  if(m.t==='in'){let x=+m.x||0,y=+m.y||0;const l=Math.hypot(x,y);if(l>1){x/=l;y/=l}p.in.x=x;p.in.y=y;if(m.d)p.in.d=1}}
function drop(s){if(s.p&&s.p.sock===s){s.p.sock=null;s.p.dcAt=Date.now()}}
function startMatch(r){r.players.forEach(p=>{p.sc=0;p.rm=0});r.winner=-1;r.mid=++mid;startRound(r,'¡Que empiece la locura!')}
function startRound(r,msg){r.msg=msg;r.ph='count';r.until=Date.now()+3000;r.time=0;r.R=300;r.pu=[];r.nextPu=4;r.nextEv=9;r.wind=null;
  r.players.forEach((p,i)=>{p.x=i?130:-130;p.y=0;p.vx=p.vy=0;p.cd=0;p.heavy=p.slow=0;p.in={x:0,y:0,d:0}})}
const FUN=['¡Eso ha dolido!','Cae como un flan','¡Al vacío!','Rebote ridículo','Vuelo sin motor','¡Qué espectáculo!'];
function endRound(r,loser){const now=Date.now();
  if(loser>=0){const w=r.players[1-loser];w.sc++;r.msg=FUN[Math.random()*FUN.length|0]}else r.msg='¡Empate! Nadie puntúa';
  const w=r.players.findIndex(p=>p.sc>=3);
  if(w>=0){r.ph='over';r.winner=w;r.msg='¡'+r.players[w].n+' gana la partida!'}else{r.ph='between';r.until=now+2500}}
function step(r,dt){r.time+=dt;r.R=Math.max(100,300-r.time*7);const t=r.time;
  if(t>=r.nextEv){r.wind={a:Math.random()*6.28,u:t+4};r.nextEv=t+14+Math.random()*6;r.ev.push({k:'wind'})}
  if(r.wind&&t>r.wind.u)r.wind=null;
  if(t>=r.nextPu&&r.pu.length<2){const a=Math.random()*6.28,d=Math.random()*(r.R-60);
    r.pu.push({type:['heavy','wave','slow'][Math.random()*3|0],x:Math.cos(a)*d,y:Math.sin(a)*d});r.nextPu=t+5+Math.random()*3}
  r.players.forEach((p,i)=>{const o=r.players[1-i];let{x,y}=p.in;
    p.vx+=x*900*dt*(p.slow>t?.5:1);p.vy+=y*900*dt*(p.slow>t?.5:1);
    if(p.in.d&&t>=p.cd){let dx=x,dy=y;if(!dx&&!dy){dx=o.x-p.x;dy=o.y-p.y}const l=Math.hypot(dx,dy)||1;
      p.vx+=dx/l*700;p.vy+=dy/l*700;p.cd=t+1.6;p.dashT=t+.25;r.ev.push({k:'dash',i,x:p.x,y:p.y})}
    p.in.d=0;if(r.wind){p.vx+=Math.cos(r.wind.a)*160*dt;p.vy+=Math.sin(r.wind.a)*160*dt}
    const f=Math.pow(.05,dt);p.vx*=f;p.vy*=f;p.x+=p.vx*dt;p.y+=p.vy*dt});
  const[a,b]=r.players;let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||.01;
  if(d<44){const nx=dx/d,ny=dy/d,ov=(44-d)/2;a.x-=nx*ov;a.y-=ny*ov;b.x+=nx*ov;b.y+=ny*ov;
    const vr=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
    if(vr>0){const ma=a.heavy>t?2:1,mb=b.heavy>t?2:1;let j=2.2*vr/(1/ma+1/mb);if(a.dashT>t||b.dashT>t)j*=1.5;
      a.vx-=j/ma*nx;a.vy-=j/ma*ny;b.vx+=j/mb*nx;b.vy+=j/mb*ny;r.ev.push({k:'hit',x:(a.x+b.x)/2,y:(a.y+b.y)/2,s:Math.min(1,j/900)})}}
  r.players.forEach((p,i)=>{const o=r.players[1-i];
    r.pu=r.pu.filter(u=>{if(Math.hypot(u.x-p.x,u.y-p.y)>34)return true;
      if(u.type==='heavy')p.heavy=t+6;else if(u.type==='slow')o.slow=t+5;
      else{const dx=o.x-p.x,dy=o.y-p.y,l=Math.hypot(dx,dy)||1;o.vx+=dx/l*650;o.vy+=dy/l*650}
      r.ev.push({k:'pu',type:u.type,i,x:p.x,y:p.y});return false})});
  const out=r.players.map(p=>Math.hypot(p.x,p.y)>r.R+12);
  if(out[0]||out[1])endRound(r,out[0]&&out[1]?-1:out[0]?0:1)}
setInterval(()=>{const now=Date.now();
  for(const c in rooms){const r=rooms[c];
    if(r.players.length&&r.players.every(p=>!p.sock&&now-p.dcAt>3e5)){delete rooms[c];continue}
    const gone=r.players.findIndex(p=>!p.sock&&p.dcAt&&now-p.dcAt>20000);
    if(gone>=0&&['count','play','between'].includes(r.ph)){const w=1-gone;r.players[w].sc=3;r.ph='over';r.winner=w;r.msg='El rival se desconectó. ¡Ganas por abandono!'}
    const paused=r.players.some(p=>!p.sock);
    if(!paused){if(r.ph==='count'&&now>=r.until)r.ph='play';
      else if(r.ph==='play')step(r,1/30);
      else if(r.ph==='between'&&now>=r.until)startRound(r,'Siguiente ronda')}
    const snap=JSON.stringify({t:'s',ph:r.ph,R:r.R,time:r.time,cnt:Math.max(0,Math.ceil((r.until-now)/1000)),code:r.code,mid:r.mid,
      w:r.wind?r.wind.a:null,pu:r.pu,ev:r.ev,msg:r.msg,win:r.winner,paused,
      p:r.players.map(p=>({n:p.n,k:p.k,rd:p.ready,rm:p.rm,on:!!p.sock,sc:p.sc,x:p.x,y:p.y,vx:p.vx,vy:p.vy,cd:Math.max(0,p.cd-r.time),h:p.heavy>r.time,sl:p.slow>r.time}))});
    r.ev=[];r.players.forEach(p=>send(p.sock,JSON.parse(snap)))}},33);
server.listen(PORT,()=>console.log('Bumper Blobs en http://localhost:'+PORT));
