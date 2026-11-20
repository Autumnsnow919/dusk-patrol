class LakeChart {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');
    this.survey=new Set();this.selected=0;this.overview=false;this.extent=WORLD.L*1.46;
  }
  cycle(){this.selected=(this.selected+1)%Lake.sites.length;}
  bake(groundAt){
    const base=document.createElement('canvas'),n=720;
    base.width=base.height=n;
    const ctx=base.getContext('2d'),image=ctx.createImageData(n,n);
    const palette=[[37,61,77],[68,84,82],[86,97,87],[107,107,94],[133,119,105]];
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const h=groundAt((x/n-.5)*this.extent,(y/n-.5)*this.extent);
      const color=palette[h<=0?0:h<45?1:h<110?2:h<180?3:4];
      const i=4*(y*n+x);
      image.data[i]=color[0];image.data[i+1]=color[1];image.data[i+2]=color[2];image.data[i+3]=255;
    }
    ctx.putImageData(image,0,0);this.base=base;
  }
  draw(body,room,patrolPosition){
    const ctx=this.ctx,n=this.canvas.width;
    if(!this.base)return;
    const span=this.overview?this.extent:7800,x0=this.overview?0:body.pos[0],z0=this.overview?0:body.pos[2];
    const size=this.base.width,ratio=size/this.extent;
    ctx.fillStyle='#202534';ctx.fillRect(0,0,n,n);
    ctx.drawImage(this.base,size/2+(x0-span/2)*ratio,size/2+(z0-span/2)*ratio,span*ratio,span*ratio,0,0,n,n);
    const xy=p=>[n*(.5+(p[0]-x0)/span),n*(.5+(p[2]-z0)/span)];
    const [cx,cy]=xy([900,0,1500]);
    ctx.lineWidth=1;ctx.strokeStyle='#cfe4dd38';
    for(let i=1;i<8;i++){
      ctx.beginPath();ctx.moveTo(i*n/8,0);ctx.lineTo(i*n/8,n);ctx.moveTo(0,i*n/8);ctx.lineTo(n,i*n/8);ctx.stroke();
    }
    if(this.overview){
      ctx.beginPath();
      for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]){
        const p=xy([(a*WORLD.E1[0]+b*WORLD.E2[0])*WORLD.L/2,0,(a*WORLD.E1[1]+b*WORLD.E2[1])*WORLD.L/2]);
        ctx.lineTo(...p);
      }
      ctx.strokeStyle='#b6c7ba';ctx.stroke();
    }
    if(room.combat){
      ctx.setLineDash([3,5]);ctx.beginPath();ctx.arc(cx,cy,n*Lake.arenaRadius/span,0,2*Math.PI);ctx.strokeStyle='#ffd59b';ctx.stroke();ctx.setLineDash([]);
    }
    ctx.font='bold 12px sans-serif';ctx.fillStyle='#ffffda';ctx.fillText('N ↑',10,18);
    const player=xy(body.pos),goal=xy(patrolPosition||Lake.sites[this.selected].pos);
    ctx.setLineDash([3,4]);ctx.strokeStyle='#ffe4ac';ctx.beginPath();ctx.moveTo(...player);ctx.lineTo(...goal);ctx.stroke();ctx.setLineDash([]);
    Lake.sites.forEach((site,i)=>{
      const [x,y]=xy(site.pos),active=room.mode==='pvp'&&!room.self?.star && room.self?.beacon?.site===i;
      if(site.length){
        const size=site.length*n/span;ctx.fillStyle='#262834';ctx.fillRect(x-3,y-size/2,6,size);
        ctx.fillStyle=site.color;for(let d=2;d<size;d+=5)ctx.fillRect(x,y-size/2+d,1,2);
      }
      ctx.fillStyle=site.color;ctx.fillRect(x-3,y-3,6,6);
      if(i===this.selected||active){ctx.strokeStyle=active?'#ffcd51':site.color;ctx.beginPath();ctx.arc(x,y,active?10:7,0,Math.PI*2);ctx.stroke();}
      // Keep nearby bridge and climbing course labels on opposite sides.
      if(this.overview&&i<9 && !active && i!==this.selected)return;
      const labelX=i===0?x-9:x+9;
      ctx.textAlign=i===0?'right':'left';ctx.lineWidth=3;ctx.strokeStyle='#222235';ctx.strokeText(site.name,labelX,y+4);
      ctx.fillText((this.survey.has(site.id)?'✓ ':'')+site.name,labelX,y+4);ctx.lineWidth=1;ctx.textAlign='left';
    });
    for(const peer of room.peers.values()){
      if(peer.hp===0)continue;
      const [x,y]=xy(peer.pos);ctx.fillStyle=room.hostile(peer)?'#ff956e':'#8ee7e6';ctx.fillRect(x-2,y-2,4,4);ctx.fillText(peer.name,x+4,y-4);
    }
    const f=Flight.axes(body.quat).f;
    ctx.save();ctx.translate(...player);ctx.rotate(Math.atan2(f[0],-f[2]));
    ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,5);ctx.lineTo(0,3);ctx.lineTo(-5,5);ctx.closePath();
    ctx.fillStyle='#fff9d2';ctx.fill();ctx.strokeStyle='#302837';ctx.stroke();ctx.restore();
  }
}
class OutfitPanel{
  constructor(element){
    this.element=element;this.list=element.querySelector('.kit-list');
    this.summary=element.querySelector('output');this.apply=element.querySelector('.kit-apply');
    this.buttons=Outfit.items.map((item,i)=>{
      const button=document.createElement('button');button.type='button';
      button.innerHTML='<kbd>'+Outfit.keyLabel(i)+'</kbd><span><b>'+item.name+'</b><small>'+item.tip+'</small></span><strong>'+item.cost+' 点</strong>';
      button.addEventListener('click',()=>this.toggle(i));this.list.append(button);return button;
    });
  }
  open(kit){this.draft=kit;this.element.hidden=false;this.paint();}
  close(){this.element.hidden=true;document.activeElement?.blur();}
  toggle(i){this.draft^=1<<i;this.paint();}
  paint(){
    const used=Outfit.cost(this.draft);
    this.buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(!!(this.draft&(1<<i)))));
    this.summary.textContent=used>Outfit.budget?'超出 '+(used-Outfit.budget)+' 点':this.draft?'剩余 '+(Outfit.budget-used)+' / '+Outfit.budget+' 点':'请至少选择一件武器';
    this.apply.disabled=!Outfit.valid(this.draft);
  }
}
