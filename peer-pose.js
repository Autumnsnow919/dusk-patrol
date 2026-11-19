// Frequent pose fields precede optional identity. Names/types stay fixed for a room seat.
const selfFields=[
  'id','type','name','pos','quat','vel','rig','hp','life','kills','deaths','assists','beacons','gunCount','gunning',
  'rates','throttle','engine','service','damaged','pitchTrim','grounded','gear','gearDown','touchdowns','sinkAtTouch',
  'prism','vector','deploy','charge','empty','heat','hot','kit','weapon','refit','beacon','lock','shield','revive',
  'cool','flares','puffs','dodge','diverted','acquire','warned','incoming'
];
const PeerPose={
  // Each reply stands alone. Packet loss and respawn need no baseline or repair delta.
  packSelf(p){return [...selfFields.map(key=>p[key]),p.damaged?p.condition:null,p.star??null];},
  unpackSelf(row,freshCondition){
    const p={};
    for(let i=0;i<selfFields.length;i++)p[selfFields[i]]=row[i];
    p.condition=row[selfFields.length]??freshCondition();
    if(row[selfFields.length+1])p.star=row[selfFields.length+1];
    return p;
  },
  pack(p){return [p.id,p.pos,p.quat,p.vel,p.rig,p.hp,p.life,p.kills,p.deaths,p.assists,p.beacons,p.gunCount,+p.gunning,p.condition];},
  unpack(row,previous){
    const [id,pos,quat,vel,rig,hp,life,kills,deaths,assists,beacons,gunCount,gunning,condition,name,type]=row;
    return {id,pos,quat,vel,rig,hp,life,kills,deaths,assists,beacons,gunCount,gunning:!!gunning,condition,
      name:name??previous?.name,type:type??previous?.type};
  }
};
if(typeof module!=='undefined')module.exports=PeerPose;
