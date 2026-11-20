const Outfit = (() => {
  const budget=7;
  const flares={capacity:12,burst:3,refill:60,interval:.24};
  const items=[
    {id:'gun',name:'机炮',cost:2,tip:'对准机头自由射击，连射过热后需冷却'},
    {id:'missile',name:'燕尾格斗弹',cost:4,tip:'近距宽圈，捕获快，冷却短'},
    {id:'laser',name:'激光炮',cost:5,tip:'持续锁定'},
    {id:'pulse',name:'共鸣脉冲',cost:3,tip:'向周围释放一圈能量'},
    {id:'prism',name:'折光镜阵',cost:2,tip:'展开 1.6 秒，抵消一次命中；冷却 6.5 秒'},
    {id:'glyph',name:'染光印',cost:3,tip:'给对手所在空域盖章。1.2 秒后仍在光圈内会被染中。'},
    {id:'ribbon',name:'流光远程弹',cost:5,tip:'远距窄圈，近距盲区，蓄锁和冷却较长'},
    {id:'echo',name:'回声浮标',cost:3,tip:'原地留下紫环，1 秒后响起，触及环内所有对手；冷却 5 秒'},
    {id:'arc',name:'跳光链',cost:4,tip:'把目标留在机头圈内 0.9 秒。出圈断链，近处第二架最多受 6 点伤害。冷却 6 秒'}
  ];
  const keys=['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit8','Digit9','Minus'];
  const keyLabel=i=>keys[i]==='Minus'?'−':keys[i].slice(5);
  const bits=new Map(items.map((item,i)=>[item.id,1<<i]));
  function maskOf(...ids){return ids.reduce((mask,id)=>mask|bits.get(id),0);}
  function has(mask,id){return !!(mask&bits.get(id));}
  function cost(mask){return items.reduce((sum,item,i)=>sum+((mask&(1<<i))?item.cost:0),0);}
  function valid(mask){return Number.isInteger(mask)&&mask>0&&mask<(1<<items.length)&&cost(mask)<=budget;}
  function first(mask){return items.find((item,i)=>mask&(1<<i)).id;}
  function describe(mask,active){
    return items.flatMap((item,i)=>has(mask,item.id)?[(active===item.id?'▸ ':'')+keyLabel(i)+' '+item.name]:[]).join('　');
  }
  return {items,keys,keyLabel,budget,flares,has,cost,valid,first,maskOf,describe,standard:3};
})();
if(typeof module!=='undefined')module.exports=Outfit;
