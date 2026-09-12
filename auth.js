const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
function requireAuth(req,res,next){
  const h=req.get('Authorization')||'';
  if(!h.startsWith('Bearer ')) return res.status(401).json({error:'UNAUTHORIZED',request_id:req.id});
  try { req.user=jwt.verify(h.slice(7),env.JWT_SECRET); next(); }
  catch { return res.status(401).json({error:'INVALID_TOKEN',request_id:req.id}); }
}
module.exports={requireAuth};
