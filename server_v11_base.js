const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json({limit:"100kb"}));

const buckets=new Map();
function simpleLimit(key,windowMs,max){return (req,res,next)=>{const k=key+":"+(req.ip||"");const now=Date.now();let b=buckets.get(k);if(!b||now-b.start>windowMs)b={start:now,count:0};b.count++;buckets.set(k,b);if(b.count>max)return res.status(429).json({error:"Trop de requêtes, réessayez plus tard"});next();};}
const authLimiter=simpleLimit("auth",15*60*1000,30), startLimiter=simpleLimit("start",60*1000,20), webhookLimiter=simpleLimit("webhook",60*1000,120);
app.use("/api/auth",authLimiter);
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_IN_PRODUCTION";
const ADMIN_PHONE = process.env.ADMIN_PHONE || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const PAYOUT_MODE = process.env.PAYOUT_MODE || "manual";
const MTN_PAYOUT_URL = process.env.MTN_PAYOUT_URL || "";
const AIRTEL_PAYOUT_URL = process.env.AIRTEL_PAYOUT_URL || "";

const db = new Database("bezzy_tasks.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  currency TEXT NOT NULL,
  currency_symbol TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS fx_rates (
  base_currency TEXT PRIMARY KEY,
  rates_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  referral_code TEXT UNIQUE NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'user',
  country_code TEXT NOT NULL DEFAULT 'CG',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('game','app')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reward INTEGER NOT NULL,
  campaign_url TEXT NOT NULL,
  target_countries TEXT NOT NULL DEFAULT '*',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS offer_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  offer_id INTEGER NOT NULL,
  clicked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(offer_id) REFERENCES offers(id)
);
CREATE TABLE IF NOT EXISTS offer_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  offer_id INTEGER NOT NULL,
  reward INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TEXT,
  UNIQUE(user_id, offer_id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(offer_id) REFERENCES offers(id)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS payout_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(country_code,name)
);
CREATE TABLE IF NOT EXISTS payout_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  method_id INTEGER NOT NULL,
  account TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_reference TEXT,
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(method_id) REFERENCES payout_methods(id)
);
CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact TEXT,
  website TEXT,
  webhook_key TEXT UNIQUE NOT NULL,
  webhook_secret_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payout_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payout_request_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  provider TEXT,
  provider_reference TEXT,
  status TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(payout_request_id) REFERENCES payout_requests(id)
);
CREATE TABLE IF NOT EXISTS conversion_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  click_id TEXT NOT NULL,
  partner_conversion_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  amount INTEGER,
  currency TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  raw_payload TEXT
);
`);

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(x => x.name === column);
}
if (!hasColumn("users","role")) db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
if (!hasColumn("users","country_code")) db.exec(`ALTER TABLE users ADD COLUMN country_code TEXT NOT NULL DEFAULT 'CG'`);
if (!hasColumn("offers","target_countries")) db.exec(`ALTER TABLE offers ADD COLUMN target_countries TEXT NOT NULL DEFAULT '*'`);
if (!hasColumn("offers","partner_id")) db.exec(`ALTER TABLE offers ADD COLUMN partner_id INTEGER`);
if (!hasColumn("offers","daily_cap")) db.exec(`ALTER TABLE offers ADD COLUMN daily_cap INTEGER NOT NULL DEFAULT 0`);
for (const [col,type] of [["click_id","TEXT"],["ip_hash","TEXT"],["ua_hash","TEXT"],["redirected_at","TEXT"]]) { if(!hasColumn("offer_clicks",col)) db.exec(`ALTER TABLE offer_clicks ADD COLUMN ${col} ${type}`); }
if (!hasColumn("payout_requests","idempotency_key")) db.exec(`ALTER TABLE payout_requests ADD COLUMN idempotency_key TEXT`);
if (!hasColumn("payout_requests","provider")) db.exec(`ALTER TABLE payout_requests ADD COLUMN provider TEXT`);
if (!hasColumn("transactions","balance_after")) db.exec(`ALTER TABLE transactions ADD COLUMN balance_after INTEGER`);




const countrySeed = [
["CG","Congo-Brazzaville","Central Africa","XAF","FCFA"],
["CM","Cameroun","Central Africa","XAF","FCFA"],
["GA","Gabon","Central Africa","XAF","FCFA"],
["CF","République centrafricaine","Central Africa","XAF","FCFA"],
["TD","Tchad","Central Africa","XAF","FCFA"],
["GQ","Guinée équatoriale","Central Africa","XAF","FCFA"],
["CD","RDC","Central Africa","CDF","FC"],
["CI","Côte d’Ivoire","West Africa","XOF","FCFA"],
["SN","Sénégal","West Africa","XOF","FCFA"],
["BF","Burkina Faso","West Africa","XOF","FCFA"],
["BJ","Bénin","West Africa","XOF","FCFA"],
["TG","Togo","West Africa","XOF","FCFA"],
["GN","Guinée","West Africa","GNF","GNF"],
["ML","Mali","West Africa","XOF","FCFA"],
["GH","Ghana","West Africa","GHS","GH₵"],
["NG","Nigeria","West Africa","NGN","₦"],
["SL","Sierra Leone","West Africa","SLE","Le"],
["LR","Liberia","West Africa","LRD","$"],
["KE","Kenya","East Africa","KES","KSh"],
["UG","Ouganda","East Africa","UGX","UGX"],
["RW","Rwanda","East Africa","RWF","FRw"],
["TZ","Tanzanie","East Africa","TZS","TSh"],
["ET","Éthiopie","East Africa","ETB","Br"],
["ZM","Zambie","Southern Africa","ZMW","ZK"],
["ZA","Afrique du Sud","Southern Africa","ZAR","R"],
["MW","Malawi","Southern Africa","MWK","MK"],
["MZ","Mozambique","Southern Africa","MZN","MT"],
["BW","Botswana","Southern Africa","BWP","P"],
["NA","Namibie","Southern Africa","NAD","N$"],
["SZ","Eswatini","Southern Africa","SZL","E"],
["EG","Égypte","North Africa","EGP","E£"],
["MA","Maroc","North Africa","MAD","DH"],
["DZ","Algérie","North Africa","DZD","DA"],
["TN","Tunisie","North Africa","TND","DT"],
["US","États-Unis","Outside Africa","USD","$"],
["CA","Canada","Outside Africa","CAD","$"],
["FR","France","Outside Africa","EUR","€"],
["BE","Belgique","Outside Africa","EUR","€"],
["GB","Royaume-Uni","Outside Africa","GBP","£"],
["DE","Allemagne","Outside Africa","EUR","€"],
["ES","Espagne","Outside Africa","EUR","€"],
["IT","Italie","Outside Africa","EUR","€"]
];
const seedCountry = db.prepare("INSERT OR IGNORE INTO countries(code,name,region,currency,currency_symbol) VALUES(?,?,?,?,?)");
const seedCountries = db.transaction(()=>countrySeed.forEach(x=>seedCountry.run(...x)));
seedCountries();


const payoutSeed = [
["CG","MTN Mobile Money","mobile_money"],["CG","Airtel Money","mobile_money"],
["CM","MTN Mobile Money","mobile_money"],["CM","Orange Money","mobile_money"],
["GA","Airtel Money","mobile_money"],["GA","Moov Money","mobile_money"],
["CI","MTN Money","mobile_money"],["CI","Orange Money","mobile_money"],["CI","Moov Money","mobile_money"],["CI","Wave","mobile_money"],
["SN","Orange Money","mobile_money"],["SN","Wave","mobile_money"],
["BF","Orange Money","mobile_money"],["BF","Moov Money","mobile_money"],
["BJ","MTN Mobile Money","mobile_money"],["BJ","Moov Money","mobile_money"],
["GH","MTN Mobile Money","mobile_money"],["GH","Telecel Cash","mobile_money"],
["KE","M-Pesa","mobile_money"],["KE","Airtel Money","mobile_money"],
["RW","MTN Mobile Money","mobile_money"],["RW","Airtel Money","mobile_money"],
["UG","MTN Mobile Money","mobile_money"],["UG","Airtel Money","mobile_money"],
["TZ","Vodacom M-Pesa","mobile_money"],["TZ","Airtel Money","mobile_money"],["TZ","Tigo Pesa","mobile_money"],
["ZM","MTN Mobile Money","mobile_money"],["ZM","Airtel Money","mobile_money"],["ZM","Zamtel Money","mobile_money"],
["MW","Airtel Money","mobile_money"],["ZA","Bank account","bank"],
["NG","Bank transfer","bank"],["EG","Bank account","bank"],["MA","Bank account","bank"],["TN","Bank account","bank"],["DZ","Bank account","bank"]
];
const ps=db.prepare("INSERT OR IGNORE INTO payout_methods(country_code,name,kind) VALUES(?,?,?)");
db.transaction(()=>payoutSeed.forEach(x=>ps.run(...x)))();


const fxSeed = {
  XAF: {"XAF":1,"XOF":1,"CDF":0.55,"GHS":0.0046,"NGN":2.0,"KES":0.13,"RWF":0.62,"UGX":0.43,"TZS":0.68,"ZMW":0.018,"ZAR":0.00031,"EGP":0.017,"MAD":0.018,"DZD":0.0025,"TND":0.000067,"EUR":0.00152,"GBP":0.00129,"USD":0.00178,"CAD":0.0024},
  XOF: {"XAF":1,"XOF":1,"CDF":0.55,"GHS":0.0046,"NGN":2.0,"KES":0.13,"RWF":0.62,"UGX":0.43,"TZS":0.68,"ZMW":0.018,"ZAR":0.00031,"EGP":0.017,"MAD":0.018,"DZD":0.0025,"TND":0.000067,"EUR":0.00152,"GBP":0.00129,"USD":0.00178,"CAD":0.0024}
};
const fxInsert=db.prepare("INSERT OR REPLACE INTO fx_rates(base_currency,rates_json,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)");
for(const [base,rates] of Object.entries(fxSeed)){
  if(!db.prepare("SELECT base_currency FROM fx_rates WHERE base_currency=?").get(base))
    fxInsert.run(base,JSON.stringify(rates));
}

function makeReferral() {
  return "BZ" + Math.random().toString(36).slice(2,8).toUpperCase();
}
function validUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:";
  } catch { return false; }
}
function tokenFor(user) {
  return jwt.sign({id:user.id, role:user.role}, JWT_SECRET, {expiresIn:"7d"});
}
function auth(req,res,next) {
  const h=req.headers.authorization||"";
  if(!h.startsWith("Bearer ")) return res.status(401).json({error:"Non authentifié"});
  try { req.user=jwt.verify(h.slice(7),JWT_SECRET); next(); }
  catch { return res.status(401).json({error:"Session expirée"}); }
}
function admin(req,res,next) {
  if(req.user?.role!=="admin") return res.status(403).json({error:"Accès administrateur requis"});
  next();
}

if (ADMIN_PHONE && ADMIN_PASSWORD) {
  const existing=db.prepare("SELECT id FROM users WHERE phone=?").get(ADMIN_PHONE);
  if(!existing) {
    const hash=bcrypt.hashSync(ADMIN_PASSWORD,12);
    db.prepare("INSERT INTO users(phone,password_hash,referral_code,role) VALUES(?,?,?,'admin')")
      .run(ADMIN_PHONE,hash,makeReferral());
  } else {
    db.prepare("UPDATE users SET role='admin' WHERE phone=?").run(ADMIN_PHONE);
  }
}

app.post("/api/auth/register",(req,res)=>{
  const {phone,password,country_code="CG"}=req.body||{};
  if(!phone || !password || password.length<6) return res.status(400).json({error:"Téléphone et mot de passe (6 caractères minimum) requis"});
  try {
    const hash=bcrypt.hashSync(password,12);
    const code=makeReferral();
    const country=db.prepare("SELECT code FROM countries WHERE code=? AND active=1").get(country_code);
    if(!country) return res.status(400).json({error:"Pays non disponible"});
    const info=db.prepare("INSERT INTO users(phone,password_hash,referral_code,country_code) VALUES(?,?,?,?)").run(phone.trim(),hash,code,country_code);
    const user=db.prepare("SELECT id,phone,referral_code,balance,total_earned,role,country_code FROM users WHERE id=?").get(info.lastInsertRowid);
    res.json({token:tokenFor(user),user});
  } catch(e) { res.status(409).json({error:"Ce numéro est déjà utilisé"}); }
});

app.post("/api/auth/login",(req,res)=>{
  const {phone,password}=req.body||{};
  const user=db.prepare("SELECT * FROM users WHERE phone=?").get((phone||"").trim());
  if(!user || !bcrypt.compareSync(password||"",user.password_hash)) return res.status(401).json({error:"Identifiants incorrects"});
  res.json({token:tokenFor(user),user:{id:user.id,phone:user.phone,referral_code:user.referral_code,balance:user.balance,total_earned:user.total_earned,role:user.role,country_code:user.country_code}});
});

app.get("/api/me",auth,(req,res)=>{
  const user=db.prepare("SELECT id,phone,referral_code,balance,total_earned,role,country_code FROM users WHERE id=?").get(req.user.id);
  res.json(user);
});

app.get("/api/countries",(req,res)=>{
  res.json(db.prepare("SELECT code,name,region,currency,currency_symbol FROM countries WHERE active=1 ORDER BY name").all());
});
app.get("/api/currency",auth,(req,res)=>{
  const me=db.prepare("SELECT country_code FROM users WHERE id=?").get(req.user.id);
  const c=db.prepare("SELECT * FROM countries WHERE code=?").get(me.country_code);
  const base=(c.currency==="XOF"||c.currency==="XAF")?"XAF":c.currency;
  const fx=db.prepare("SELECT rates_json FROM fx_rates WHERE base_currency=?").get(base);
  res.json({country:c.code,currency:c.currency,symbol:c.currency_symbol,base,display_rates:fx?JSON.parse(fx.rates_json):{}});
});
app.patch("/api/me/country",auth,(req,res)=>{
  const code=(req.body?.country_code||"").toUpperCase();
  if(!db.prepare("SELECT code FROM countries WHERE code=? AND active=1").get(code)) return res.status(400).json({error:"Pays non disponible"});
  db.prepare("UPDATE users SET country_code=? WHERE id=?").run(code,req.user.id);
  res.json({ok:true,country_code:code});
});

app.get("/api/offers",auth,(req,res)=>{
  const me=db.prepare("SELECT country_code FROM users WHERE id=?").get(req.user.id);
  const rows=db.prepare(`
    SELECT o.*, c.status AS completion_status
    FROM offers o
    LEFT JOIN offer_completions c ON c.offer_id=o.id AND c.user_id=?
    WHERE o.active=1 ORDER BY o.id DESC`).all(req.user.id)
    .filter(o => o.target_countries==="*" || o.target_countries.split(",").includes(me.country_code));
  res.json(rows);
});

app.post("/api/offers/:id/start",auth,startLimiter,(req,res)=>{
  const offer=db.prepare("SELECT o.*,p.webhook_key FROM offers o LEFT JOIN partners p ON p.id=o.partner_id WHERE o.id=? AND o.active=1").get(req.params.id);
  if(!offer) return res.status(404).json({error:"Campagne introuvable"});
  const me=db.prepare("SELECT country_code FROM users WHERE id=?").get(req.user.id);
  if(offer.target_countries!=="*" && !offer.target_countries.split(",").includes(me.country_code)) return res.status(403).json({error:"Campagne non disponible dans votre pays"});
  if(offer.daily_cap>0){
    const n=db.prepare("SELECT COUNT(*) n FROM conversion_events ce JOIN offer_clicks oc ON oc.click_id=ce.click_id WHERE oc.offer_id=? AND ce.status='approved' AND date(ce.received_at)=date('now')").get(offer.id).n;
    if(n>=offer.daily_cap) return res.status(409).json({error:"Quota quotidien de cette campagne atteint"});
  }
  const clickId=crypto.randomUUID();
  const ipHash=crypto.createHash("sha256").update(String(req.ip||"")).digest("hex");
  const uaHash=crypto.createHash("sha256").update(String(req.get("user-agent")||"")).digest("hex");
  db.prepare("INSERT INTO offer_clicks(user_id,offer_id,click_id,ip_hash,ua_hash) VALUES(?,?,?,?,?)").run(req.user.id,offer.id,clickId,ipHash,uaHash);
  const url=new URL(offer.campaign_url);
  url.searchParams.set("bz_click_id",clickId);
  url.searchParams.set("bz_user",String(req.user.id));
  url.searchParams.set("bz_offer",String(offer.id));
  if(offer.webhook_key) url.searchParams.set("bz_partner",offer.webhook_key);
  res.json({campaign_url:`/r/${clickId}`, direct_url:url.toString(), click_id:clickId, message:"Clic enregistré. Aucun gain n'est accordé sur un simple clic."});
});

app.get("/r/:clickId",(req,res)=>{
  const row=db.prepare("SELECT oc.*,o.campaign_url,o.active FROM offer_clicks oc JOIN offers o ON o.id=oc.offer_id WHERE oc.click_id=?").get(req.params.clickId);
  if(!row || !row.active) return res.status(404).send("Lien de campagne invalide ou désactivé.");
  db.prepare("UPDATE offer_clicks SET redirected_at=CURRENT_TIMESTAMP WHERE click_id=?").run(req.params.clickId);
  const url=new URL(row.campaign_url);
  url.searchParams.set("bz_click_id",req.params.clickId);
  url.searchParams.set("bz_user",String(row.user_id));
  url.searchParams.set("bz_offer",String(row.offer_id));
  res.redirect(url.toString());
});

app.post("/api/offers/:id/demo-complete",auth,(req,res)=>{
  if(process.env.DEMO_MODE!=="true") return res.status(404).json({error:"Fonction de démonstration désactivée"});
  const offer=db.prepare("SELECT * FROM offers WHERE id=? AND active=1").get(req.params.id);
  if(!offer) return res.status(404).json({error:"Campagne introuvable"});
  // Demo only: never expose this endpoint as the production validation mechanism.
  const exists=db.prepare("SELECT id FROM offer_completions WHERE user_id=? AND offer_id=?").get(req.user.id,offer.id);
  if(exists) return res.status(409).json({error:"Offre déjà validée en démo"});
  const tx=db.transaction(()=>{
    db.prepare("INSERT INTO offer_completions(user_id,offer_id,reward,status,completed_at) VALUES(?,?,?,'demo_validated',CURRENT_TIMESTAMP)")
      .run(req.user.id,offer.id,offer.reward);
    db.prepare("UPDATE users SET balance=balance+?, total_earned=total_earned+? WHERE id=?").run(offer.reward,offer.reward,req.user.id);
    db.prepare("INSERT INTO transactions(user_id,kind,amount,label) VALUES(?,'credit',?,?)")
      .run(req.user.id,offer.reward,`Démo: ${offer.title}`);
  });
  tx();
  res.json({ok:true,message:"Récompense de démonstration ajoutée",balance:db.prepare("SELECT balance FROM users WHERE id=?").get(req.user.id).balance});
});

app.get("/api/history",auth,(req,res)=>{
  res.json(db.prepare("SELECT kind,amount,label,created_at FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 100").all(req.user.id));
});


app.get("/api/payout-methods",auth,(req,res)=>{
  const u=db.prepare("SELECT country_code FROM users WHERE id=?").get(req.user.id);
  res.json(db.prepare("SELECT id,name,kind FROM payout_methods WHERE country_code=? AND active=1 ORDER BY name").all(u.country_code));
});
app.get("/api/payout-requests",auth,(req,res)=>{
  res.json(db.prepare(`
    SELECT p.id,m.name AS method,p.account,p.amount,p.currency,p.status,p.provider_reference,p.admin_note,p.created_at,p.updated_at
    FROM payout_requests p JOIN payout_methods m ON m.id=p.method_id
    WHERE p.user_id=? ORDER BY p.id DESC LIMIT 50`).all(req.user.id));
});
app.post("/api/payout-requests",auth,(req,res)=>{
  const methodId=Number(req.body?.method_id), account=(req.body?.account||"").trim(), amount=Number(req.body?.amount);
  const idempotency=(req.get("Idempotency-Key")||req.body?.idempotency_key||"").trim();
  const u=db.prepare("SELECT balance,country_code FROM users WHERE id=?").get(req.user.id);
  const country=db.prepare("SELECT * FROM countries WHERE code=?").get(u.country_code);
  const method=db.prepare("SELECT * FROM payout_methods WHERE id=? AND country_code=? AND active=1").get(methodId,u.country_code);
  if(!method || !account || !Number.isInteger(amount) || amount<1000) return res.status(400).json({error:"Méthode, compte et montant minimum de 1000 requis"});
  if(amount>u.balance) return res.status(400).json({error:"Solde insuffisant"});
  if(idempotency){const old=db.prepare("SELECT * FROM payout_requests WHERE user_id=? AND idempotency_key=?").get(req.user.id,idempotency); if(old) return res.json({ok:true,request:old,replayed:true});}
  const tx=db.transaction(()=>{
    const info=db.prepare("INSERT INTO payout_requests(user_id,method_id,account,amount,currency,status,idempotency_key,provider) VALUES(?,?,?,?,?,'pending',?,?)")
      .run(req.user.id,methodId,account,amount,country.currency,idempotency||null,method.name.toLowerCase().includes('mtn')?'mtn':method.name.toLowerCase().includes('airtel')?'airtel':null);
    db.prepare("UPDATE users SET balance=balance-? WHERE id=?").run(amount,req.user.id);
    db.prepare("INSERT INTO transactions(user_id,kind,amount,label,balance_after) VALUES(?,'debit',?,?,?)")
      .run(req.user.id,amount,"Retrait demandé",u.balance-amount);
    db.prepare("INSERT INTO payout_events(payout_request_id,event_type,status,message) VALUES(?, 'created','pending','Demande créée; paiement non envoyé automatiquement')").run(info.lastInsertRowid);
    return info.lastInsertRowid;
  });
  const id=tx();
  res.status(201).json({ok:true,request:db.prepare("SELECT * FROM payout_requests WHERE id=?").get(id),message:"Demande enregistrée. Le paiement réel nécessite une intégration fournisseur activée."});
});

app.post("/api/admin/payout-requests/:id/process",auth,admin,async (req,res)=>{
  const id=Number(req.params.id); const p=db.prepare(`SELECT pr.*,m.name method,u.phone FROM payout_requests pr JOIN payout_methods m ON m.id=pr.method_id JOIN users u ON u.id=pr.user_id WHERE pr.id=?`).get(id);
  if(!p) return res.status(404).json({error:"Demande introuvable"});
  if(p.status!=='approved') return res.status(409).json({error:"La demande doit être approuvée avant traitement"});
  const provider=p.provider;
  const endpoint=provider==='mtn'?MTN_PAYOUT_URL:provider==='airtel'?AIRTEL_PAYOUT_URL:'';
  if(PAYOUT_MODE!=='live' || !endpoint){
    db.prepare("INSERT INTO payout_events(payout_request_id,event_type,provider,status,message) VALUES(?,?,?,?,?)").run(id,'process_attempt',provider||'manual','not_configured',`PAYOUT_MODE=${PAYOUT_MODE}; fournisseur/API non configuré`);
    return res.status(503).json({error:"Paiement automatique non configuré",mode:PAYOUT_MODE,provider:provider||null});
  }
  // Provider-specific authentication/payload differs by contract. This endpoint intentionally refuses to guess credentials or API formats.
  return res.status(501).json({error:"Adaptateur fournisseur à configurer avec les identifiants et le contrat API du marchand",provider});
});

app.get("/api/admin/payout-requests/:id/events",auth,admin,(req,res)=>{
  res.json(db.prepare("SELECT * FROM payout_events WHERE payout_request_id=? ORDER BY id DESC").all(req.params.id));
});

app.get("/api/admin/payout-requests",auth,admin,(req,res)=>{
  res.json(db.prepare(`
    SELECT p.*,u.phone AS user_phone,u.country_code,m.name AS method
    FROM payout_requests p JOIN users u ON u.id=p.user_id JOIN payout_methods m ON m.id=p.method_id
    ORDER BY p.id DESC LIMIT 300`).all());
});
app.patch("/api/admin/payout-requests/:id",auth,admin,(req,res)=>{
  const status=req.body?.status, ref=(req.body?.provider_reference||"").trim(), note=(req.body?.admin_note||"").trim();
  if(!["approved","paid","rejected"].includes(status)) return res.status(400).json({error:"Statut invalide"});
  const p=db.prepare("SELECT * FROM payout_requests WHERE id=?").get(req.params.id);
  if(!p || ["paid","rejected"].includes(p.status)) return res.status(409).json({error:"Demande introuvable ou déjà clôturée"});
  if(status==="paid" && p.status!=="approved") return res.status(409).json({error:"Une demande doit être approuvée avant d'être marquée payée"});
  const tx=db.transaction(()=>{
    if(status==="rejected"){
      db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(p.amount,p.user_id);
      db.prepare("INSERT INTO transactions(user_id,kind,amount,label) VALUES(?,'credit',?,?)").run(p.user_id,p.amount,"Remboursement d'un retrait refusé");
    }
    db.prepare("UPDATE payout_requests SET status=?,provider_reference=?,admin_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status,ref,note,p.id);
    db.prepare("INSERT INTO payout_events(payout_request_id,event_type,provider,provider_reference,status,message) VALUES(?,?,?,?,?,?)")
      .run(p.id,'status_change',p.provider,ref||null,status,note||`Statut changé vers ${status}`);
  }); tx();
  res.json({ok:true});
});

app.post("/api/webhooks/partner/:key",webhookLimiter,(req,res)=>{
  const partner=db.prepare("SELECT * FROM partners WHERE webhook_key=? AND status='active'").get(req.params.key);
  if(!partner) return res.status(404).json({error:"Partenaire introuvable"});
  const sig=req.get("x-bezzy-signature")||"";
  const body=JSON.stringify(req.body||{});
  const expected=crypto.createHmac("sha256",String(partner.webhook_secret_hash)).update(body).digest("hex");
  // Prototype: secret is stored as an HMAC key. In production use encrypted secret storage/KMS.
  if(!sig || sig.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return res.status(401).json({error:"Signature invalide"});
  const {click_id,conversion_id,status="approved",amount=null,currency=null}=req.body||{};
  if(!click_id || !conversion_id) return res.status(400).json({error:"click_id et conversion_id requis"});
  const click=db.prepare("SELECT oc.*,o.reward,o.partner_id,o.active,o.title FROM offer_clicks oc JOIN offers o ON o.id=oc.offer_id WHERE oc.click_id=?").get(click_id);
  if(!click || click.partner_id!==partner.id) return res.status(400).json({error:"Clic invalide pour ce partenaire"});
  try {
    const tx=db.transaction(()=>{
      db.prepare("INSERT INTO conversion_events(click_id,partner_conversion_id,status,amount,currency,raw_payload) VALUES(?,?,?,?,?,?)")
        .run(click_id,String(conversion_id),String(status),amount,currency,JSON.stringify(req.body).slice(0,10000));
      if(String(status)==="approved"){
        const exists=db.prepare("SELECT id FROM offer_completions WHERE user_id=? AND offer_id=?").get(click.user_id,click.offer_id);
        if(exists) throw new Error("ALREADY_COMPLETED");
        const u=db.prepare("SELECT balance,total_earned FROM users WHERE id=?").get(click.user_id);
        const newBal=u.balance+click.reward;
        db.prepare("INSERT INTO offer_completions(user_id,offer_id,reward,status,completed_at) VALUES(?,?,?,'approved',CURRENT_TIMESTAMP)").run(click.user_id,click.offer_id,click.reward);
        db.prepare("UPDATE users SET balance=?,total_earned=total_earned+? WHERE id=?").run(newBal,click.reward,click.user_id);
        db.prepare("INSERT INTO transactions(user_id,kind,amount,label) VALUES(?,'credit',?,?)").run(click.user_id,click.reward,`Campagne validée: ${click.title}`);
      }
    }); tx();
  } catch(e){
    if(String(e.message)==="ALREADY_COMPLETED") return res.status(409).json({error:"Conversion déjà créditée pour cet utilisateur et cette campagne"});
    if(String(e.message).includes("UNIQUE")) return res.status(409).json({error:"Conversion déjà reçue"});
    throw e;
  }
  res.json({ok:true});
});


app.get("/api/system/status",auth,admin,(req,res)=>res.json({version:"10.0.0",payout_mode:PAYOUT_MODE,automatic_payout_ready:Boolean(MTN_PAYOUT_URL||AIRTEL_PAYOUT_URL),warning:"Ne pas considérer une demande comme payée sans référence fournisseur vérifiable."}));

// Admin
app.get("/api/admin/partners",auth,admin,(req,res)=>res.json(db.prepare("SELECT id,name,contact,website,status,webhook_key,created_at FROM partners ORDER BY id DESC").all()));
app.post("/api/admin/partners",auth,admin,(req,res)=>{
  const {name,contact="",website=""}=req.body||{}; if(!name) return res.status(400).json({error:"Nom du partenaire requis"});
  const key="bzp_"+crypto.randomBytes(10).toString("hex"); const secret=crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO partners(name,contact,website,webhook_key,webhook_secret_hash) VALUES(?,?,?,?,?)").run(name.trim(),contact.trim(),website.trim(),key,secret);
  res.json({ok:true,webhook_key:key,webhook_secret:secret});
});
app.patch("/api/admin/partners/:id",auth,admin,(req,res)=>{const status=req.body?.status; if(!["active","disabled"].includes(status)) return res.status(400).json({error:"Statut invalide"}); db.prepare("UPDATE partners SET status=? WHERE id=?").run(status,req.params.id); res.json({ok:true});});
app.get("/api/admin/conversions",auth,admin,(req,res)=>res.json(db.prepare(`SELECT ce.*,oc.user_id,oc.offer_id,u.phone,o.title,p.name partner FROM conversion_events ce JOIN offer_clicks oc ON oc.click_id=ce.click_id JOIN users u ON u.id=oc.user_id JOIN offers o ON o.id=oc.offer_id JOIN partners p ON p.id=o.partner_id ORDER BY ce.id DESC LIMIT 300`).all()));
app.patch("/api/admin/conversions/:id",auth,admin,(req,res)=>{
  const status=req.body?.status; if(!["approved","rejected"].includes(status)) return res.status(400).json({error:"Statut invalide"});
  const c=db.prepare(`SELECT ce.*,oc.user_id,oc.offer_id,o.reward,o.title FROM conversion_events ce JOIN offer_clicks oc ON oc.click_id=ce.click_id JOIN offers o ON o.id=oc.offer_id WHERE ce.id=?`).get(req.params.id);
  if(!c || c.status!=="pending") return res.status(409).json({error:"Conversion introuvable ou déjà traitée"});
  const tx=db.transaction(()=>{
    if(status==="approved"){
      const exists=db.prepare("SELECT id FROM offer_completions WHERE user_id=? AND offer_id=?").get(c.user_id,c.offer_id);
      if(exists) throw new Error("ALREADY_COMPLETED");
      db.prepare("INSERT INTO offer_completions(user_id,offer_id,reward,status,completed_at) VALUES(?,?,?,'approved',CURRENT_TIMESTAMP)").run(c.user_id,c.offer_id,c.reward);
      db.prepare("UPDATE users SET balance=balance+?,total_earned=total_earned+? WHERE id=?").run(c.reward,c.reward,c.user_id);
      db.prepare("INSERT INTO transactions(user_id,kind,amount,label) VALUES(?,'credit',?,?)").run(c.user_id,c.reward,`Campagne validée: ${c.title}`);
    }
    db.prepare("UPDATE conversion_events SET status=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(status,c.id);
  });
  try{tx();}catch(e){if(String(e.message)==="ALREADY_COMPLETED")return res.status(409).json({error:"Cette campagne est déjà créditée pour cet utilisateur"});throw e;}
  res.json({ok:true});
});

app.get("/api/admin/stats",auth,admin,(req,res)=>{
  const users=db.prepare("SELECT COUNT(*) n FROM users WHERE role='user'").get().n;
  const offers=db.prepare("SELECT COUNT(*) n FROM offers").get().n;
  const active=db.prepare("SELECT COUNT(*) n FROM offers WHERE active=1").get().n;
  const earned=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM transactions WHERE kind='credit'").get().n;
  const countries=db.prepare("SELECT COUNT(*) n FROM countries WHERE active=1").get().n;
  const partners=db.prepare("SELECT COUNT(*) n FROM partners WHERE status='active'").get().n;
  const pendingConversions=db.prepare("SELECT COUNT(*) n FROM conversion_events WHERE status='pending'").get().n;
  res.json({users,offers,active,earned,countries,partners,pendingConversions});
});
app.get("/api/admin/offers",auth,admin,(req,res)=>res.json(db.prepare("SELECT o.*,p.name partner_name FROM offers o LEFT JOIN partners p ON p.id=o.partner_id ORDER BY o.id DESC").all()));

app.post("/api/admin/offers",auth,admin,(req,res)=>{
  const {type,title,description,reward,campaign_url,target_countries="*",partner_id=null,daily_cap=0}=req.body||{};
  if(!["game","app"].includes(type) || !title || !description || !Number.isInteger(Number(reward)) || Number(reward)<0 || !validUrl(campaign_url))
    return res.status(400).json({error:"Type, titre, description, récompense et lien HTTP/HTTPS valides requis"});
  const targets=target_countries==="*"?"*":String(target_countries).split(",").map(x=>x.trim().toUpperCase()).filter(Boolean).join(",");
  const info=db.prepare("INSERT INTO offers(type,title,description,reward,campaign_url,target_countries,active) VALUES(?,?,?,?,?,?,1)")
    .run(type,title.trim(),description.trim(),Number(reward),campaign_url.trim(),targets);
  res.json(db.prepare("SELECT * FROM offers WHERE id=?").get(info.lastInsertRowid));
});

app.put("/api/admin/offers/:id",auth,admin,(req,res)=>{
  const {type,title,description,reward,campaign_url,active}=req.body||{};
  if(!["game","app"].includes(type) || !title || !description || !Number.isInteger(Number(reward)) || Number(reward)<0 || !validUrl(campaign_url))
    return res.status(400).json({error:"Données de campagne invalides"});
  db.prepare("UPDATE offers SET type=?,title=?,description=?,reward=?,campaign_url=?,active=? WHERE id=?")
    .run(type,title.trim(),description.trim(),Number(reward),campaign_url.trim(),active?1:0,req.params.id);
  res.json(db.prepare("SELECT * FROM offers WHERE id=?").get(req.params.id));
});
app.patch("/api/admin/offers/:id/toggle",auth,admin,(req,res)=>{
  db.prepare("UPDATE offers SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?").run(req.params.id);
  res.json(db.prepare("SELECT * FROM offers WHERE id=?").get(req.params.id));
});

app.get("/api/admin/users",auth,admin,(req,res)=>{
  res.json(db.prepare("SELECT id,phone,balance,total_earned,role,created_at FROM users ORDER BY id DESC LIMIT 200").all());
});

app.get("/admin", (req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.listen(PORT,()=>console.log(`Bezzy Tasks V10 running on http://localhost:${PORT}`));
