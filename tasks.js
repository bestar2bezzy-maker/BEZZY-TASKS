const express=require('express');
const crypto=require('crypto');
const {db}=require('../config/database');
const {requireAuth}=require('../middleware/auth');
const router=express.Router();
const id=()=>crypto.randomUUID();
router.get('/',(req,res)=>{
  const rows=db.prepare("SELECT id,title,description,category,reward_minor,currency,status FROM tasks WHERE status='ACTIVE' ORDER BY created_at DESC").all();
  res.json({tasks:rows});
});
router.get('/:taskId',(req,res)=>{
  const row=db.prepare('SELECT id,title,description,category,reward_minor,currency,status,max_completions FROM tasks WHERE id=?').get(req.params.taskId);
  if(!row) return res.status(404).json({error:'TASK_NOT_FOUND',request_id:req.id});
  res.json(row);
});
router.post('/:taskId/start',requireAuth,(req,res)=>{
  const task=db.prepare("SELECT * FROM tasks WHERE id=? AND status='ACTIVE'").get(req.params.taskId);
  if(!task) return res.status(404).json({error:'TASK_NOT_FOUND',request_id:req.id});
  const existing=db.prepare('SELECT * FROM task_completions WHERE task_id=? AND user_id=?').get(task.id,req.user.sub);
  if(existing) return res.json({completion:existing});
  const completion={id:id(),task_id:task.id,user_id:req.user.sub,status:'PENDING'};
  db.prepare('INSERT INTO task_completions(id,task_id,user_id,status) VALUES(?,?,?,?)').run(completion.id,completion.task_id,completion.user_id,completion.status);
  res.status(201).json({completion});
});
router.post('/:taskId/submit',requireAuth,(req,res)=>{
  const c=db.prepare('SELECT * FROM task_completions WHERE task_id=? AND user_id=?').get(req.params.taskId,req.user.sub);
  if(!c) return res.status(404).json({error:'COMPLETION_NOT_STARTED',request_id:req.id});
  if(c.status!=='PENDING') return res.status(409).json({error:'COMPLETION_NOT_SUBMITTABLE',request_id:req.id});
  const evidence=JSON.stringify(req.body?.evidence||{});
  db.prepare("UPDATE task_completions SET status='UNDER_REVIEW',evidence_json=?,submitted_at=CURRENT_TIMESTAMP WHERE id=?").run(evidence,c.id);
  res.json({id:c.id,status:'UNDER_REVIEW'});
});

router.post('/:taskId/review/:completionId',requireAuth,(req,res)=>{
  if(!['ADMIN','SUPER_ADMIN','MODERATOR'].includes(req.user.role)) return res.status(403).json({error:'FORBIDDEN',request_id:req.id});
  const decision=String(req.body?.decision||'').toUpperCase();
  if(!['APPROVED','REJECTED'].includes(decision)) return res.status(400).json({error:'INVALID_DECISION',request_id:req.id});
  const result=db.transaction(()=>{
    const c=db.prepare('SELECT c.*,t.reward_minor,t.currency,t.title FROM task_completions c JOIN tasks t ON t.id=c.task_id WHERE c.id=? AND c.task_id=?').get(req.params.completionId,req.params.taskId);
    if(!c) throw Object.assign(new Error('COMPLETION_NOT_FOUND'),{status:404,code:'COMPLETION_NOT_FOUND'});
    if(c.status!=='UNDER_REVIEW') throw Object.assign(new Error('COMPLETION_ALREADY_REVIEWED'),{status:409,code:'COMPLETION_ALREADY_REVIEWED'});
    if(decision==='REJECTED') {
      db.prepare("UPDATE task_completions SET status='REJECTED',reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(c.id);
      return {status:'REJECTED',rewarded:false};
    }
    const idem=`task-reward:${c.id}`;
    const existing=db.prepare('SELECT id FROM ledger_entries WHERE idempotency_key=?').get(idem);
    if(!existing) db.prepare(`INSERT INTO ledger_entries(id,user_id,entry_type,direction,amount_minor,currency,reference_type,reference_id,idempotency_key,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id(),c.user_id,'TASK_REWARD','CREDIT',c.reward_minor,c.currency,'TASK_COMPLETION',c.id,idem,JSON.stringify({task_id:c.task_id,title:c.title}));
    db.prepare("UPDATE task_completions SET status='APPROVED',reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(c.id);
    return {status:'APPROVED',rewarded:!existing,amount_minor:c.reward_minor,currency:c.currency};
  })();
  res.json({completion_id:req.params.completionId,...result});
});

router.get('/history/me',requireAuth,(req,res)=>{
  const rows=db.prepare(`SELECT c.id,c.task_id,c.status,c.submitted_at,t.title,t.reward_minor,t.currency FROM task_completions c JOIN tasks t ON t.id=c.task_id WHERE c.user_id=? ORDER BY c.submitted_at DESC`).all(req.user.sub);
  res.json({history:rows});
});
module.exports=router;
