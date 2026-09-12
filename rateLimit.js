const buckets = new Map();
module.exports = function rateLimit({windowMs=60000,max=120}={}) {
  return (req,res,next)=>{ const key=`${req.ip}:${Math.floor(Date.now()/windowMs)}`; const n=(buckets.get(key)||0)+1; buckets.set(key,n); if(n>max) return res.status(429).json({error:'RATE_LIMITED',request_id:req.id}); next(); };
};
