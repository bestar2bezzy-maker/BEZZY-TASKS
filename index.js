const express = require('express');
const crypto=require('crypto');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const {db}=require('../config/database');
const {env}=require('../config/env');
const {requireAuth}=require('../middleware/auth');
const tasks=require('./tasks');
const wallet=require('./wallet');
const router = express.Router();
router.get('/health', (req,res)=>res.json({service:'bezzy-tasks',version:'33.2.7',status:'ok',request_id:req.id}));
router.get('/version', (req,res)=>res.json({version:'33.2.7',foundation:'V1-V32 + V33.1.1-V33.1.31 + V33.2.1-V33.2.7',status:'staging-ready-auth-reconciled'}));
router.get('/countries',(req,res)=>res.json([
  {code:'CG',name:'Congo (République du Congo)',currency:'XAF'},
  {code:'CD',name:'RDC',currency:'CDF'},
  {code:'CM',name:'Cameroun',currency:'XAF'},
  {code:'GA',name:'Gabon',currency:'XAF'},
  {code:'CI',name:"Côte d’Ivoire",currency:'XOF'},
  {code:'BJ',name:'Bénin',currency:'XOF'}
]));
router.post('/auth/register',(req,res)=>{
  const phone=String(req.body?.phone||'').trim();
  const countryCode=String(req.body?.country_code||'CG').trim().toUpperCase();
  const password=String(req.body?.password||'');
  if(!/^\+?[0-9][0-9 .()-]{6,19}$/.test(phone)||password.length<8) return res.status(400).json({error:'INVALID_CREDENTIALS',request_id:req.id});
  if(!db.prepare('SELECT 1 FROM users WHERE phone=?').get(phone)) {
    const uid=crypto.randomUUID();
    const referral=`BZ${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    db.prepare('INSERT INTO users(id,phone,country_code,referral_code,password_hash) VALUES(?,?,?,?,?)').run(uid,phone,countryCode,referral,bcrypt.hashSync(password,12));
    const token=jwt.sign({sub:uid,role:'USER'},env.JWT_SECRET,{expiresIn:`${env.ACCESS_TOKEN_MINUTES}m`});
    return res.status(201).json({token,access_token:token,expires_in_minutes:env.ACCESS_TOKEN_MINUTES});
  }
  return res.status(409).json({error:'PHONE_EXISTS',request_id:req.id});
});
router.post('/auth/login',(req,res)=>{
  const phone=String(req.body?.phone||'').trim();
  const password=String(req.body?.password||'');
  const u=db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
  if(!u||u.status!=='ACTIVE'||!bcrypt.compareSync(password,u.password_hash)) return res.status(401).json({error:'INVALID_LOGIN',request_id:req.id});
  const token=jwt.sign({sub:u.id,role:u.role},env.JWT_SECRET,{expiresIn:`${env.ACCESS_TOKEN_MINUTES}m`});
  res.json({token,access_token:token,expires_in_minutes:env.ACCESS_TOKEN_MINUTES});
});
router.get('/auth/me',requireAuth,(req,res)=>{
  const u=db.prepare(`SELECT id,phone,country_code,referral_code,role,status,created_at FROM users WHERE id=?`).get(req.user.sub);
  if(!u)return res.status(401).json({error:'USER_NOT_FOUND',request_id:req.id});
  const balance=db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount_minor ELSE -amount_minor END),0) AS v FROM ledger_entries WHERE user_id=?`).get(u.id).v;
  const earned=db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount_minor ELSE 0 END),0) AS v FROM ledger_entries WHERE user_id=?`).get(u.id).v;
  res.json({...u,balance:balance,total_earned:earned});
});
router.get('/me',requireAuth,(req,res)=>{
  const u=db.prepare(`SELECT id,phone,country_code,referral_code,role,status,created_at FROM users WHERE id=?`).get(req.user.sub);
  if(!u)return res.status(401).json({error:'USER_NOT_FOUND',request_id:req.id});
  const balance=db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount_minor ELSE -amount_minor END),0) AS v FROM ledger_entries WHERE user_id=?`).get(u.id).v;
  const earned=db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount_minor ELSE 0 END),0) AS v FROM ledger_entries WHERE user_id=?`).get(u.id).v;
  res.json({...u,balance,total_earned:earned});
});
router.use('/tasks',tasks);
router.use('/wallet',wallet);
router.get('/admin',requireAuth,(req,res)=>{ if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role)) return res.status(403).json({error:'FORBIDDEN',request_id:req.id}); res.json({status:'admin-route-ready'}); });
module.exports = router;
