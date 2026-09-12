const express = require('express');
module.exports = name => { const r=express.Router(); r.get('/', (req,res)=>res.status(501).json({error:'MODULE_NOT_ENABLED',module:name,request_id:req.id})); return r; };
