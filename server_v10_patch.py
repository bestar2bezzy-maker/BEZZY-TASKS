from pathlib import Path
p=Path('/mnt/data/v9/server.js')
s=p.read_text()
s=s.replace('const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";','const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";\nconst PAYOUT_MODE = process.env.PAYOUT_MODE || "manual";\nconst MTN_PAYOUT_URL = process.env.MTN_PAYOUT_URL || "";\nconst AIRTEL_PAYOUT_URL = process.env.AIRTEL_PAYOUT_URL || "";')
s=s.replace('CREATE TABLE IF NOT EXISTS conversion_events (', 'CREATE TABLE IF NOT EXISTS payout_events (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  payout_request_id INTEGER NOT NULL,\n  event_type TEXT NOT NULL,\n  provider TEXT,\n  provider_reference TEXT,\n  status TEXT NOT NULL,\n  message TEXT,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY(payout_request_id) REFERENCES payout_requests(id)\n);\nCREATE TABLE IF NOT EXISTS conversion_events (')
# Add idempotency to payout requests if absent
marker='for (const [col,type] of [["click_id","TEXT"],["ip_hash","TEXT"],["ua_hash","TEXT"],["redirected_at","TEXT"]]) { if(!hasColumn("offer_clicks",col)) db.exec(`ALTER TABLE offer_clicks ADD COLUMN ${col} ${type}`); }'
insert=marker+'\nif (!hasColumn("payout_requests","idempotency_key")) db.exec(`ALTER TABLE payout_requests ADD COLUMN idempotency_key TEXT`);\nif (!hasColumn("payout_requests","provider")) db.exec(`ALTER TABLE payout_requests ADD COLUMN provider TEXT`);\nif (!hasColumn("transactions","balance_after")) db.exec(`ALTER TABLE transactions ADD COLUMN balance_after INTEGER`);\n'
s=s.replace(marker,insert)
# Fix transaction inserts balance_after broadly for payout refund and credits is complex; leave column nullable.
# Replace payout post route through exact start/end
start=s.index('app.post("/api/payout-requests",auth,(req,res)=>{')
end=s.index('\napp.get("/api/admin/payout-requests"', start)
new=r'''app.post("/api/payout-requests",auth,(req,res)=>{
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
'''
s=s[:start]+new+s[end:]
# Ensure admin payout status route writes events and prevents paid without approved
old='''  if(!["approved","paid","rejected"].includes(status)) return res.status(400).json({error:"Statut invalide"});
  const p=db.prepare("SELECT * FROM payout_requests WHERE id=?").get(req.params.id);
  if(!p || ["paid","rejected"].includes(p.status)) return res.status(409).json({error:"Demande introuvable ou déjà clôturée"});'''
new2='''  if(!["approved","paid","rejected"].includes(status)) return res.status(400).json({error:"Statut invalide"});
  const p=db.prepare("SELECT * FROM payout_requests WHERE id=?").get(req.params.id);
  if(!p || ["paid","rejected"].includes(p.status)) return res.status(409).json({error:"Demande introuvable ou déjà clôturée"});
  if(status==="paid" && p.status!=="approved") return res.status(409).json({error:"Une demande doit être approuvée avant d'être marquée payée"});'''
s=s.replace(old,new2)
# Add event in transaction after update
needle='''    db.prepare("UPDATE payout_requests SET status=?,provider_reference=?,admin_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status,ref,note,p.id);
  }); tx();'''
replacement='''    db.prepare("UPDATE payout_requests SET status=?,provider_reference=?,admin_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status,ref,note,p.id);
    db.prepare("INSERT INTO payout_events(payout_request_id,event_type,provider,provider_reference,status,message) VALUES(?,?,?,?,?,?)")
      .run(p.id,'status_change',p.provider,ref||null,status,note||`Statut changé vers ${status}`);
  }); tx();'''
s=s.replace(needle,replacement)
# Add health/config endpoint before admin
needle='// Admin\n'
rep='''app.get("/api/system/status",auth,admin,(req,res)=>res.json({version:"10.0.0",payout_mode:PAYOUT_MODE,automatic_payout_ready:Boolean(MTN_PAYOUT_URL||AIRTEL_PAYOUT_URL),warning:"Ne pas considérer une demande comme payée sans référence fournisseur vérifiable."}));\n\n// Admin\n'''
s=s.replace(needle,rep)
s=s.replace('Bezzy Tasks V5 running','Bezzy Tasks V10 running')
p.write_text(s)
