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
const JWT_SECRET = process.env.JWT_SECRET || "";
const IS_PRODUCTION = String(process.env.NODE_ENV || "").toLowerCase() === "production";
if (IS_PRODUCTION && (!JWT_SECRET || JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET doit être défini et contenir au moins 32 caractères en production.");
}
const ADMIN_PHONE = process.env.ADMIN_PHONE || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const PAYOUT_MODE = process.env.PAYOUT_MODE || "manual";
const MTN_PAYOUT_URL = process.env.MTN_PAYOUT_URL || "";
const AIRTEL_PAYOUT_URL = process.env.AIRTEL_PAYOUT_URL || "";
const MTN_API_KEY = process.env.MTN_API_KEY || "";
const MTN_ACCESS_TOKEN = process.env.MTN_ACCESS_TOKEN || "";
const MTN_WITHDRAWAL_BASE_URL = process.env.MTN_WITHDRAWAL_BASE_URL || "https://preprod.mtn.com/v1";
const PAYOUT_WEBHOOK_SECRET = process.env.PAYOUT_WEBHOOK_SECRET || "";
const PLATFORM_DEFAULT_FEE_PERCENT = Number(process.env.PLATFORM_DEFAULT_FEE_PERCENT || 5);

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
CREATE TABLE IF NOT EXISTS ledger_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL UNIQUE,
  action TEXT NOT NULL DEFAULT 'INSERT',
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(transaction_id) REFERENCES transactions(id)
);
CREATE TRIGGER IF NOT EXISTS transactions_immutable_update
BEFORE UPDATE ON transactions
BEGIN
  SELECT RAISE(ABORT, 'IMMUTABLE_LEDGER_UPDATE');
END;
CREATE TRIGGER IF NOT EXISTS transactions_immutable_delete
BEFORE DELETE ON transactions
BEGIN
  SELECT RAISE(ABORT, 'IMMUTABLE_LEDGER_DELETE');
END;
CREATE TRIGGER IF NOT EXISTS transactions_audit_insert
AFTER INSERT ON transactions
BEGIN
  INSERT INTO ledger_audit(transaction_id, action, snapshot_json)
  VALUES (NEW.id, 'INSERT', json_object(
    'id',NEW.id,'user_id',NEW.user_id,'kind',NEW.kind,'amount',NEW.amount,
    'label',NEW.label,'created_at',NEW.created_at
  ));
END;
CREATE TABLE IF NOT EXISTS payout_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  provider_code TEXT,
  account_label TEXT,
  min_amount INTEGER NOT NULL DEFAULT 1000,
  max_amount INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS provider_callbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_reference TEXT,
  payout_request_id INTEGER,
  status TEXT NOT NULL,
  payload TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider,provider_reference)
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
if (!hasColumn("offers","advertiser_revenue")) db.exec(`ALTER TABLE offers ADD COLUMN advertiser_revenue INTEGER NOT NULL DEFAULT 0`);
if (!hasColumn("offers","revenue_currency")) db.exec(`ALTER TABLE offers ADD COLUMN revenue_currency TEXT`);
for (const [col,type] of [["click_id","TEXT"],["ip_hash","TEXT"],["ua_hash","TEXT"],["redirected_at","TEXT"]]) { if(!hasColumn("offer_clicks",col)) db.exec(`ALTER TABLE offer_clicks ADD COLUMN ${col} ${type}`); }
if (!hasColumn("payout_requests","idempotency_key")) db.exec(`ALTER TABLE payout_requests ADD COLUMN idempotency_key TEXT`);
if (!hasColumn("payout_requests","provider")) db.exec(`ALTER TABLE payout_requests ADD COLUMN provider TEXT`);
if (!hasColumn("payout_methods","provider_code")) db.exec(`ALTER TABLE payout_methods ADD COLUMN provider_code TEXT`);
if (!hasColumn("payout_methods","account_label")) db.exec(`ALTER TABLE payout_methods ADD COLUMN account_label TEXT`);
if (!hasColumn("payout_methods","min_amount")) db.exec(`ALTER TABLE payout_methods ADD COLUMN min_amount INTEGER NOT NULL DEFAULT 1000`);
if (!hasColumn("payout_methods","max_amount")) db.exec(`ALTER TABLE payout_methods ADD COLUMN max_amount INTEGER NOT NULL DEFAULT 0`);

if (!hasColumn("transactions","balance_after")) db.exec(`ALTER TABLE transactions ADD COLUMN balance_after INTEGER`);
if (!hasColumn("users","phone_verified")) db.exec(`ALTER TABLE users ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0`);
if (!hasColumn("users","risk_status")) db.exec(`ALTER TABLE users ADD COLUMN risk_status TEXT NOT NULL DEFAULT 'normal'`);
if (!hasColumn("users","last_payout_at")) db.exec(`ALTER TABLE users ADD COLUMN last_payout_at TEXT`);
if (!hasColumn("payout_methods","fee_fixed")) db.exec(`ALTER TABLE payout_methods ADD COLUMN fee_fixed INTEGER NOT NULL DEFAULT 0`);
if (!hasColumn("payout_methods","fee_percent")) db.exec(`ALTER TABLE payout_methods ADD COLUMN fee_percent REAL NOT NULL DEFAULT 0`);
if (!hasColumn("payout_methods","daily_limit")) db.exec(`ALTER TABLE payout_methods ADD COLUMN daily_limit INTEGER NOT NULL DEFAULT 0`);
if (!hasColumn("payout_methods","monthly_limit")) db.exec(`ALTER TABLE payout_methods ADD COLUMN monthly_limit INTEGER NOT NULL DEFAULT 0`);
db.exec(`CREATE TABLE IF NOT EXISTS verification_codes (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS risk_events (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,kind TEXT NOT NULL,severity TEXT NOT NULL,details TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS financial_adjustments (id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL CHECK(kind IN ('revenue','expense','fee')),amount INTEGER NOT NULL,currency TEXT NOT NULL,reference TEXT,notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS partner_settlements (id INTEGER PRIMARY KEY AUTOINCREMENT,partner_id INTEGER NOT NULL,period_start TEXT NOT NULL,period_end TEXT NOT NULL,amount INTEGER NOT NULL,currency TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',paid_reference TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(partner_id) REFERENCES partners(id));`);






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
["CG","MTN Mobile Money","mobile_money","mtn","Numéro MTN MoMo"],["CG","Airtel Money","mobile_money","airtel","Numéro Airtel Money"],["CG","Virement bancaire","bank","bank","Compte bancaire"],
["CM","MTN Mobile Money","mobile_money","mtn","Numéro MTN MoMo"],["CM","Orange Money","mobile_money","orange","Numéro Orange Money"],["CM","Virement bancaire","bank","bank","Compte bancaire"],
["GA","Airtel Money","mobile_money","airtel","Numéro Airtel Money"],["GA","Moov Money","mobile_money","moov","Numéro Moov Money"],["GA","Virement bancaire","bank","bank","Compte bancaire"],
["CF","Orange Money","mobile_money","orange","Numéro Orange Money"],["CF","MTN Mobile Money","mobile_money","mtn","Numéro MTN MoMo"],["CF","Virement bancaire","bank","bank","Compte bancaire"],
["TD","Virement bancaire","bank","bank","Compte bancaire"],
["GQ","Virement bancaire","bank","bank","Compte bancaire"],
["CD","Airtel Money","mobile_money","airtel","Numéro Airtel Money"],["CD","Vodacom M-Pesa","mobile_money","vodacom","Numéro M-Pesa"],["CD","Orange Money","mobile_money","orange","Numéro Orange Money"],["CD","Virement bancaire","bank","bank","Compte bancaire"],
["CI","MTN Money","mobile_money","mtn","Numéro MTN Money"],["CI","Orange Money","mobile_money","orange","Numéro Orange Money"],["CI","Moov Money","mobile_money","moov","Numéro Moov Money"],["CI","Wave","mobile_money","wave","Numéro Wave"],["CI","Virement bancaire","bank","bank","Compte bancaire"],
["SN","Orange Money","mobile_money","orange","Numéro Orange Money"],["SN","Wave","mobile_money","wave","Numéro Wave"],["SN","Free Money","mobile_money","free","Numéro Free Money"],["SN","Virement bancaire","bank","bank","Compte bancaire"],
["BF","Orange Money","mobile_money","orange","Numéro Orange Money"],["BF","Moov Money","mobile_money","moov","Numéro Moov Money"],["BF","Virement bancaire","bank","bank","Compte bancaire"],
["BJ","MTN Mobile Money","mobile_money","mtn","Numéro MTN MoMo"],["BJ","Moov Money","mobile_money","moov","Numéro Moov Money"],["BJ","Virement bancaire","bank","bank","Compte bancaire"],
["TG","TMoney","mobile_money","togocel","Numéro TMoney"],["TG","Moov Money","mobile_money","moov","Numéro Moov Money"],["TG","Virement bancaire","bank","bank","Compte bancaire"],
["GN","Orange Money","mobile_money","orange","Numéro Orange Money"],["GN","MTN Mobile Money","mobile_money","mtn","Numéro MTN MoMo"],["GN","Virement bancaire","bank","bank","Compte bancaire"],
["ML","Orange Money","mobile_money","orange","Numéro Orange Money"],["ML","Moov Money","mobile_money","moov","Numéro Moov Money"],["ML","Virement bancaire","bank","bank","Compte bancaire"],
["GH","MTN Mobile Money","mobile_money","mtn","Numéro MTN MoMo"],["GH","Telecel Cash","mobile_money","telecel","Numéro Telecel Cash"],["GH","AirtelTigo Money","mobile_money","airteltigo","Numéro AirtelTigo Money"],["GH","Virement bancaire","bank","bank","Compte bancaire"],
["NG","Virement bancaire","bank","bank","Compte bancaire"],["NG","Portefeuille OPay","wallet","opay","Compte OPay"],["NG","Virement vers compte bancaire","bank","bank","Compte bancaire"],
["SL","Orange Money","mobile_money","orange","Numéro Orange Money"],["SL","Africell Money","mobile_money","africell","Numéro Africell Money"],["SL","Virement bancaire","bank","bank","Compte bancaire"],
["LR","Lonestar Cell MTN Mobile Money","mobile_money","mtn","Numéro MTN MoMo"],["LR","Orange Money","mobile_money","orange","Numéro Orange Money"],["LR","Virement bancaire","bank","bank","Compte bancaire"],
["KE","M-Pesa","mobile_money","mpesa","Numéro M-Pesa"],["KE","Airtel Money","mobile_money","airtel","Numéro Airtel Money"],["KE","Virement bancaire","bank","bank","Compte bancaire"],
["UG","MTN Mobile Money","mobile_money","mtn","Numéro MTN MoMo"],["UG","Airtel Money","mobile_money","airtel","Numéro Airtel Money"],["UG","Virement bancaire","bank","bank","Compte bancaire"],
["RW","MTN Mobile Money","mobile_money","mtn","Numéro MTN MoMo"],["RW","Airtel Money","mobile_money","airtel","Numéro Airtel Money"],["RW","Virement bancaire","bank","bank","Compte bancaire"],
["TZ","Vodacom M-Pesa","mobile_money","vodacom","Numéro M-Pesa"],["TZ","Airtel Money","mobile_money","airtel","Numéro Airtel Money"],["TZ","Tigo Pesa","mobile_money","tigo","Numéro Tigo Pesa"],["TZ","Halopesa","mobile_money","halotel","Numéro Halopesa"],["TZ","Virement bancaire","bank","bank","Compte bancaire"],
["ET","Virement bancaire","bank","bank","Compte bancaire"],["ET","Amole Money","mobile_money","amole","Compte Amole"],
["ZM","MTN Mobile Money","mobile_money","mtn","Numéro MTN MoMo"],["ZM","Airtel Money","mobile_money","airtel","Numéro Airtel Money"],["ZM","Zamtel Money","mobile_money","zamtel","Numéro Zamtel Money"],["ZM","Virement bancaire","bank","bank","Compte bancaire"],
["ZA","Compte bancaire","bank","bank","Compte bancaire"],["ZA","1Voucher","wallet","1voucher","Compte 1Voucher"],
["MW","Airtel Money","mobile_money","airtel","Numéro Airtel Money"],["MW","TNM Mpamba","mobile_money","tnm","Numéro TNM Mpamba"],["MW","Compte bancaire","bank","bank","Compte bancaire"],
["MZ","M-Pesa","mobile_money","mpesa","Numéro M-Pesa"],["MZ","e-Mola","mobile_money","emola","Numéro e-Mola"],["MZ","Compte bancaire","bank","bank","Compte bancaire"],
["BW","Compte bancaire","bank","bank","Compte bancaire"],["NA","Compte bancaire","bank","bank","Compte bancaire"],["SZ","MTN Mobile Money","mobile_money","mtn","Numéro MTN MoMo"],["SZ","Compte bancaire","bank","bank","Compte bancaire"],
["EG","Vodafone Cash","mobile_money","vodafone","Numéro Vodafone Cash"],["EG","Orange Cash","mobile_money","orange","Numéro Orange Cash"],["EG","Etisalat Cash","mobile_money","etisalat","Numéro Etisalat Cash"],["EG","Compte bancaire","bank","bank","Compte bancaire"],
["MA","Compte bancaire","bank","bank","Compte bancaire"],["DZ","Compte bancaire","bank","bank","Compte bancaire"],["DZ","Compte CCP","bank","ccp","Compte CCP"],["TN","Compte bancaire","bank","bank","Compte bancaire"],["TN","e-Dinar","wallet","edinar","Compte e-Dinar"],
["US","Compte bancaire","bank","bank","Compte bancaire"],["CA","Compte bancaire","bank","bank","Compte bancaire"],["FR","Compte bancaire / SEPA","bank","sepa","IBAN"],["BE","Compte bancaire / SEPA","bank","sepa","IBAN"],["GB","Compte bancaire","bank","bank","Compte bancaire"],["DE","Compte bancaire / SEPA","bank","sepa","IBAN"],["ES","Compte bancaire / SEPA","bank","sepa","IBAN"],["IT","Compte bancaire / SEPA","bank","sepa","IBAN"]
];
const ps=db.prepare("INSERT OR IGNORE INTO payout_methods(country_code,name,kind,provider_code,account_label) VALUES(?,?,?,?,?)");
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
    res.json({token:tokenFor(user),user,verification_required:true,message:"Compte créé. Vérifiez votre numéro avant un retrait."});
  } catch(e) { res.status(409).json({error:"Ce numéro est déjà utilisé"}); }
});

app.post("/api/auth/login",(req,res)=>{
  const {phone,password}=req.body||{};
  const user=db.prepare("SELECT * FROM users WHERE phone=?").get((phone||"").trim());
  if(!user || !bcrypt.compareSync(password||"",user.password_hash)) return res.status(401).json({error:"Identifiants incorrects"});
  res.json({token:tokenFor(user),user:{id:user.id,phone:user.phone,referral_code:user.referral_code,balance:user.balance,total_earned:user.total_earned,role:user.role,country_code:user.country_code}});
});

app.post("/api/verification/request",auth,(req,res)=>{
  const u=db.prepare("SELECT id,phone FROM users WHERE id=?").get(req.user.id);
  if(!u) return res.status(404).json({error:"Utilisateur introuvable"});
  if(db.prepare("SELECT phone_verified FROM users WHERE id=?").get(u.id).phone_verified) return res.json({ok:true,verified:true});
  const code=String(Math.floor(100000+Math.random()*900000));
  const hash=crypto.createHash("sha256").update(code).digest("hex");
  db.prepare("UPDATE verification_codes SET used=1 WHERE user_id=? AND used=0").run(u.id);
  db.prepare("INSERT INTO verification_codes(user_id,code_hash,expires_at) VALUES(?,?,?)").run(u.id,hash,Date.now()+10*60*1000);
  // No SMS is sent in this build: connect an SMS provider in production. Never log the code.
  res.json({ok:true,message:"Code de vérification généré. Connectez votre fournisseur SMS pour l'envoi réel."});
});
app.post("/api/verification/confirm",auth,(req,res)=>{
  const code=String(req.body?.code||"").trim();
  if(!/^\\d{6}$/.test(code)) return res.status(400).json({error:"Code à 6 chiffres requis"});
  const row=db.prepare("SELECT * FROM verification_codes WHERE user_id=? AND used=0 ORDER BY id DESC LIMIT 1").get(req.user.id);
  if(!row || row.expires_at<Date.now() || row.attempts>=5) return res.status(400).json({error:"Code expiré ou invalide"});
  const hash=crypto.createHash("sha256").update(code).digest("hex");
  db.prepare("UPDATE verification_codes SET attempts=attempts+1 WHERE id=?").run(row.id);
  if(hash!==row.code_hash) return res.status(400).json({error:"Code incorrect"});
  db.transaction(()=>{db.prepare("UPDATE verification_codes SET used=1 WHERE id=?").run(row.id);db.prepare("UPDATE users SET phone_verified=1 WHERE id=?").run(req.user.id);})();
  res.json({ok:true,verified:true});
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

app.get("/api/admin/payout-methods",auth,admin,(req,res)=>{
  res.json(db.prepare(`SELECT pm.*,c.name country_name,c.currency,c.currency_symbol FROM payout_methods pm JOIN countries c ON c.code=pm.country_code ORDER BY c.name,pm.kind,pm.name`).all());
});
app.patch("/api/admin/payout-methods/:id",auth,admin,(req,res)=>{
  const {active,min_amount,max_amount,account_label}=req.body||{};
  const row=db.prepare("SELECT * FROM payout_methods WHERE id=?").get(req.params.id);
  if(!row) return res.status(404).json({error:"Méthode introuvable"});
  db.prepare("UPDATE payout_methods SET active=?,min_amount=?,max_amount=?,account_label=? WHERE id=?").run(active===undefined?row.active:(active?1:0),Number.isInteger(min_amount)?min_amount:row.min_amount,Number.isInteger(max_amount)?max_amount:row.max_amount,account_label??row.account_label,row.id);
  res.json({ok:true,method:db.prepare("SELECT * FROM payout_methods WHERE id=?").get(row.id)});
});

app.get("/api/history",auth,(req,res)=>{
  res.json(db.prepare("SELECT kind,amount,label,created_at FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 100").all(req.user.id));
});


app.get("/api/payout-methods",auth,(req,res)=>{
  const u=db.prepare("SELECT country_code FROM users WHERE id=?").get(req.user.id);
  const country=db.prepare("SELECT code,name,currency,currency_symbol FROM countries WHERE code=?").get(u.country_code);
  const methods=db.prepare("SELECT id,name,kind,provider_code,account_label,min_amount,max_amount FROM payout_methods WHERE country_code=? AND active=1 ORDER BY kind,name").all(u.country_code);
  res.json({country,methods});
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
  const u=db.prepare("SELECT balance,country_code,phone_verified,risk_status FROM users WHERE id=?").get(req.user.id);
  const country=db.prepare("SELECT * FROM countries WHERE code=?").get(u.country_code);
  const method=db.prepare("SELECT * FROM payout_methods WHERE id=? AND country_code=? AND active=1").get(methodId,u.country_code);
  if(!method || !account || !Number.isInteger(amount)) return res.status(400).json({error:"Méthode, compte et montant entier requis"});
  if(!u.phone_verified) return res.status(403).json({error:"Vérifiez votre numéro de téléphone avant de demander un retrait"});
  if(u.risk_status!=='normal') return res.status(403).json({error:"Votre compte est temporairement soumis à une vérification de sécurité"});
  if(amount<method.min_amount) return res.status(400).json({error:`Montant minimum : ${method.min_amount}`});
  if(method.max_amount>0 && amount>method.max_amount) return res.status(400).json({error:`Montant maximum : ${method.max_amount}`});
  if(amount>u.balance) return res.status(400).json({error:"Solde insuffisant"});
  const fee=Math.max(0,Math.round(Number(method.fee_fixed||0)+(amount*Number(method.fee_percent||0)/100)));
  const total=amount+fee;
  if(total>u.balance) return res.status(400).json({error:`Solde insuffisant avec les frais de retrait (${fee})`});
  if(method.daily_limit>0){const d=db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payout_requests WHERE user_id=? AND method_id=? AND status NOT IN ('rejected') AND created_at>=date('now')").get(req.user.id,method.id);if(d.s+amount>method.daily_limit)return res.status(400).json({error:`Limite journalière dépassée : ${method.daily_limit}`});}
  if(method.monthly_limit>0){const d=db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payout_requests WHERE user_id=? AND method_id=? AND status NOT IN ('rejected') AND created_at>=date('now','start of month')").get(req.user.id,method.id);if(d.s+amount>method.monthly_limit)return res.status(400).json({error:`Limite mensuelle dépassée : ${method.monthly_limit}`});}
  if(idempotency){const old=db.prepare("SELECT * FROM payout_requests WHERE user_id=? AND idempotency_key=?").get(req.user.id,idempotency);if(old)return res.json({ok:true,request:old,replayed:true});}
  const tx=db.transaction(()=>{
    const info=db.prepare("INSERT INTO payout_requests(user_id,method_id,account,amount,currency,status,idempotency_key,provider,admin_note) VALUES(?,?,?,?,?,'pending',?,?,?)")
      .run(req.user.id,methodId,account,amount,country.currency,idempotency||null,method.name.toLowerCase().includes('mtn')?'mtn':method.name.toLowerCase().includes('airtel')?'airtel':null,fee?`Frais: ${fee} ${country.currency}`:null);
    db.prepare("UPDATE users SET balance=balance-?,last_payout_at=CURRENT_TIMESTAMP WHERE id=?").run(total,req.user.id);
    db.prepare("INSERT INTO transactions(user_id,kind,amount,label,balance_after) VALUES(?,'debit',?,?,?)").run(req.user.id,total,`Retrait demandé${fee?` + frais ${fee}`:''}`,u.balance-total);
    db.prepare("INSERT INTO payout_events(payout_request_id,event_type,status,message) VALUES(?, 'created','pending',?)").run(info.lastInsertRowid,`Demande créée; montant ${amount}, frais ${fee}; paiement non envoyé automatiquement`);
    return info.lastInsertRowid;
  });
  const id=tx();
  res.status(201).json({ok:true,request:db.prepare("SELECT * FROM payout_requests WHERE id=?").get(id),fee,total_debited:total,message:"Demande enregistrée. Le paiement réel nécessite une intégration fournisseur activée."});
});

app.post("/api/admin/payout-requests/:id/process",auth,admin,async (req,res)=>{
  const id=Number(req.params.id);
  const p=db.prepare(`SELECT pr.*,m.name method,u.phone FROM payout_requests pr JOIN payout_methods m ON m.id=pr.method_id JOIN users u ON u.id=pr.user_id WHERE pr.id=?`).get(id);
  if(!p) return res.status(404).json({error:"Demande introuvable"});
  if(p.status!=='approved') return res.status(409).json({error:"La demande doit être approuvée avant traitement"});
  const provider=p.provider;
  if(provider==='mtn'){
    if(PAYOUT_MODE!=='live' || !MTN_API_KEY || !MTN_ACCESS_TOKEN || !MTN_PAYOUT_URL){
      db.prepare("INSERT INTO payout_events(payout_request_id,event_type,provider,status,message) VALUES(?,?,?,?,?)").run(id,'process_attempt','mtn','not_configured','MTN non configuré: API key/token/URL manquants');
      return res.status(503).json({error:"Connecteur MTN non configuré",provider:"mtn",mode:PAYOUT_MODE});
    }
    // MTN Withdrawals V1 is contract-driven. The exact request schema and credentials are supplied by MTN/MADAPI.
    // We deliberately do not invent the payload. Configure MTN_PAYOUT_URL to your approved endpoint and complete this adapter from the official Swagger/contract.
    return res.status(501).json({error:"Adaptateur MTN à finaliser selon le contrat/Swagger de votre compte marchand",provider:"mtn",base_url:MTN_WITHDRAWAL_BASE_URL});
  }
  if(provider==='airtel'){
    if(PAYOUT_MODE!=='live' || !AIRTEL_PAYOUT_URL){
      db.prepare("INSERT INTO payout_events(payout_request_id,event_type,provider,status,message) VALUES(?,?,?,?,?)").run(id,'process_attempt','airtel','not_configured','Airtel non configuré: URL/API marchande manquante');
      return res.status(503).json({error:"Connecteur Airtel non configuré",provider:"airtel",mode:PAYOUT_MODE});
    }
    return res.status(501).json({error:"Adaptateur Airtel à finaliser selon les accès et le contrat du compte Enterprise",provider:"airtel"});
  }
  return res.status(400).json({error:"Fournisseur de paiement non supporté pour l'instant",provider});
});

app.post("/api/webhooks/payout/:provider",webhookLimiter,(req,res)=>{
  const provider=String(req.params.provider||'').toLowerCase();
  if(!['mtn','airtel'].includes(provider)) return res.status(404).json({error:"Fournisseur non supporté"});
  if(PAYOUT_WEBHOOK_SECRET){
    const sig=req.get('x-bezzy-payout-signature')||'';
    const expected=crypto.createHmac('sha256',PAYOUT_WEBHOOK_SECRET).update(JSON.stringify(req.body||{})).digest('hex');
    if(!sig || sig.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return res.status(401).json({error:'Signature invalide'});
  }
  const payload=req.body||{};
  const providerRef=String(payload.provider_reference||payload.reference||payload.transaction_id||payload.external_id||'').trim();
  const status=String(payload.status||payload.state||'').toLowerCase();
  if(!providerRef || !status) return res.status(400).json({error:'Référence fournisseur et statut requis'});
  const existing=db.prepare('SELECT id FROM provider_callbacks WHERE provider=? AND provider_reference=?').get(provider,providerRef);
  if(existing) return res.json({ok:true,duplicate:true});
  const requestId=Number(payload.payout_request_id||payload.request_id||0)||null;
  db.prepare('INSERT INTO provider_callbacks(provider,provider_reference,payout_request_id,status,payload) VALUES(?,?,?,?,?)').run(provider,providerRef,requestId,status,JSON.stringify(payload).slice(0,15000));
  if(requestId){
    const p=db.prepare('SELECT p.*,m.fee_fixed,m.fee_percent FROM payout_requests p JOIN payout_methods m ON m.id=p.method_id WHERE p.id=?').get(requestId);
    if(p && p.status==='approved' && ['success','successful','completed','paid'].includes(status)){
      db.prepare("UPDATE payout_requests SET status='paid',provider_reference=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(providerRef,requestId);
      db.prepare("INSERT INTO payout_events(payout_request_id,event_type,provider,provider_reference,status,message) VALUES(?,?,?,?,?,?)").run(requestId,'provider_callback',provider,providerRef,'paid','Paiement confirmé par le callback fournisseur');
    } else if(p && ['failed','failure','rejected','cancelled'].includes(status)){
      const tx=db.transaction(()=>{
        const refund=p.amount+Math.max(0,Math.round(Number(p.fee_fixed||0)+(p.amount*Number(p.fee_percent||0)/100)));
        db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(refund,p.user_id);
        db.prepare("INSERT INTO transactions(user_id,kind,amount,label) VALUES(?,'credit',?,?)").run(p.user_id,refund,'Remboursement automatique: paiement fournisseur échoué');
        db.prepare("UPDATE payout_requests SET status='rejected',provider_reference=?,admin_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(providerRef,'Échec confirmé par le fournisseur',requestId);
        db.prepare("INSERT INTO payout_events(payout_request_id,event_type,provider,provider_reference,status,message) VALUES(?,?,?,?,?,?)").run(requestId,'provider_callback',provider,providerRef,'rejected','Paiement échoué; solde remboursé');
      }); tx();
    }
  }
  res.json({ok:true});
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
  const p=db.prepare("SELECT p.*,m.fee_fixed,m.fee_percent FROM payout_requests p JOIN payout_methods m ON m.id=p.method_id WHERE p.id=?").get(req.params.id);
  if(!p || ["paid","rejected"].includes(p.status)) return res.status(409).json({error:"Demande introuvable ou déjà clôturée"});
  if(status==="paid" && p.status!=="approved") return res.status(409).json({error:"Une demande doit être approuvée avant d'être marquée payée"});
  const tx=db.transaction(()=>{
    if(status==="rejected"){
      const refund=p.amount+Math.max(0,Math.round(Number(p.fee_fixed||0)+(p.amount*Number(p.fee_percent||0)/100)));
        db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(refund,p.user_id);
      db.prepare("INSERT INTO transactions(user_id,kind,amount,label) VALUES(?,'credit',?,?)").run(p.user_id,refund,"Remboursement d'un retrait refusé");
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
  const body=Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(req.body||{}));
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


app.get("/api/system/status",auth,admin,(req,res)=>res.json({version:"33.0.0",payout_mode:PAYOUT_MODE,automatic_payout_ready:Boolean(MTN_PAYOUT_URL||AIRTEL_PAYOUT_URL),warning:"Ne pas considérer une demande comme payée sans référence fournisseur vérifiable."}));

// Admin
// V13 security / financial controls
app.get("/api/admin/security/users",auth,admin,(req,res)=>res.json(db.prepare("SELECT id,phone,country_code,balance,phone_verified,risk_status,created_at FROM users ORDER BY id DESC LIMIT 500").all()));
app.patch("/api/admin/security/users/:id",auth,admin,(req,res)=>{const risk=req.body?.risk_status;if(!['normal','review','blocked'].includes(risk))return res.status(400).json({error:'Statut de risque invalide'});db.prepare('UPDATE users SET risk_status=? WHERE id=?').run(risk,req.params.id);db.prepare('INSERT INTO risk_events(user_id,kind,severity,details) VALUES(?,?,?,?)').run(req.params.id,'admin_status_change',risk==='normal'?'low':'high',`Statut: ${risk}`);res.json({ok:true});});
app.patch("/api/admin/users/:id/verify",auth,admin,(req,res)=>{db.prepare('UPDATE users SET phone_verified=1 WHERE id=?').run(req.params.id);res.json({ok:true});});
app.get("/api/admin/risk-events",auth,admin,(req,res)=>res.json(db.prepare('SELECT * FROM risk_events ORDER BY id DESC LIMIT 300').all()));

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
  const pendingPayouts=db.prepare("SELECT COUNT(*) n FROM payout_requests WHERE status='pending'").get().n;
  const paidPayouts=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM payout_requests WHERE status='paid'").get().n;
  const platformRevenue=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM financial_adjustments WHERE kind='revenue'").get().n;
  const platformExpenses=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM financial_adjustments WHERE kind IN ('expense','fee')").get().n;
  res.json({users,offers,active,earned,countries,partners,pendingConversions,pendingPayouts,paidPayouts,platformRevenue,platformExpenses,estimatedNet:platformRevenue-platformExpenses});
});

app.get("/api/admin/finance/summary",auth,admin,(req,res)=>{
  const currency=String(req.query.currency||'XAF').toUpperCase();
  const revenue=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM financial_adjustments WHERE kind='revenue' AND currency=?").get(currency).n;
  const expenses=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM financial_adjustments WHERE kind IN ('expense','fee') AND currency=?").get(currency).n;
  const rewards=db.prepare("SELECT COALESCE(SUM(t.amount),0) n FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.kind='credit'").get().n;
  const withdrawals=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM payout_requests WHERE status='paid' AND currency=?").get(currency).n;
  const fees=db.prepare("SELECT COALESCE(SUM(m.fee_fixed + (p.amount*m.fee_percent/100.0)),0) n FROM payout_requests p JOIN payout_methods m ON m.id=p.method_id WHERE p.status='paid' AND p.currency=?").get(currency).n;
  res.json({currency,revenue,expenses,rewards,withdrawals,fees,netRevenue:revenue-expenses});
});

app.get("/api/admin/finance/ledger",auth,admin,(req,res)=>{
  const rows=db.prepare("SELECT * FROM financial_adjustments ORDER BY id DESC LIMIT 300").all();
  res.json(rows);
});
app.post("/api/admin/finance/adjustments",auth,admin,(req,res)=>{
  const {kind,amount,currency='XAF',reference='',notes=''}=req.body||{};
  if(!['revenue','expense','fee'].includes(kind) || !Number.isInteger(Number(amount)) || Number(amount)<=0 || !/^[A-Z]{3}$/.test(String(currency).toUpperCase())) return res.status(400).json({error:'Données financières invalides'});
  const info=db.prepare("INSERT INTO financial_adjustments(kind,amount,currency,reference,notes) VALUES(?,?,?,?,?)").run(kind,Number(amount),String(currency).toUpperCase(),String(reference).slice(0,120),String(notes).slice(0,500));
  res.status(201).json(db.prepare("SELECT * FROM financial_adjustments WHERE id=?").get(info.lastInsertRowid));
});

app.get("/api/admin/partners/:id/settlements",auth,admin,(req,res)=>res.json(db.prepare("SELECT * FROM partner_settlements WHERE partner_id=? ORDER BY id DESC").all(req.params.id)));
app.post("/api/admin/partners/:id/settlements",auth,admin,(req,res)=>{
  const {period_start,period_end,amount,currency='XAF'}=req.body||{};
  const partner=db.prepare("SELECT id FROM partners WHERE id=?").get(req.params.id);
  if(!partner || !period_start || !period_end || !Number.isInteger(Number(amount)) || Number(amount)<0 || !/^[A-Z]{3}$/.test(String(currency).toUpperCase())) return res.status(400).json({error:'Règlement partenaire invalide'});
  const info=db.prepare("INSERT INTO partner_settlements(partner_id,period_start,period_end,amount,currency) VALUES(?,?,?,?,?)").run(partner.id,String(period_start),String(period_end),Number(amount),String(currency).toUpperCase());
  res.status(201).json(db.prepare("SELECT * FROM partner_settlements WHERE id=?").get(info.lastInsertRowid));
});
app.patch("/api/admin/settlements/:id",auth,admin,(req,res)=>{
  const {status,paid_reference}=req.body||{};
  if(!['pending','paid','cancelled'].includes(status)) return res.status(400).json({error:'Statut invalide'});
  db.prepare("UPDATE partner_settlements SET status=?,paid_reference=? WHERE id=?").run(status,String(paid_reference||'').slice(0,120)||null,req.params.id);
  res.json({ok:true});
});

app.get("/api/admin/offers",auth,admin,(req,res)=>res.json(db.prepare("SELECT o.*,p.name partner_name FROM offers o LEFT JOIN partners p ON p.id=o.partner_id ORDER BY o.id DESC").all()));

app.post("/api/admin/offers",auth,admin,(req,res)=>{
  const {type,title,description,reward,campaign_url,target_countries="*",partner_id=null,daily_cap=0,advertiser_revenue=0,revenue_currency=null}=req.body||{};
  if(!["game","app"].includes(type) || !title || !description || !Number.isInteger(Number(reward)) || Number(reward)<0 || !validUrl(campaign_url))
    return res.status(400).json({error:"Type, titre, description, récompense et lien HTTP/HTTPS valides requis"});
  const targets=target_countries==="*"?"*":String(target_countries).split(",").map(x=>x.trim().toUpperCase()).filter(Boolean).join(",");
  const info=db.prepare("INSERT INTO offers(type,title,description,reward,campaign_url,target_countries,active,partner_id,daily_cap,advertiser_revenue,revenue_currency) VALUES(?,?,?,?,?,?,1,?,?,?,?)")
    .run(type,title.trim(),description.trim(),Number(reward),campaign_url.trim(),targets,partner_id?Number(partner_id):null,Number(daily_cap)||0,Number(advertiser_revenue)||0,revenue_currency?String(revenue_currency).toUpperCase():null);
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
app.listen(PORT,()=>console.log(`Bezzy Tasks V14 running on http://localhost:${PORT}`));
