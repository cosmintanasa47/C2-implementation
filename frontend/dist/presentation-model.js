// Fixed fictional scenario. No real observations or infrastructure are consumed.
export function sample(t) {
  const a=t/180;
  return {lon:28.800+0.009*Math.sin(a),lat:45.180+0.006*Math.cos(a),t};
}
export function frame(t) {
  return {current:sample(t),history:Array.from({length:100},(_,i)=>sample(t-100+i)),
    forecast:Array.from({length:7},(_,i)=>sample(t+i*5))};
}
