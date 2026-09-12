const express=require('express');
const {db}=require('../config/database');
const {requireAuth}=require('../middleware/auth');
const router=express.Router();
router.get('/',requireAuth,(req,res)=>{
  const row=db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount_minor ELSE -amount_minor END),0) AS balance_minor FROM ledger_entries WHERE user_id=?`).get(req.user.sub);
  const entries=db.prepare('SELECT id,entry_type,direction,amount_minor,currency,reference_type,reference_id,created_at FROM ledger_entries WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(req.user.sub);
  res.json({balance_minor:row.balance_minor,entries});
});
module.exports=router;
