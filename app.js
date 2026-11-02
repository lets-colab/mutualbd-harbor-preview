'use strict';
// IGLOO / MutualBD proof: custom 3D->2D isometric projection, not a WebGL or Three.js deployment.
// This deliberately keeps required content in semantic HTML and remains functional without Canvas.
(() => {
  const services = [
    ['SHIPPING AGENCY', 'Shipping agency and vessel support services are among the group\'s historically documented capabilities.'],
    ['CUSTOMS & TRADING', 'Customs clearing and forwarding activities are described in the historic Mutual Trading company profile.'],
    ['MARINE LOGISTICS', 'Heavy equipment movement, container transport and inland waterway support appear in the historical group profile.'],
    ['NAVIGATION & PORT', 'Historical materials describe port and berth services and inland coastal vessel operations; current fleet information requires validation.']
  ];
  const selector = (id) => document.getElementById(id);
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const menu = selector('menuToggle');
  const mobile = selector('mobileNav');
  if (menu && mobile) {
    menu.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      mobile.hidden = !open;
      if(open) mobile.querySelector('a')?.focus();
    });
    mobile.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open navigation');
        mobile.hidden = true; menu.focus();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !mobile.hidden) {
        menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open navigation');
        mobile.hidden = true; menu.focus();
      }
    });
  }
  const buttons = [...document.querySelectorAll('.service-btn')];
  buttons.forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.service);
    if (!Number.isInteger(index) || index < 0 || index >= services.length) return;
    buttons.forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
    selector('activeServiceTitle').textContent = services[index][0];
    selector('activeIndex').textContent = `${String(index+1).padStart(2,'0')} / 04`;
    selector('serviceDetail').textContent = services[index][1];
  }));
  const contact = selector('contactButton');
  contact?.addEventListener('click', () => {
    selector('contactStatus').textContent = 'Contact delivery is disabled in this concept. Confirm the authorized address and form handling before publication.';
  });

  const canvas = selector('harborCanvas');
  const stage = document.querySelector('.harbor-stage');
  if (!canvas || !stage || !canvas.getContext) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  let width = 0, height = 0, dpr = 1, hover = 0, pointerTarget = 0;
  let scrollTarget = 0, lastFrame = 0, active = true, rafId = 0;
  const faces = [];
  function size() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const observer = ('IntersectionObserver' in window) ? new IntersectionObserver(items => {
    active = items[0]?.isIntersecting || false;
    if (active && !rafId) rafId = requestAnimationFrame(loop);
  }, { threshold: 0.05 }) : null;
  observer?.observe(stage);
  stage.addEventListener('pointermove', (event) => {
    const bounds = stage.getBoundingClientRect();
    pointerTarget = ((event.clientX - bounds.left) / bounds.width - 0.5) * 1.1;
    if (reduced) { hover = pointerTarget; render(0); }
  });
  stage.addEventListener('pointerleave', () => { pointerTarget = 0; });
  function onScroll() {
    const rect = document.querySelector('.hero').getBoundingClientRect();
    scrollTarget = Math.min(1, Math.max(0, -rect.top / (rect.height * .85)));
    if (reduced) render(0);
  }
  window.addEventListener('resize', () => { size(); render(0); }, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  size(); onScroll();
  function frame(t) {
    faces.length = 0;
    const yaw = -.42 + hover * .23 + scrollTarget * .12;
    const pitch = -.30;
    const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
    const unit = Math.min(width / 9.5, height / 5.6) * .77;
    // True volumetric vertex coordinates are transformed and projected each frame.
    function project(v) {
      const rx = v[0]*cy-v[2]*sy, rz=v[0]*sy+v[2]*cy;
      const ry=v[1]*cp-rz*sp, depth=v[1]*sp+rz*cp;
      const perspective = 1 / (1 + depth * .030);
      return [width * .48 + rx*unit*perspective, height * .64 - ry*unit*perspective, depth];
    }
    function polygon(vertices, fill, stroke=null, line=1, opacity=1) {
      const p=vertices.map(project); const depth=p.reduce((s,v)=>s+v[2],0)/p.length;
      faces.push({p,fill,stroke,line,depth,opacity});
    }
    function box(x1,y1,z1,x2,y2,z2, colors, detail=false) {
      const v = [[x1,y1,z1],[x2,y1,z1],[x2,y2,z1],[x1,y2,z1],[x1,y1,z2],[x2,y1,z2],[x2,y2,z2],[x1,y2,z2]];
      polygon([v[0],v[1],v[2],v[3]], colors.front, '#516874', .35);
      polygon([v[1],v[5],v[6],v[2]], colors.side, '#506b72', .35);
      polygon([v[4],v[0],v[3],v[7]], colors.side, '#506b72', .35);
      polygon([v[4],v[5],v[6],v[7]], colors.back || colors.front);
      polygon([v[3],v[2],v[6],v[7]], colors.top, '#9bb3a8', .4);
      if(detail){
        for(let j=1;j<=5;j++){
          const x=x1+(x2-x1)*j/6;
          polygon([[x,y1+.02,z1-.005],[x+.01,y1+.02,z1-.005],[x+.01,y2-.02,z1-.005],[x,y2-.02,z1-.005]],'#182c3758');
        }
      }
    }
    // Ship's shadow and movement lines: separate from polygon scene.
    ctx.clearRect(0,0,width,height);
    let glow=ctx.createRadialGradient(width*.46,height*.78,8,width*.46,height*.78,width*.5);
    glow.addColorStop(0,'#7cb6a31f');glow.addColorStop(1,'#7cb6a300');
    ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
    const waterY=height*.77;
    for(let i=0;i<36;i++){
      const yy=waterY + i*i*.48;
      const transparency=Math.max(.008,.10-i*.0025);
      ctx.strokeStyle=`rgba(188,221,186,${transparency})`;
      ctx.lineWidth=i%7===0?1.2:.5;
      ctx.beginPath();
      const off=Math.sin(i*5.1 + t*.35)*18;
      ctx.moveTo(-40+off,yy);ctx.lineTo(width*.95+off,yy);ctx.stroke();
    }
    const waveShift = reduced?0:Math.sin(t*.65)*.027;
    // Low-poly ship bow: original geometry, not recovered client asset.
    polygon([[-4,-.19,-1.15],[3.6,-.19,-1.15],[4.35,.34,-.67],[4.25,.58,-.62],[3.35,.58,-1.05],[-3.95,.58,-1.05]], '#182e3b','#718b8b',.8);
    polygon([[-4,-.19,1.15],[3.6,-.19,1.15],[4.35,.34,.67],[4.25,.58,.62],[3.35,.58,1.05],[-3.95,.58,1.05]], '#153e49','#66858b',.8);
    polygon([[-3.98,.57,-1.03],[3.3,.57,-1.03],[4.26,.57,-.62],[4.26,.57,.62],[3.3,.57,1.03],[-3.98,.57,1.03]], '#496672','#8facaf',.8);
    // Hull forward bright stripe and vessel profile.
    polygon([[-3.9,.39,-1.162],[3.7,.39,-1.16],[4.19,.48,-.63],[3.37,.48,-1.04],[-3.9,.48,-1.04]],'#d4d6b7');
    // Container rows differentiated by shade and stripe patterns.
    const colors=[
      {front:'#d8a877',top:'#f2c793',side:'#b67d5d'},
      {front:'#426b70',top:'#678b86',side:'#294b57'},
      {front:'#b0b5aa',top:'#d5d5c1',side:'#7c8e88'},
      {front:'#c17851',top:'#dfa07b',side:'#8c503e'},
      {front:'#7e9da0',top:'#b5c1b0',side:'#59747d'}];
    for(let row=0;row<2;row++){
      const z = -.89 + row*.92;
      for(let col=0;col<5;col++){
        const x=-3.5+col*1.24;
        const shade=colors[(col+row*2)%colors.length];
        box(x,.64+waveShift,z,x+1.14,1.35+waveShift,z+.79,shade,true);
      }
    }
    for(let row=0;row<2;row++){
      const z = -.89 + row*.92;
      for(let col=1;col<4;col++){
        const x=-3.5+col*1.24;
        box(x,1.36+waveShift,z,x+1.14,2.05+waveShift,z+.79,colors[(col+row+3)%colors.length],true);
      }
    }
    // Ship bridge + windows.
    box(-3.85,.59+waveShift,-.72,-3.05,2.66+waveShift,.68,{front:'#e3e2d0',top:'#f1eee1',side:'#b8c0ba'});
    box(-3.87,1.98+waveShift,-.75,-3.00,2.22+waveShift,.71,{front:'#244956',top:'#426673',side:'#152f3b'});
    // Chimney and antenna.
    box(-3.62,2.68+waveShift,-.20,-3.24,3.25+waveShift,.25,{front:'#baccc1',top:'#e4e3c4',side:'#839a97'});
    // Rail and deck features.
    box(2.98,.62+waveShift,-.5,3.60,.88+waveShift,.45,{front:'#e8dfb7',top:'#fff2ca',side:'#b8b2a0'});
    // Sort polygons by depth, far to near, after applying model transforms.
    faces.sort((a,b)=>b.depth-a.depth);
    ctx.lineJoin='round';
    for (const face of faces){
      ctx.globalAlpha=face.opacity;
      ctx.beginPath();ctx.moveTo(face.p[0][0],face.p[0][1]);
      for (let i=1;i<face.p.length;i++)ctx.lineTo(face.p[i][0],face.p[i][1]);
      ctx.closePath();ctx.fillStyle=face.fill;ctx.fill();
      if(face.stroke){ctx.strokeStyle=face.stroke;ctx.lineWidth=face.line;ctx.stroke();}
    }
    ctx.globalAlpha=1;
    // Subtle water-level spray gives the scene a distinct atmospheric baseline.
    for(let i=0;i<12;i++){
      const x=width*.23+i*width*.06;
      const y=height*.735+Math.sin(i*3.2+t*.3)*2;
      ctx.fillStyle=`rgba(206,224,199,${.08+(i%3)*.035})`;
      ctx.fillRect(x,y,12+i*1.5,.7);
    }
  }
  function render(t){if(width>0&&height>0)frame(t)}
  function loop(time){rafId=0;if(!active)return; const t=time/1000;
    if(!reduced){hover+=(pointerTarget-hover)*.055;render(t);rafId=requestAnimationFrame(loop);}
    else render(0);
    lastFrame=t;
  }
  render(0);
  if(!reduced)rafId=requestAnimationFrame(loop);
  window.addEventListener('pagehide', () => { if(rafId)cancelAnimationFrame(rafId);observer?.disconnect(); });
})();