const Flight = (() => {
  const fields=typeof module==="undefined"?Airfields:require("./airfields.js");
  const fleet = {
    tern: { name: '燕鸥 T-2', role: '长翼巡游', mass: 2700, area: 30, cruise: 76, thrust: 7500, drag: .032, induced: .051, stall: .32, roll: 2.3, pitch: 1.4, inertia: [3100, 6800, 5300] },
    swift: { name: '雨燕 A-7', role: '轻型特技', mass: 1800, area: 18, cruise: 98, thrust: 12000, drag: .028, induced: .061, stall: .36, roll: 5.6, pitch: 3.3, inertia: [1150, 2600, 2100] },
    comet: { name: '彗星 J-9', role: '高速巡航', mass: 6400, area: 29, cruise: 165, thrust: 34000, drag: .024, induced: .089, stall: .29, roll: 3.6, pitch: 1.85, inertia: [8700, 20500, 17400] }
  };
  fleet.kite={...fleet.swift,name:'纸鸢 X · 矢量实验',role:'虚构特技',vector:2};
  fleet.manta={name:'蝠鲼 M-6',role:'升力风扇',mass:3100,area:38,cruise:86,thrust:39000,drag:.041,induced:.076,stall:.34,roll:2.1,pitch:1.55,inertia:[5200,8100,6400]};
  fleet.osprey={name:'鹗翼 B-4',role:'空气制动',mass:2450,area:22,cruise:115,thrust:14500,drag:.029,induced:.061,stall:.32,roll:4.1,pitch:2.2,inertia:[2600,4700,3250]};
  fleet.pulse={name:'流星 P-8',role:'蓄能冲刺',mass:3850,area:24,cruise:131,thrust:21000,drag:.027,induced:.065,stall:.28,roll:3.2,pitch:2.0,inertia:[3500,6700,4950]};
  fleet.heron={...fleet.tern,name:'苍鹭 H-3',role:'长航稳翼',mass:2920,area:37,cruise:90,roll:2.1,thrust:9300};
  fleet.gull={...fleet.swift,name:'海燕 G-5',role:'联翼侧滑',cruise:104,area:20,mass:2100,roll:3.9};
  fleet.rv8a={name:'RV-8A · N58VA 参考',role:'民用校验',mass:1800*.45359237,area:111.2*.09290304,cruise:61.04,thrust:4000,
    shaft:200*745.7,efficiency:.85,drag:.026,induced:.066,maxLift:1.95,stall:.30,roll:7.4,pitch:2.6,
    inertia:[1.24,1.51,.97].map(radius=>1800*.45359237*radius**2)};
  fleet.needle={name:'长针 S-1',role:'跨声速快递',mass:5300,area:22,cruise:245,thrust:74000,drag:.023,induced:.072,stall:.29,roll:3.5,pitch:1.75,inertia:[5300,13900,11100]};
  fleet.sail={name:'信风 L-4',role:'电动滑翔',mass:680,area:20,cruise:43,thrust:2050,shaft:55000,efficiency:.82,drag:.018,induced:.032,stall:.31,roll:2.5,pitch:2.2,inertia:[1450,980,1600]};
  fleet.delta={name:'砂狐 D-4',role:'无尾三角翼',mass:4700,area:34,cruise:186,thrust:27000,drag:.024,induced:.057,stall:.35,roll:3.2,pitch:2.3,inertia:[5600,11800,9800]};
  fleet.petrel={name:'逆风燕 F-3',role:'前掠特技',mass:2600,area:21,cruise:153,thrust:17400,drag:.026,induced:.061,stall:.38,roll:5.2,pitch:2.85,inertia:[2300,5500,4500]};
  fleet.aurora={name:'极光 V-6',role:'重型矢量',mass:7400,area:37,cruise:182,thrust:46000,drag:.027,induced:.068,stall:.33,roll:3.1,pitch:2.1,inertia:[11300,24600,18200],vector:3};
  fleet.spire={name:'银梭 R-2',role:'远程竞速',mass:5800,area:22,cruise:228,thrust:39000,drag:.020,induced:.074,stall:.28,roll:3.3,pitch:1.7,inertia:[7400,16500,13200]};
  // Fictional high-power stage, in newtons at reference density.
  fleet.rook={...fleet.heron,name:'白栎 O-6',role:'双梁测绘',mass:3400,area:42,cruise:101,thrust:15400,roll:2.25,inertia:[6500,9800,7600]};
  fleet.skate={...fleet.kite,name:'鳐影 V-4',role:'三轴矢量',vector:3,mass:4100,area:32,cruise:152,thrust:32000,roll:4.1,pitch:2.1,inertia:[5300,10200,7800]};
  fleet.wisp={...fleet.delta,name:'流萤 C-7',role:'鸭翼短场',mass:3950,area:34,cruise:163,thrust:28500,roll:3.4,pitch:2.5,inertia:[4900,9300,7500]};
  fleet.opal={...fleet.skate,name:'星斑 X-3',role:'三轴特技',mass:3350,area:30,cruise:158,thrust:28000,roll:4.8,inertia:[3900,7200,6200]};
  fleet.lance={...fleet.kite,name:'赤翎 D-2',role:'二维高速',mass:5200,area:26,cruise:211,thrust:53000,pitch:2.3,roll:3.1,inertia:[7800,12000,10400]};
  fleet.loom={...fleet.heron,name:'织云 R-5',role:'联翼巡游',mass:2940,area:39,cruise:111,thrust:18700,roll:2.8,inertia:[4100,8700,6800]};
  fleet.nocturne={...fleet.delta,name:'夜枭 N-6',role:'六代无尾概念机',mass:7200,area:47,cruise:204,thrust:51000,roll:3.2,pitch:2.05,inertia:[10200,21800,17200],elevon:true};
  fleet.ember={...fleet.petrel,name:'火燕 U-1',role:'纵向静不稳定验证机',mass:3500,area:29,cruise:164,thrust:33000,roll:4.6,pitch:2.8,inertia:[3500,8600,6400],unstable:1.4,elevon:true};
  fleet.tandem={...fleet.tern,name:'蜻蜓 T-4',role:'串列翼巡游',mass:2150,area:36,cruise:83,thrust:8700,roll:2.7,pitch:1.85,inertia:[2900,6500,4900]};
  fleet.cirrus={...fleet.nocturne,name:'暮隼 G-6',role:'宽翼六代概念机',mass:6950,area:51,cruise:196,roll:2.9,inertia:[10400,22400,18600],wingLevel:true};
  fleet.ibis={...fleet.petrel,name:'朱鹮 F-8',role:'前掠翼表演机',mass:2850,area:24,cruise:149,roll:4.7,pitch:2.65,inertia:[2450,6200,4800],rollCoupling:true,elevon:true};
  fleet.spire.noseLength=16;fleet.needle.noseLength=14.5;
  fleet.quill={...fleet.spire,name:'云针 Q-5',role:'细长机鼻通场机',noseLength:19.4,cruise:219,mass:5500,area:23,yawDamper:true,inertia:[5700,15100,13800]};
  fleet.ogee={...fleet.delta,name:'白浪 D-8',role:'曲边三角翼巡航机',noseLength:13.2,cruise:177,mass:5600,area:43,roll:2.85,elevon:true,landingFlaps:true,inertia:[7900,15200,13700]};
  fleet.delta.elevon=true;
  // These pixel models borrow silhouettes. Their handling uses club game presets.
  fleet.su27={...fleet.comet,name:'苏-27',role:'单座双发 · 外形复刻',noseLength:12.1,roll:3.85,wingLevel:true};
  fleet.j10={...fleet.wisp,name:'歼-10',role:'单发鸭式 · 外形复刻',singleEngine:true,elevon:true,landingFlaps:true,roll:4.5,noseLength:10.8};
  fleet.j20={...fleet.cirrus,name:'歼-20',role:'双发鸭式 · 外形复刻',noseLength:13.5,wingLevel:false,yawDamper:true};
  fleet.j16={...fleet.comet,name:'歼-16',role:'串列双座 · 外形复刻',noseLength:12.1,roll:3.15,pitch:1.72,yawDamper:true};
  fleet.f4={...fleet.comet,name:'F-4C 鬼怪 II',role:'折翼双座',noseLength:11.8,roll:2.95,yawDamper:true};
  fleet.f16={...fleet.petrel,name:'F-16A 战隼',role:'单发轻型',singleEngine:true,noseLength:10.8,roll:5.15,landingFlaps:true};
  fleet.f22={...fleet.lance,name:'F-22A 猛禽',role:'双尾二维矢量',noseLength:12.4,roll:3.75};
  fleet.f15={...fleet.comet,name:'F-15C 鹰',role:'双垂尾重型',noseLength:13.8,roll:3.45,pitch:1.75,wingLevel:true};
  fleet.m2000={...fleet.delta,name:'幻影 2000C',role:'无平尾三角翼',singleEngine:true,noseLength:12.6,elevon:true,yawDamper:true};
  fleet.f5={...fleet.petrel,name:'F-5E 虎 II',role:'轻型双发',noseLength:13.2,engineSpacing:.85,roll:5.25,rollCoupling:true};
  // Hinge height and station in mesh units, followed by differential and lift-mode travel.
  for(const [type,y,z,mix,lift] of [
    ['kite',.24,4.62,.13,0],['pulse',.24,4.62,0,0],['petrel',.24,4.62,.19,0],['aurora',.24,4.62,.12,0],
    ['lance',.4,5.42,0,0],['wisp',.52,4.2,0,.32],['ember',.42,4.7,.23,0],['tandem',.85,3.6,0,.22],['ibis',.40,4.85,.16,0],
    ['j10',.42,3.85,.13,.22],['j20',.50,4.35,.18,0]
  ])fleet[type].canard={y,z,mix,lift};
  function canardAngle(spec,pitch,roll,deploy,side){
    const c=spec.canard;
    return clamp(-.48*pitch-c.mix*roll*side-c.lift*deploy,-.67,.67);
  }
  const highPower={quill:81000,ogee:114000,cirrus:108000,ibis:73000,nocturne:102000,ember:76000,swift:57000,comet:78000,kite:63500,osprey:63000,pulse:69000,gull:61000,
    needle:16000,delta:90000,petrel:65000,aurora:99000,spire:80000,skate:74000,wisp:70000,opal:70000,lance:81000};
  for(const [type,boost] of Object.entries(highPower))fleet[type].highPower=boost;
  for(const [type,preset] of [['su27','comet'],['j10','wisp'],['j20','cirrus'],['j16','comet'],['f4','comet'],['f16','petrel'],['f22','lance'],['f15','comet'],['m2000','delta'],['f5','petrel']])
    fleet[type].highPower=fleet[preset].highPower;
  const cards={
    f15:['翼平辅助','座舱后方是两条方进气道，两片高垂尾分立于宽机背两侧。松开滚转后按 V，方便改平跟队。',[8.05,.18,-3.05],[.46,.58,.66]],
    m2000:['稳向通场','浅蓝色三角翼一直延伸到机尾，两侧进气道汇入一只圆喷口。V 稳住航向，W/S 驱动升降副翼。',[7.1,.17,-5.35],[.50,.67,.76]],
    f5:['联动滚转','长机鼻、小梯形翼，两只喷口紧挨在单垂尾下。按住 V 配合 Q/E，能带出灵活的联动滚转。',[5.05,.15,-2.55],[.69,.59,.40]],
    f4:['航向阻尼','串列双座，外翼向上折，平尾向下斜。滚转手感偏沉，按住 V 稳住航向。',[7.5,.97,-3.65],[.42,.49,.34]],
    f16:['增升襟翼','单座泡形舱盖，翼根向前伸，机腹下只有一个进气口。滚转轻快，按 V 放襟翼进近。',[6.2,.12,-2.85],[.58,.66,.73]],
    f22:['二维矢量','宽菱形主翼、外倾双尾和扁喷口。按住 V 配合 W/S，能看到喷口和尾焰一起俯仰。',[7.5,.20,-2.85],[.43,.5,.54]],
    su27:['翼平辅助','蓝色单座机，翼根前伸，两根直立尾翼之间伸出尾锥。松开 A/D 并按住 V，适合改平后加入编队。',[7.85,.22,-3.6],[.45,.67,.84]],
    j10:['增升进近','机腹进气，单喷口，主翼前方装有活动鸭翼。V 放下内襟翼，轻点 W/S 可以看到鸭翼偏转。',[6.15,.16,-4.45],[.71,.76,.78]],
    j20:['稳向通场','长机身两侧有折线棱边，鸭翼在主翼之前，两片垂尾向外倾。按住 V 增加航向阻尼。',[7.4,.28,-4.95],[.47,.53,.58]],
    j16:['双座巡航','深灰机身配串列双座舱盖，沿用侧卫家族双尾和尾锥。游戏滚转较苏-27 缓和，V 稳住航向。',[7.9,.20,-3.65],[.39,.45,.53]],
    quill:['通场稳向','长机鼻伸出座舱前方，窄翼靠后。按住 V 稳定航向，适合从固定机位前高速通场。',[5.1,.28,-5.6],[.74,.81,.86]],
    ogee:['曲边增升翼','宽翼根向外收成曲线。按住 V 放下内襟翼减速进近，外侧升降副翼继续控制滚转。',[9.5,.23,-6.1],[.86,.80,.64]],
    cirrus:['巡航翼平','宽大的折线翼接上低矮双尾。按住 V 并松开滚转键，飞机会自己放平两翼。',[10.8,.38,-6.3],[.48,.60,.70]],
    ibis:['联动滚转','朱红翼尖向机鼻回折。按住 V 并用 Q/E 偏航，飞机随之滚转，W/S 会带动前方鸭翼。',[7.8,.62,3.5],[.88,.43,.43]],
    nocturne:['分裂减速舵','无尾折线翼以升降副翼俯仰、滚转。按住 V 张开双侧翼梢减速舵，配合 Q/E 差动转向。',[9.2,.18,-5.3],[.42,.47,.62]],
    ember:['纵向静不稳定','默认电传以鸭翼修正迎角扰动。按住 V 逐步放宽增稳，松开 V 恢复辅助；用 W/S 感受同一架飞机的差别。',[6.8,.34,-3.8],[.92,.39,.27]],
    tandem:['串列增升翼','前后两对翼面前后错开。W/S 调整前翼迎角，V 增大前翼安装角，适合低速穿门。',[8.1,.2,-4.5],[.46,.78,.64]],
    opal:['轻型三维矢量','V 配合 W/S、Q/E、A/D 混合控制俯仰、偏航和滚转。轻机体对差动喷口反应快。',[7.4,.9,-2.4],[.39,.82,.68]],
    lance:['二维矢量','V 配合 W/S 使双喷口上下偏转。窄翼、长机身，适合高速纵向机动。',[5.4,-.2,-4.6],[.95,.44,.32]],
    loom:['俯仰增稳','V 增加俯仰阻尼，适合贴着起伏地形平稳观景。',[10.6,1.3,-.5],[.76,.74,.92]],
    rook:['翼平辅助','V 松开滚转杆时逐渐改平机翼，方便沿群岛测绘。',[12.4,1.1,.4],[.65,.82,.71]],
    skate:['三维矢量','V + W/S 俯仰、Q/E 偏航、A/D 差动滚转。三个方向可以叠加。',[7.7,-.35,-4.1],[.49,.67,.89]],
    wisp:['增升鸭翼','V 展开鸭翼与内襟翼，低速升力增加，同时明显减速。',[6.6,.75,-2.0],[.96,.61,.27]],
    delta:['着陆襟翼','V 展开内侧襟翼，提高慢速升力；外侧升降副翼共同控制俯仰和滚转。',[8.3,.13,-4.7],[.93,.64,.34]],
    petrel:['联动滚转','V 配合 Q/E，方向舵带动同向滚转。前掠翼和短机身适合连续换向。',[6.9,.55,1.9],[.37,.79,.73]],
    aurora:['重型三维矢量','V 配合 W/S、Q/E、A/D 可三轴机动。重机身的姿态变化较缓。',[8.4,.62,-3.5],[.49,.60,.88]],
    spire:['航向阻尼','V 加强偏航阻尼，适合沿远程航段持续高速飞行。',[4.8,-.25,-4.8],[.83,.85,.78]],
    needle:['加力燃烧','R 加油门，V 接通加力。观察马赫数和尾焰，跨声速阻力会增大。',[5.2,.3,-4.9],[.54,.72,.85]],
    sail:['顺桨滑翔','V 收功率并顺桨，减小滑翔阻力。到西岭浮灯附近盘旋可借上升气流爬高。',[13,.85,.32],[.95,.79,.48]],
    tern:['增升襟翼','V 展开襟翼：低速更有升力，也更容易减速。',[10.4,.65,-.9],[.32,.76,.73]],
    swift:['快滚翼面','V 配合 A/D：加强滚转响应，以额外阻力为代价。',[5.6,.12,-1.2],[.98,.47,.22]],
    comet:['高速巡航','被动：高速巡航；高油门出现尾焰，转弯需要更大空间。',[6.4,-.05,-3.7],[.74,.78,.84]],
    kite:['二维矢量','V 配合 W/S：低速也能改变俯仰，过失速会明显掉速。',[6.4,-.05,-3.7],[.72,.49,.91]],
    manta:['升力风扇','V 将部分推力转向机背方向。平飞时能托住高度，但前向推力减少。',[9.2,.35,-4.2],[.28,.64,.91]],
    osprey:['空气制动','V 展开减速板，快速收速；松开收板，不会自动补回速度。',[7.6,1.5,-2.1],[.94,.76,.25]],
    pulse:['蓄能冲刺','V 消耗蓄能强化推力。耗尽后松开充能，至少充到 25% 可再启动。',[5.0,-.4,-4.9],[.89,.27,.49]],
    heron:['稳定翼','按住 V 加强姿态阻尼，松杆后更快止住滚转，适合编队拍摄。',[11.2,.85,-1.2],[.76,.79,.73]],
    gull:['侧滑翼','V 配合 Q/E 加强方向舵，额外阻力会消耗空速。',[6.1,1.12,-2.2],[.49,.65,.74]],
    rv8a:['民用校验','观光限定：无武装、无主动技能；保留原试飞校验。',[7.8,.53,.36],[.9,.9,.86]]
  };
  for(const [type,[trait,description,tip,color]] of Object.entries(cards))Object.assign(fleet[type],{trait,description,tip,color,pvp:type!=='rv8a'});
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  for(const [type,spec] of Object.entries(fleet)){
    spec.engineSpacing=spec.singleEngine?0:(spec.engineSpacing??1.32);
    spec.flatOutlet=type==='f22';
    spec.auxBurner=type==='pulse'||type==='needle';
    const length=(spec.noseLength??10.4)+9.5;
    spec.boomLevel=clamp(.38+1.45*spec.tip[0]/length,.60,1.18);
    spec.boomRate=clamp(22/length,.76,1.15);
  }
  // Linear temperature lapse below 11 km. Table interpolation is shared by all 120 Hz bodies.
  const rhoTable=[],soundTable=[];
  for(let h=0;h<=20000;h+=100){
    const t=288.15-.0065*Math.min(11000,h);
    rhoTable.push(1.225*(t/288.15)**4.25588*Math.exp(-Math.max(0,h-11000)/6341.6));
    soundTable.push(Math.sqrt(1.4*287.05*t));
  }
  function lookup(table,h){const v=clamp(h*.01,0,199.9999),i=Math.floor(v);return table[i]+(v-i)*(table[i+1]-table[i]);}
  const density=h=>lookup(rhoTable,h),soundSpeed=h=>lookup(soundTable,h);
  function thermal(x,y,z){
    const r=((x+1450)/300)**2+((z-610)/300)**2;
    return r>=1?0:5.4*(1-r)**2*clamp((y-175)/130,0,1)*clamp((1550-y)/300,0,1);
  }
  function boomMargin(pos,vel,eye){
    const v=Math.hypot(...vel),m=v/soundSpeed(pos[1]);
    if(m<=1)return null;
    const dx=pos[0]-eye[0],dy=pos[1]-eye[1],dz=pos[2]-eye[2],lag=(dx*vel[0]+dy*vel[1]+dz*vel[2])/v;
    return lag-Math.sqrt(Math.max(0,dx*dx+dy*dy+dz*dz-lag*lag)*(m*m-1));
  }
  const fullThrust=(spec,speed,rho)=>spec.shaft?Math.min(spec.thrust,spec.shaft*spec.efficiency*(rho/1.225)/Math.max(12,speed)):spec.thrust;
  function axes(quat, out={r:[0,0,0],u:[0,0,0],f:[0,0,0]}) {
    const xx=quat[0],yy=quat[1],zz=quat[2],ww=quat[3],{r,u,f}=out;
    r[0]=1-2*(yy*yy+zz*zz);r[1]=2*(xx*yy+zz*ww);r[2]=2*(xx*zz-yy*ww);
    u[0]=2*(xx*yy-zz*ww);u[1]=1-2*(xx*xx+zz*zz);u[2]=2*(yy*zz+xx*ww);
    f[0]=-2*(xx*zz+yy*ww);f[1]=-2*(yy*zz-xx*ww);f[2]=2*(xx*xx+yy*yy)-1;
    return out;
  }
  function create(type, pos = [900, 850, 1500], heading = -2.2) {
    const spec = fleet[type], quat = [0,-Math.sin(heading/2),0,Math.cos(heading/2)];
    const pressureArea = .5*density(pos[1])*spec.cruise**2*spec.area;
    const trimLift = spec.mass*9.81 / pressureArea;
    const throttle = pressureArea*(spec.drag+spec.induced*trimLift**2)/fullThrust(spec,spec.cruise,density(pos[1]));
    return { type, pos: [...pos], quat, vel: axes(quat).f.map(value => value*spec.cruise),
      rates: [0,0,0], controls: [0,0,0], throttle, engine: throttle, trimLift, alpha: 0, slip: 0, load: 1, stalled: false,
      basis:axes(quat),gear:type==='rv8a'?1:0,gearDown:type==='rv8a',grounded:false,crashed:false,touchdowns:0,sinkAtTouch:0,lastSink:0,
      contactDelay:0,span:spec.tip[0]*1.3,condition:fields.freshCondition(),damaged:false,service:0,pitchTrim:0,rotateSpeed:1.15*Math.sqrt(2*spec.mass*9.81/(density(pos[1])*spec.area*(spec.maxLift||1.45))),mach:spec.cruise/soundSpeed(pos[1]),updraft:0,vector:0,vecYaw:0,vecRoll:0,deploy:0,charge:1,empty:false };
  }
  function approach(type,field){
    // Trim an initial three-degree approach against the same lift, drag and pitching moment used in step.
    const gamma=-.047, distance=400, pos=[field.x,field.y+fields.clearance-distance*Math.tan(gamma),field.z-field.length/2-200];
    const b=create(type,pos,Math.PI),s=fleet[type],v=b.rotateSpeed*1.26,rho=density(pos[1]),q=.5*rho*v*v*s.area;
    let alpha=.1,thrust=0;
    const slope=s.maxLift?(s.maxLift-b.trimLift)/s.stall:4.6;
    for(let i=0;i<6;i++){
      const cl=(s.mass*9.81*Math.cos(gamma)-thrust*Math.sin(alpha))/q;
      alpha=(cl-b.trimLift)/slope;
      const drag=q*(s.drag+s.induced*cl*cl+1.45*Math.sin(alpha)**2+(type==='rv8a'?0:.035)+(type==='sail'?.009:0));
      thrust=clamp((drag+s.mass*9.81*Math.sin(gamma))/Math.cos(alpha),0,fullThrust(s,v,rho));
    }
    b.throttle=b.engine=thrust/fullThrust(s,v,rho);
    const pitch=alpha+gamma;
    b.quat=[0,-Math.cos(pitch/2),Math.sin(pitch/2),0];b.vel=[0,v*Math.sin(gamma),v*Math.cos(gamma)];
    b.pitchTrim=clamp(2.9*Math.sin(alpha)/s.pitch,-.65,.65);b.controls[0]=b.pitchTrim;
    b.gear=1;b.gearDown=true;return b;
  }
  function moveSurface(current,demand,gain,release){
    return current+(demand-current)*(current*(demand-current)<0?release:gain);
  }
  function step(body, command, dt, terrain) {
    const spec=fleet[body.type],axis=axes(body.quat,body.basis),vel=body.vel;
    body.contactDelay=Math.max(0,body.contactDelay-dt);
    body.updraft=thermal(...body.pos);
    const vy=vel[1]-body.updraft,speed=Math.hypot(vel[0],vy,vel[2]);
    body.mach=speed/soundSpeed(body.pos[1]);body.lastSink=Math.max(0,-vel[1]);
    if(typeof command.gear==='boolean' && !body.grounded)body.gearDown=command.gear;
    if(body.type==='rv8a')body.gearDown=true;
    body.gear+=clamp((body.gearDown?1:0)-body.gear,-dt/1.8,dt/1.8);
    const invSpeed=1/(speed||1), flowX=vel[0]*invSpeed,flowY=vy*invSpeed,flowZ=vel[2]*invSpeed;
    const forward=vel[0]*axis.f[0]+vy*axis.f[1]+vel[2]*axis.f[2];
    const alpha=speed<1?0:Math.atan2(-(vel[0]*axis.u[0]+vy*axis.u[1]+vel[2]*axis.u[2]),forward);
    const slipSin=clamp(flowX*axis.r[0]+flowY*axis.r[1]+flowZ*axis.r[2],-1,1),slip=Math.asin(slipSin);
    const pressed=command.vector===true;
    let engage=pressed && body.type!=='comet' && body.type!=='rv8a';
    if(body.type==='pulse'){
      if(!pressed && body.charge>=.25)body.empty=false;
      engage=pressed && !body.empty;
      body.charge=clamp(body.charge+(engage?-1/3:pressed?0:1/9)*dt,0,1);
      if(body.charge===0)body.empty=true;
    }
    body.deploy+=((engage?1:0)-body.deploy)*(1-Math.exp(-5*dt));
    const flaps=(body.type==='tern'||body.type==='delta'||body.type==='wisp'||body.type==='tandem'||spec.landingFlaps)?body.deploy:0,brake=(body.type==='osprey'||body.type==='nocturne')?body.deploy:0;
    const fan=body.type==='manta'?body.deploy:0, sprint=body.type==='pulse'?body.deploy:0;
    const rho=density(body.pos[1]), pressureArea = .5*rho*speed*speed*spec.area;
    const separated = clamp((Math.abs(alpha)-spec.stall)/.25,0,1);
    // High-speed trim progressively unloads the neutral wing. Manual incidence still contributes lift.
    const neutralLift=spec.highPower?body.trimLift*Math.min(1,(spec.cruise/Math.max(1,speed))**2):body.trimLift;
    const attached=spec.maxLift?clamp(body.trimLift+(spec.maxLift-body.trimLift)*alpha/spec.stall,-spec.maxLift,spec.maxLift):neutralLift+4.6*alpha;
    const c=body.condition,wingFactor=.54+.46*(c.leftWing+c.rightWing)/200;
    const liftCoeff = wingFactor*((attached+.32*flaps)*(1-separated) + .88*Math.sin(2*alpha)*separated);
    const sinAlpha=Math.sin(alpha);
    const dragCoeff = spec.drag + spec.induced*liftCoeff**2 + 1.45*sinAlpha**2 + .5*slipSin**2 +
      (body.type==='rv8a'?0:.035*body.gear)+.021*clamp((body.mach-.82)/.23,0,1)*clamp((1.85-body.mach)/.8,.25,1)+
      (body.type==='sail'?.009*(1-body.deploy):0)+.045*flaps+.19*brake+(body.type==='gull'?.035*body.deploy*Math.abs(command.yaw):0)+(body.type==='swift'?.014*body.deploy*Math.abs(command.roll):0);
    const liftX=axis.r[1]*flowZ-axis.r[2]*flowY,liftY=axis.r[2]*flowX-axis.r[0]*flowZ,liftZ=axis.r[0]*flowY-axis.r[1]*flowX;
    const inverseLift=1/(Math.sqrt(liftX**2+liftY**2+liftZ**2)||1);
    body.throttle = clamp(body.throttle + command.throttle*.32*dt,0,1);
    body.engine += (body.throttle-body.engine)*(1-Math.exp(-dt*1.2));
    if(spec.vector){
      const pitch=pressed?command.pitch:0,yaw=pressed && spec.vector===3?command.yaw:0;
      const roll=pressed && spec.vector===3?command.roll:0;
      // A paired game rig has a finite travel envelope on each side.
      const limit=Math.max(1,Math.hypot(Math.abs(pitch)+Math.abs(roll),yaw));
      const response=1-Math.exp(-dt*5);
      body.vector+=(pitch/limit-body.vector)*response;
      body.vecYaw+=(yaw/limit-body.vecYaw)*response;
      body.vecRoll+=(roll/limit-body.vecRoll)*response;
    }
    const powerLever=clamp((body.engine-.72)/.28,0,1);
    const boostedThrust=(spec.highPower||0)*powerLever**2*clamp((speed-(body.type==='kite'?120:55))/110,0,1)*
      clamp(rho/1.225,.25,1)*clamp((2.35-body.mach)/.65,.15,1);
    const tilt=body.vector*.50,thrust=boostedThrust/spec.mass+(body.engine*(body.type==='needle'?1+.60*body.deploy:body.type==='sail'?1-body.deploy:1)+1.05*sprint)*fullThrust(spec,speed,rho)/spec.mass;
    const usableThrust=thrust*(.15+.85*c.engine/100);
    const diff=body.vecRoll*.50,swivel=.42*body.vecYaw;
    const axial=Math.cos(tilt)*Math.cos(diff);
    const along=usableThrust*axial*Math.cos(swivel)*(1-.67*fan);
    const normal=usableThrust*(.72*fan-Math.sin(tilt)*Math.cos(diff));
    const lateral=-usableThrust*axial*Math.sin(swivel);
    const dynamic=pressureArea/spec.mass,lift=dynamic*liftCoeff*inverseLift,drag=dynamic*dragCoeff,side=-dynamic*.85*slipSin*inverseLift;
    const accelX=lateral*axis.r[0]+along*axis.f[0]+normal*axis.u[0]+lift*liftX-drag*flowX+side*(flowY*liftZ-flowZ*liftY);
    const accelY=lateral*axis.r[1]+along*axis.f[1]+normal*axis.u[1]+lift*liftY-drag*flowY+side*(flowZ*liftX-flowX*liftZ);
    const accelZ=lateral*axis.r[2]+along*axis.f[2]+normal*axis.u[2]+lift*liftZ-drag*flowZ+side*(flowX*liftY-flowY*liftX);
    const authority = clamp(pressureArea / (.6125*spec.area*spec.cruise**2),0,2.8);
    const rates=body.rates,controls=body.controls,inertia=spec.inertia,oldPitch=rates[0],oldYaw=rates[1],oldRoll=rates[2];
    const gain=1-Math.exp(-dt*6),effective=(1-.52*separated)*(.4+.6*c.tail/100),damping=(.18+Math.sqrt(authority))*(body.type==='heron'?1+body.deploy*1.6:1);
    body.pitchTrim=clamp(body.pitchTrim+(command.trim||0)*.18*dt,-.65,.65);
    const feedback=spec.unstable?-(2.9+spec.unstable)*sinAlpha*(1-body.deploy)/spec.pitch:0;
    const pitchDemand=clamp(command.pitch+body.pitchTrim+feedback,-1,1);
    // On a keyboard let go or reverse promptly. Held inputs still reach full travel.
    const release=command.keyboard?1-Math.exp(-dt*15):gain;
    controls[0]=moveSurface(controls[0],pitchDemand,gain,release);
    controls[1]=moveSurface(controls[1],-command.yaw,gain,release);
    controls[2]=moveSurface(controls[2],-command.roll,gain,release);
    rates[0]+=dt*(authority*(controls[0]*spec.pitch*effective+(spec.unstable||-2.9)*sinAlpha)+body.vector*body.engine*(.15+.85*c.engine/100)*(body.type==='aurora'?4.6:7)-1.9*damping*oldPitch-oldYaw*oldRoll*(inertia[2]-inertia[1])/inertia[0]);
    rates[1]+=dt*(authority*(controls[1]*(body.type==='gull'?.77+.89*body.deploy:body.type==='nocturne'?.77+.64*body.deploy:.77)*effective-1.9*slipSin)-1.75*damping*(body.type==='spire'||spec.yawDamper?1+body.deploy:1)*oldYaw-oldRoll*oldPitch*(inertia[0]-inertia[2])/inertia[1]);
    rates[2]+=dt*(authority*(controls[2]*spec.roll*(body.type==='swift'?1+.42*body.deploy:1)*effective+.5*slipSin+.008*(c.leftWing-c.rightWing)+(body.type==='petrel'||spec.rollCoupling?1.8*controls[1]*body.deploy:0))-1.65*damping*oldRoll-oldPitch*oldYaw*(inertia[1]-inertia[0])/inertia[2]);
    if(spec.vector===3){
      const power=dt*body.engine*(.15+.85*c.engine/100);
      rates[1]-=power*body.vecYaw*(21000/inertia[1]);
      rates[2]-=power*body.vecRoll*(15500/inertia[2]);
    }
    if(body.type==='loom')rates[0]-=dt*body.deploy*1.8*oldPitch;
    if((body.type==='rook'||spec.wingLevel) && !command.roll)rates[2]-=dt*body.deploy*(axis.r[1]*2.2+rates[2]*.9);
    const [xx,yy,zz,ww] = body.quat, [pitch,yaw,roll] = body.rates;
    const half=.5*dt,quat=body.quat;
    quat[0]+=half*(ww*pitch+yy*roll-zz*yaw);quat[1]+=half*(ww*yaw+zz*pitch-xx*roll);
    quat[2]+=half*(ww*roll+xx*yaw-yy*pitch);quat[3]-=half*(xx*pitch+yy*yaw+zz*roll);
    const invQuat=1/Math.sqrt(quat[0]**2+quat[1]**2+quat[2]**2+quat[3]**2);
    for(let index=0;index<4;index++)quat[index]*=invQuat;
    vel[0]+=accelX*dt;vel[1]+=(accelY-9.81)*dt;vel[2]+=accelZ*dt;
    for(let index=0;index<3;index++)body.pos[index]+=vel[index]*dt;
    body.alpha = alpha; body.slip = slip; body.stalled = Math.abs(alpha)>spec.stall;
    // Resolve runway contact after force integration on both predictors and the room authority.
    fields.contact(body,command,dt,accelY,terrain);
    if(body.grounded){body.stalled=false;if(speed<2){body.alpha=0;body.slip=0;}}
    body.load=body.grounded?1:(accelX*axis.u[0]+accelY*axis.u[1]+accelZ*axis.u[2])/9.81;
  }
  // Visual travel follows the spooled engine. The lip narrows in dry power
  // and opens again as the game's high-power stage comes in.
  function nozzleOpening(spec,engine,deploy=0){
    const dry=clamp(engine/.72,0,1),wet=clamp((engine-.72)/.28,0,1);
    const boost=Math.max(spec.highPower?wet:0,spec.auxBurner?deploy:0);
    return 1.04-.45*dry*(2-dry)+.68*boost*boost*(3-2*boost);
  }
  function rig(b){return [...b.controls,b.gear,b.vector,b.engine,b.deploy,b.vecYaw,b.vecRoll];}
  return { fleet, canardAngle, nozzleOpening, rig, create, approach, axes, step, density,soundSpeed,thermal,boomMargin,tick: 1/120 };
})();
if (typeof module !== 'undefined') module.exports = Flight;
