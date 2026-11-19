// Frequent pose fields precede optional identity. Names/types stay fixed for a room seat.
const PeerPose={
  pack(p){return [p.id,p.pos,p.quat,p.vel,p.rig,p.hp,p.life,p.kills,p.deaths,p.assists,p.beacons,p.gunCount,+p.gunning,p.condition];},
  unpack(row,previous){
    const [id,pos,quat,vel,rig,hp,life,kills,deaths,assists,beacons,gunCount,gunning,condition,name,type]=row;
    return {id,pos,quat,vel,rig,hp,life,kills,deaths,assists,beacons,gunCount,gunning:!!gunning,condition,
      name:name??previous?.name,type:type??previous?.type};
  }
};
if(typeof module!=='undefined')module.exports=PeerPose;
