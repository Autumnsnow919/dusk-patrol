const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const Flight=require('./flight.js');
const Sight=require('./sight.js');
const cockpit=require('./cockpit.js');
const env={groundAt:(x,z)=>100*Math.cos((x+z)/600),cam:{B:Flight.axes([0,0,0,1]),fov:1.16}};
let state={pos:[0,620,0],speed:160,agl:510,vs:-2,yaw:0,pitch:0,roll:0,omega:0,slip:0,
  time:0,g:1,shake:0,boost:0,stalled:false,throttle:.5,engine:.4,gear:1};

for(const [width,height] of [[500,314],[210,200],[255,430],[660,300],[210,370]]){
  const displayed=Buffer.alloc(width*height*4),panels=new Set();
  const ctx={
    createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),
    clearRect:()=>displayed.fill(0),
    putImageData(img,dx,dy,x=0,y=0,w=width,h=height){
      const entire=Buffer.from(img.data.buffer);
      for(let j=y;j<y+h;j++){
        const left=(j*width+x)*4;entire.copy(displayed,left,left,left+w*4);
      }
      assert(displayed.equals(entire),'partial upload left stale instrument pixels');
    }
  };
  cockpit.resize({getContext:()=>ctx},width,height);
  for(const type of Object.keys(Flight.fleet)){
    cockpit.select(type);
    state={...state,roll:0,pitch:0,g:1,shake:0,speed:160,time:0,stalled:false};
    for(const mix of [.1,.65,.99,1])cockpit.draw(mix,state,null,env);
    // Silhouette alone must distinguish each fit, regardless of paint or nameplate.
    const mask=Buffer.alloc(width*height);
    for(let i=0;i<mask.length;i++)mask[i]=displayed[i*4+3]===255?1:0;
    const digest=createHash('sha256').update(mask).digest('hex');
    assert(!panels.has(digest),type+' shares its cockpit');panels.add(digest);
    const basis=Flight.axes([0,0,0,1]),room={combat:true,self:{lock:1},weapon:'missile',target:'p',marks:new Map([['p',100]])};
    for(const boost of [0,1]){
      const {fov,tanDown}=cockpit.view(boost),focal=height/(2*Math.tan(fov/2));
      const ca=1/Math.hypot(1,tanDown),sa=ca*tanDown;
      const cam={fov,wCockpit:1,B:{r:basis.r,u:[0,ca,-sa],f:[0,-sa,-ca]}};
      const colourAt=(x,y)=>displayed.readUInt32LE((y*width+x)*4)&0xffffff;
      const draw=(weapon,g)=>{room.weapon=weapon;cockpit.draw(1,{...state,g},null,{...env,cam,basis,room});};
      for(const g of [-1,4])for(const [weapon,profile] of Object.entries({...Sight.profiles,laser:Sight.laser})){
        draw(weapon,g);
        const cy=Math.round(height/2-focal*tanDown),cx=Math.round(width/2);
        assert.equal(colourAt(cx-8,cy),0xa6ff8c,type+' nose symbol moved with panel jolt');
        const hasLockPixel=(x,y)=>{
          for(let j=y-2;j<=y+2;j++)for(let k=x-2;k<=x+2;k++)if(colourAt(k,j)===0x5ad2ff)return true;
          return false;
        };
        let rightEdge;
        for(let i=0;i<8;i++){
          const dx=profile.ring*Math.cos(i*Math.PI/4),dy=profile.ring*Math.sin(i*Math.PI/4),z=ca-sa*dy;
          const x=Math.round(width/2+focal*dx/z),y=Math.round(height/2-focal*(sa+ca*dy)/z);
          assert(x>4 && x<width-4 && y>10 && y+3<cockpit.windscreenHeight()*height,type+' capture ring left the windscreen');
          assert(hasLockPixel(x,y),type+' missing '+weapon+' arc at '+[width,height,boost,g,i]);
          if(i===0)rightEdge=[x,y];
        }
        draw('gun',g);
        assert.equal(colourAt(cx-8,cy),0xa6ff8c);
        assert(!hasLockPixel(...rightEdge),'old lock arc survived a switch to the gun');
      }
    }
    for(const load of [4,4,-1,-1,1,1]){
      state.time+=.04;state.pitch+=.12;state.roll-=.45;state.speed-=10;
      state.g=load;state.shake=1;state.stalled=!state.stalled;
      cockpit.draw(1,state,null,env);
      const covered=cockpit.coveredRows();
      assert(covered>0 && covered<height,type+' cockpit occlusion');
      for(let i=(height-covered)*width*4+3;i<displayed.length;i+=4)assert.equal(displayed[i],255,type+' transparent row culled');
    }
    for(const mix of [.99,.6,.2,0])cockpit.draw(mix,state,null,env);
    assert(!displayed.some(Boolean),type+' cockpit visible in chase view');
  }
  console.log(width+'×'+height+' · '+panels.size+' distinct cockpits, transitions, moving instruments and opaque rows verified');
}
