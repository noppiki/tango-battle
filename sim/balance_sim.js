// 対戦バランスのモンテカルロ検証(リファクタ後の回帰確認用)
// 使い方: node sim/balance_sim.js
// 期待値: 55/85+ハンデ→こども約34% / 等実力75→先攻46-48%(45%未満はパリティバグの疑い)
function playGame(a0,a1,adv0,adv1){
  let sc=[adv0,adv1],mir=[false,false],S=[0,0];
  const acc=[a0,a1],adv=[adv0,adv1];
  for(let q=0;q<10;q++){
    const t=q%2,o=1-t;
    if(t===0)S=[sc[0]-adv[0],sc[1]-adv[1]];       // RS: ハンデ除外の実力スコアを凍結
    const eff=S[o]-S[t];
    let m=q>=8?3:1;
    if(m===1){
      if(eff>=40){const r=Math.random();m=r<0.40?3:(r<0.75?2:1);}
      else if(eff>=20){m=Math.random()<0.50?2:1;}
      else{m=Math.random()<0.12?2:1;}
    }
    let useMir=false;
    if(!mir[t]&&eff>=20&&sc[o]>sc[t]){mir[t]=true;useMir=true;}
    if(Math.random()<acc[t]){
      if(useMir)sc[t]+=Math.max(sc[o]-sc[t],0)+20;
      else{let pts=10*m;if(eff>=40)pts+=20;else if(eff>=20)pts+=10;sc[t]+=pts;}
    }else{
      const oL=S[o]>S[t];
      if((!oL||useMir)&&Math.random()<acc[o]){
        let sp=10*m*(useMir?2:1);if(eff>=20)sp+=10;sc[o]+=sp;}
    }
  }
  if(sc[0]===sc[1]){
    const p=(a0*(1-a1))/((a0*(1-a1))+(a1*(1-a0)))||0.5;
    return Math.random()<p?0:1;
  }
  return sc[0]>sc[1]?0:1;
}
function series(a0,a1,useHandi){
  let ls=[0,0],w=0,N=30000;
  for(let g=0;g<N;g++){
    const adv=useHandi?[Math.min(ls[0]*15,45),Math.min(ls[1]*15,45)]:[0,0];
    const winner=playGame(a0,a1,adv[0],adv[1]);
    if(winner===0)w++;
    ls[winner]=0;ls[1-winner]++;
  }
  return (w/N*100).toFixed(1)+"%";
}
console.log("55/85 ハンデあり(期待~34%):", series(0.55,0.85,true));
console.log("75/75 ハンデあり(期待46-48%):", series(0.75,0.75,true));
console.log("80/70 ハンデあり(期待~52%):", series(0.80,0.70,true));
