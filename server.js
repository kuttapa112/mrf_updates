<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>MRF SMS</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#07111f;--panel:rgba(13,25,45,.9);--card:rgba(255,255,255,.06);--border:rgba(255,255,255,.1);--text:#e7edf7;--muted:#90a0ba;--primary:#31d968;--danger:#ef4444;--warning:#f59e0b;--info:#38bdf8}
body{font-family:'Inter',sans-serif;color:var(--text);background:var(--bg);min-height:100vh}
.grid{display:grid;grid-template-columns:240px 1fr 310px;gap:12px;padding:14px;min-height:100vh}
@media(max-width:900px){.grid{grid-template-columns:1fr}.side,.right{position:static!important;max-height:none!important;transform:none!important}}
.glass{background:var(--panel);border:1px solid var(--border);border-radius:20px;backdrop-filter:blur(16px)}
.side{padding:12px;position:sticky;top:14px;max-height:calc(100vh - 28px);overflow-y:auto}
.brand{display:flex;align-items:center;gap:8px;padding:10px;border-radius:14px;background:linear-gradient(135deg,rgba(74,222,128,.15),rgba(56,189,248,.1));margin-bottom:10px}
.brand-m{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-size:18px;font-weight:800;background:linear-gradient(135deg,#31d968,#1fc857);color:#04210f}
.brand h1{font-size:14px;font-weight:800}.brand p{font-size:9px;color:var(--muted)}
.nlabel{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;padding:0 4px;margin-bottom:6px}
.nitem{display:flex;align-items:center;gap:8px;width:100%;padding:9px;border-radius:12px;border:1px solid transparent;background:transparent;color:var(--text);cursor:pointer;font-size:12px;font-weight:600;transition:.2s}
.nitem:hover{background:var(--card);border-color:var(--border)}
.nitem.active{background:rgba(74,222,128,.18);border-color:rgba(74,222,128,.2)}
.nitem svg{width:18px;height:18px;flex-shrink:0}
.ni{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;flex-shrink:0}
.main{padding:14px;overflow-y:auto}
.hero{padding:14px;border-radius:18px;background:radial-gradient(circle at top right,rgba(74,222,128,.15),transparent 30%),var(--card);border:1px solid var(--border);margin-bottom:12px}
.hero h2{font-size:20px;font-weight:800;margin-bottom:4px}.hero p{color:var(--muted);font-size:11px}
.badges{display:flex;gap:5px;margin-top:8px;flex-wrap:wrap}
.badge{padding:4px 8px;border-radius:99px;border:1px solid var(--border);background:var(--card);font-size:10px;font-weight:600}
.toolbar{display:flex;gap:8px;align-items:center;margin-bottom:12px;padding:10px;border-radius:14px;background:var(--card);border:1px solid var(--border)}
.toolbar input{flex:1;background:transparent;border:none;outline:none;color:var(--text);font-size:11px}
.chip{padding:6px 10px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:10px;font-weight:600;cursor:pointer}
.chip.active{border-color:rgba(74,222,128,.25);background:rgba(74,222,128,.14)}
.cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.cc{padding:12px;border-radius:16px;background:linear-gradient(150deg,rgba(255,255,255,.07),rgba(255,255,255,.02));border:1px solid var(--border);transition:.2s}
.cc:hover{transform:translateY(-2px);border-color:rgba(74,222,128,.2)}
.cc-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.cc-flag{width:38px;height:38px;display:grid;place-items:center;font-size:22px;border-radius:12px;background:var(--card);border:1px solid var(--border)}
.cc-avail{padding:3px 6px;border-radius:99px;background:rgba(74,222,128,.12);color:#99f6b4;font-size:8px;font-weight:700;text-transform:uppercase}
.cc-name{font-size:13px;font-weight:700;margin-bottom:2px}.cc-code{color:var(--muted);font-size:10px;margin-bottom:10px}
.cc-price{font-size:20px;font-weight:800;color:var(--primary)}
.btn{border:none;outline:none;cursor:pointer;font-weight:700;font-family:inherit;transition:.2s}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-p{width:100%;padding:10px;border-radius:12px;color:#04210f;background:linear-gradient(135deg,var(--primary),#1fc857);font-size:12px;margin-top:8px}
.btn-s{padding:8px 10px;border-radius:10px;background:var(--card);border:1px solid var(--border);color:var(--text);font-size:11px}
.btn-d{background:linear-gradient(135deg,#fb7185,#ef4444);color:#fff}
.btn-w{background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1f1300}
.btn-i{background:linear-gradient(135deg,#67e8f9,#38bdf8);color:#062132}
.btn-g{width:100%;padding:10px;border-radius:12px;background:#fff;color:#111;border:1px solid #d1d5db;font-size:12px}
.right{padding:12px;position:sticky;top:14px;max-height:calc(100vh - 28px);overflow-y:auto}
.pblock{padding:12px;border-radius:16px;background:var(--card);border:1px solid var(--border);margin-bottom:10px}
.auth-card{padding:12px;border-radius:16px;background:radial-gradient(circle at top left,rgba(74,222,128,.15),transparent 25%),var(--card);border:1px solid var(--border);margin-bottom:10px}
.auth-card h3{font-size:14px;font-weight:800;margin-bottom:3px}.auth-card p{color:var(--muted);font-size:11px}
.aswitch{display:grid;grid-template-columns:1fr 1fr;gap:3px;padding:3px;border-radius:12px;background:var(--card);border:1px solid var(--border);margin:10px 0}
.atab{padding:8px;border-radius:9px;border:none;background:transparent;color:var(--text);font-weight:700;cursor:pointer;font-size:11px}
.atab.active{background:rgba(74,222,128,.15);color:#bcf7d2}
.aform{display:flex;flex-direction:column;gap:6px}
.iwrap{display:flex;align-items:center;gap:6px;padding:9px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,.03)}
.iwrap input{flex:1;border:none;background:transparent;outline:none;color:var(--text);font-size:11px}
.iwrap input::placeholder{color:var(--muted)}
.flink{color:var(--info);font-size:10px;font-weight:600;cursor:pointer;text-align:center;padding:3px 0}
.bal-card{padding:14px;border-radius:16px;background:radial-gradient(circle at top right,rgba(74,222,128,.18),transparent 30%),var(--card);border:1px solid var(--border);margin-bottom:10px}
.bal-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.bal-label{color:var(--muted);font-size:10px}.bal-amt{font-size:28px;font-weight:800;color:var(--primary)}
.bal-chip{padding:4px 6px;border-radius:10px;background:var(--card);border:1px solid var(--border);font-size:9px;font-weight:700}
.acts{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:10px}
.acc-card{padding:12px;border-radius:14px;background:var(--card);border:1px solid var(--border);margin-bottom:10px}
.acc-head{display:flex;justify-content:space-between;align-items:center}
.acc-head h3{font-size:13px}.acc-head p{font-size:10px;color:var(--muted)}
.acc-tog{width:32px;height:32px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:18px;font-weight:800;cursor:pointer}
.arow{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:11px}
.arow:last-child{border:none}.albl{color:var(--muted)}.aval{font-weight:700;text-align:right;word-break:break-all}
.olist{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.oitem{padding:10px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid var(--border)}
.otop{display:flex;justify-content:space-between;margin-bottom:4px;font-size:12px;font-weight:700}
.ost{padding:3px 5px;border-radius:99px;background:rgba(245,158,11,.12);color:#fcd34d;font-size:8px;font-weight:700;text-transform:uppercase}
.onum{font-size:10px;color:var(--muted);margin-bottom:4px;word-break:break-all}
.oacts{display:flex;gap:4px;flex-wrap:wrap}
.mbtn{padding:5px 7px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--text);cursor:pointer;font-size:9px;font-weight:700}
.modal{display:none;position:fixed;inset:0;background:rgba(2,6,23,.6);backdrop-filter:blur(4px);z-index:3000;padding:14px;justify-content:center;align-items:center}
.mcont{width:min(600px,100%);max-height:85vh;overflow:auto;border-radius:20px;background:rgba(17,34,59,.97);border:1px solid var(--border);padding:14px}
.mhead{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
.mhead h3{font-size:18px;font-weight:800}.mhead p{color:var(--muted);font-size:11px;margin-top:2px}
.mx{width:32px;height:32px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:14px;cursor:pointer}
.pwrap{text-align:center;padding:20px 8px}
.ring{width:48px;height:48px;margin:0 auto 10px;border-radius:50%;border:3px solid rgba(255,255,255,.08);border-top-color:var(--primary);animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes su{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
.oh{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;padding:12px;border-radius:16px;background:var(--card);border:1px solid var(--border);margin-bottom:8px}
.obadges{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}
.pill{padding:5px 7px;border-radius:99px;border:1px solid var(--border);background:var(--card);font-size:9px;font-weight:700}
.pill.g{background:#22c55e!important;border-color:#16a34a!important;color:#fff!important}
.onbox{padding:12px;border-radius:16px;background:linear-gradient(135deg,rgba(74,222,128,.1),rgba(56,189,248,.08));border:1px solid rgba(255,255,255,.1);margin-bottom:8px}
.nline{display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap}
.ndisp{font-size:20px;font-weight:800;word-break:break-all}
.tl{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.tlbox{padding:10px;border-radius:14px;background:var(--card);border:1px solid var(--border)}
.tlbox .tlbl{color:var(--muted);font-size:9px;margin-bottom:3px}.tlbox .tval{font-size:16px;font-weight:800}
.otpw{display:flex;align-items:center;gap:8px;padding:10px;border-radius:14px;background:var(--card);border:1px solid var(--border);margin-bottom:8px}
.sring{width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,.08);border-top-color:var(--info);animation:spin .7s linear infinite;flex-shrink:0}
.otpc{display:none;padding:12px;border-radius:16px;background:linear-gradient(135deg,rgba(74,222,128,.14),rgba(56,189,248,.1));border:1px solid rgba(74,222,128,.2);margin-bottom:8px}
.otpc .olbl{color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}
.otpc .oval{font-size:26px;font-weight:800;letter-spacing:.2em}
.bgrp{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:10px}
.bgrp .btn{padding:9px 10px;border-radius:12px;font-size:11px}
.wbtn{width:100%;margin-top:6px;padding:9px 12px;border-radius:12px}
.toast-w{position:fixed;right:12px;bottom:12px;z-index:5000;display:flex;flex-direction:column;gap:5px}
.toast{padding:8px 10px;border-radius:12px;color:#fff;animation:su .2s;font-size:12px}
.toast.ok{background:rgba(34,197,94,.95)}.toast.err{background:rgba(239,68,68,.95)}.toast.inf{background:rgba(56,189,248,.95)}
.pg{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 10px}
.pbox{padding:10px;border-radius:14px;background:var(--card);border:1px solid var(--border)}
.pbox strong{display:block;font-size:11px;margin-bottom:2px}.pbox p{color:var(--muted);font-size:10px}
.dform{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.finput{padding:8px;border:1px dashed var(--border);border-radius:12px;background:rgba(255,255,255,.03)}
.hidden{display:none!important}
.admin{display:none;margin-top:12px;padding:12px;border-radius:16px;background:var(--card);border:1px solid var(--border)}
.admin h3{font-size:14px;font-weight:800;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.abadge{min-width:16px;height:16px;border-radius:99px;display:inline-grid;place-items:center;padding:0 4px;background:linear-gradient(135deg,#fb7185,#ef4444);color:#fff;font-size:8px;font-weight:800}
.agrid{display:grid;gap:10px}
.asec{padding:10px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid var(--border)}
.asec h4{font-size:12px;margin-bottom:6px;font-weight:700}
.acard{padding:8px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid var(--border);margin-bottom:5px;font-size:11px}
.ameta{color:var(--muted);font-size:10px;margin:3px 0 6px}
.aacts{display:flex;gap:4px;flex-wrap:wrap}
.sgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}
.scard{padding:10px;border-radius:14px;background:var(--card);border:1px solid var(--border);text-align:center}
.scard .sv{font-size:18px;font-weight:800;margin-top:3px}.scard .sl{color:var(--muted);font-size:9px}
.hamb{display:none}
@media(max-width:900px){.hamb{display:block;position:fixed;top:12px;left:12px;z-index:2200;width:36px;height:36px;border-radius:10px;border:1px solid var(--border);background:var(--panel);color:var(--text);cursor:pointer;font-size:16px}.side{position:fixed;left:12px;top:12px;bottom:12px;width:min(260px,calc(100vw - 24px));transform:translateX(-120%);transition:.25s;z-index:2200;max-height:none}.side.open{transform:translateX(0)}}
</style>
</head>
<body>
<button class="hamb" id="hamb" onclick="document.getElementById('side').classList.toggle('open')">☰</button>
<div class="grid">
<aside class="side glass" id="side">
<div class="brand"><div class="brand-m">M</div><div><h1>MRF SMS</h1><p>Premium OTP Portal</p></div></div>
<div class="nlabel">Services</div>
<button class="nitem active" data-s="whatsapp" onclick="pickService(this)"><div class="ni" style="background:#25D366"><svg viewBox="0 0 24 24" fill="#fff"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.13.3-.35.44-.52.15-.17.2-.35.1-.52-.1-.15-.42-.53-.67-1.03-.25-.5-.5-.43-.67-.48-.17-.05-.35-.08-.52.08-.2.17-.76.76-.94 1.16-.18.4-.68 1.56-.07 2.73.61 1.17 2.35 3.76 5.08 4.87.71.3 1.26.48 1.69.62.71.22 1.36.19 1.87.12.57-.08 1.76-.72 2.01-1.41.24-.7.24-1.29.17-1.41-.07-.13-.27-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 01-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 01-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 012.89 6.99c0 5.45-4.44 9.89-9.89 9.89m8.41-18.3A11.82 11.82 0 0012.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 005.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 00-3.48-8.41z"/></svg></div>WhatsApp</button>
<button class="nitem" data-s="facebook" onclick="pickService(this)"><div class="ni" style="background:#1877F2"><svg viewBox="0 0 24 24" fill="#fff"><path d="M24 12.07c0-6.63-5.37-12-12-12s-12 5.37-12 12c0 5.99 4.39 10.95 10.13 11.85v-8.38H7.08v-3.47h3.05V9.43c0-3.01 1.79-4.67 4.53-4.67 1.31 0 2.69.24 2.69.24v2.95h-1.51c-1.49 0-1.96.93-1.96 1.87v2.25h3.33l-.53 3.47h-2.8v8.38C19.61 23.03 24 18.06 24 12.07z"/></svg></div>Facebook</button>
<button class="nitem" data-s="instagram" onclick="pickService(this)"><div class="ni" style="background:linear-gradient(45deg,#f09433,#e6683c,#bc1888,#4c68d7)"><svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85 0 3.2-.01 3.58-.07 4.85-.15 3.23-1.67 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07-3.2 0-3.58-.01-4.85-.07-3.25-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.65-.07-4.85 0-3.2.01-3.58.07-4.85.15-3.23 1.67-4.77 4.92-4.92 1.27-.06 1.65-.07 4.85-.07zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12c0 3.26.01 3.67.07 4.95.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24c3.26 0 3.67-.01 4.95-.07 4.36-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95 0-3.26-.01-3.67-.07-4.95-.2-4.36-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 100 12.32 6.16 6.16 0 000-12.32zM12 16a4 4 0 110-8 4 4 0 010 8zm6.41-11.85a1.44 1.44 0 100 2.88 1.44 1.44 0 000-2.88z"/></svg></div>Instagram</button>
<button class="nitem" data-s="snapchat" onclick="pickService(this)"><div class="ni" style="background:#FFFC00"><svg viewBox="0 0 24 24" fill="#000"><path d="M12.2 2C6.6 2 2 6.4 2 11.8c0 1.5.3 3 .8 4.3l-2.4 4.9h4.8c.45 0 .82-.37.82-.82v-2.5c0-.45-.37-.82-.82-.82H9.2c-.45 0-.82.37-.82.82v2.5c0-.45.37-.82-.82-.82h7.2c.45 0 .82-.37.82-.82v-2.65c0-.45-.37-.82-.82-.82H9.18c0-.45.37.82-.82.82v2.65c0 .45.37.82.82.82h7.2c.45 0 .82-.37.82-.82v-2.65c0-.45-.37-.82-.82-.82z"/><circle cx="9.5" cy="14.5" r="1.5"/><circle cx="14.5" cy="14.5" r="1.5"/></svg></div>Snapchat</button>
<button class="nitem" data-s="google" onclick="pickService(this)"><div class="ni" style="background:#fff"><svg viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg></div>Google</button>
<button class="nitem" data-s="tiktok" onclick="pickService(this)"><div class="ni" style="background:#010101"><svg viewBox="0 0 24 24" fill="none"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86-4.48V6.27a8.16 8.16 0 005.58 2.17V4.98a4.85 4.85 0 01-1.09-.18z" fill="#25F4EE"/><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86-4.48V6.27a8.16 8.16 0 005.58 2.17V4.98a4.85 4.85 0 01-1.09-.18z" fill="#FE2C55"/></svg></div>TikTok</button>
</aside>
<main class="main glass">
<div class="hero"><div><h2 id="htitle">Available WhatsApp Numbers</h2><p>Click Buy Number and wait up to 60 seconds.</p><div class="badges"><span class="badge">Auto OTP</span><span class="badge">Manual Check</span><span class="badge">1 Min Lock</span></div></div></div>
<div class="toolbar"><input type="text" id="search" placeholder="Search country..." oninput="renderC()"><span class="chip active" onclick="setFilter('all',this)">All</span><span class="chip" onclick="setFilter('cheap',this)">Budget</span><span class="chip" onclick="setFilter('premium',this)">Premium</span></div>
<h3 style="font-size:14px;font-weight:800;margin-bottom:8px">Number Catalog</h3>
<div class="cgrid" id="clist"></div>
<div class="admin" id="apanel"><h3>Admin Panel <span class="abadge hidden" id="pbadge">0</span></h3><div class="sgrid" id="astats"></div><div class="agrid"><div class="asec"><h4>All Orders</h4><div id="aorders"></div></div><div class="asec"><h4>Pending Transactions</h4><div id="atxs"></div></div></div></div>
</main>
<aside class="right glass">
<div id="loginBox">
<div class="auth-card"><h3>Login / Sign Up</h3><p>Premium OTP service.</p></div>
<div class="aswitch"><button class="atab active" id="ltab" onclick="showLogin()">Login</button><button class="atab" id="rtab" onclick="showReg()">Sign Up</button></div>
<div id="lform" class="pblock"><div class="aform"><div class="iwrap"><span>📧</span><input id="le" placeholder="Email"></div><div class="iwrap"><span>🔐</span><input type="password" id="lp" placeholder="Password"></div><button class="btn btn-p" onclick="doLogin()">Login</button><button class="btn btn-g" onclick="location.href='/api/auth/google'">🔐 Google</button><div class="flink" onclick="showForgot()">Forgot Password?</div></div></div>
<div id="rform" class="pblock hidden"><div class="aform"><div class="iwrap"><span>👤</span><input id="rn" placeholder="Full name"></div><div class="iwrap"><span>📧</span><input id="re" placeholder="Email"></div><div class="iwrap"><span>🔒</span><input type="password" id="rp" placeholder="Password (min 6)"></div><button class="btn btn-p" onclick="doReg()">Create Account</button></div></div>
<div id="fform" class="pblock hidden"><div class="aform"><h3 style="font-size:13px;margin-bottom:4px">Reset Password</h3><div class="iwrap"><span>📧</span><input id="fe" placeholder="Your email"></div><button class="btn btn-p" onclick="doForgot()">Send Link</button><div class="flink" onclick="showLogin()">Back to Login</div></div></div>
</div>
<div id="userBox" class="hidden">
<div class="bal-card"><div class="bal-top"><div><div class="bal-label">Wallet Balance</div><div class="bal-amt" id="ubal">0</div></div><div class="bal-chip">PKR</div></div><div class="acts"><button class="btn btn-p" onclick="document.getElementById('paym').style.display='flex'">Add Money</button><button class="btn btn-s" onclick="doLogout()">Logout</button></div></div>
<div class="acc-card"><div class="acc-head"><div><h3>Account</h3><p>Profile</p></div><button class="acc-tog" onclick="document.getElementById('adet').classList.toggle('hidden');this.innerText=this.innerText==='+'?'−':'+'">+</button></div><div id="adet" class="hidden"><div class="arow"><span class="albl">Name</span><span class="aval" id="aname">-</span></div><div class="arow"><span class="albl">Email</span><span class="aval" id="aemail">-</span></div><div class="arow"><span class="albl">Referral</span><span class="aval" id="aref">-</span></div></div></div>
<div class="pblock"><h3 style="font-size:13px;font-weight:800;margin-bottom:6px">Active Orders</h3><div class="olist" id="olist"></div></div>
</div>
</aside>
</div>

<div class="modal" id="pmodal"><div class="mcont"><div class="pwrap"><div class="ring"></div><h3 style="font-size:18px;font-weight:800;margin-bottom:4px">Searching Number...</h3><p style="color:var(--muted);font-size:11px">Up to 60 seconds. DO NOT close.</p></div></div></div>

<div class="modal" id="paym"><div class="mcont"><div class="mhead"><div><h3>Add Funds</h3></div><button class="mx" onclick="this.closest('.modal').style.display='none'">✕</button></div><div class="pg"><div class="pbox"><strong>🏦 Method</strong><p>Easypaisa</p></div><div class="pbox"><strong>💰 Min</strong><p>150 PKR</p></div><div class="pbox"><strong>📱 Number</strong><p>03439898333</p></div><div class="pbox"><strong>👤 Name</strong><p>Nihayat</p></div></div><form id="fform2" class="dform" enctype="multipart/form-data" onsubmit="submitPay(event)"><div class="iwrap"><span>₨</span><input type="number" name="amount" placeholder="Amount (min 150)" min="150" required></div><div class="finput"><input type="file" name="screenshot" accept="image/*" required style="width:100%;color:var(--text);background:transparent"></div><button type="submit" class="btn btn-p wbtn">Submit</button></form></div></div>

<div class="modal" id="omodal"><div class="mcont">
<div class="mhead"><div><h3>Order Details</h3><p>Auto OTP active.</p></div><button class="mx" onclick="closeOM()">✕</button></div>
<div class="oh"><div><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em">Order</div><div style="font-size:15px;font-weight:800;margin-top:3px" id="otitle">...</div><div class="obadges"><span class="pill g" id="ostatus">ACTIVE</span><span class="pill" id="oprice">0 PKR</span></div></div></div>
<div class="onbox"><div class="nline"><div><div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em">Number</div><div class="ndisp" id="onum">Loading...</div></div><button class="btn btn-s" onclick="copyT(document.getElementById('onum').innerText)">Copy</button></div>
<div class="tl"><div class="tlbox"><div class="tlbl">Expiry</div><div class="tval" id="otimer">25:00</div></div><div class="tlbox"><div class="tlbl">Cancel</div><div class="tval" id="octimer">01:00</div></div></div>
<div class="otpw" id="owait"><div class="sring"></div><div><div style="font-weight:700;font-size:12px">Waiting for OTP...</div><div style="color:var(--muted);font-size:11px">Auto-check every 5s</div></div></div>
<div class="otpc" id="ooc"><div class="olbl">Received OTP</div><div class="oval" id="oov">------</div></div>
<button class="btn btn-i wbtn" onclick="checkOTP()">Check OTP Now</button>
<div class="bgrp" id="obtns"></div>
</div></div>

<div class="toast-w" id="tw"></div>

<script>
function $(id){return document.getElementById(id)}
function toast(m,t,d){t=t||'inf';d=d||3500;var e=document.createElement('div');e.className='toast '+(t==='ok'?'ok':t==='err'?'err':'inf');e.textContent=m;$('tw').appendChild(e);setTimeout(function(){e.remove()},d)}
function fJSON(u,o){o=o||{};return fetch(u,Object.assign({},o,{credentials:'include'})).then(function(r){if(!r.ok)return r.text().then(function(t){throw new Error(t)});return r.json()})}
function copyT(t){if(t&&t!=='Loading...')navigator.clipboard.writeText(t).then(function(){toast('Copied!','ok')}).catch(function(){toast('Copy failed','err')})}
var CU=null,AO=null,OI=null,TI=null,AR=null,LP=0,AC=[],CF='all',CS='whatsapp';
var SM={whatsapp:{l:'WhatsApp',a:'/api/countries'},facebook:{l:'Facebook',a:'/api/facebook/countries'},instagram:{l:'Instagram',a:'/api/instagram/countries'},snapchat:{l:'Snapchat',a:'/api/snapchat/countries'},google:{l:'Google',a:'/api/google/countries'},tiktok:{l:'TikTok',a:'/api/tiktok/countries'}};

function pickService(el){
document.querySelectorAll('.nitem').forEach(function(n){n.classList.remove('active')});
el.classList.add('active');CS=el.dataset.s;var m=SM[CS];
 $('htitle').innerText='Available '+m.l+' Numbers';
AC=[];$('clist').innerHTML='';$('search').value='';CF='all';
document.querySelectorAll('.chip').forEach(function(c){c.classList.remove('active')});
document.querySelector('.chip').classList.add('active');
loadC();$('side').classList.remove('open');
}

function setFilter(f,el){CF=f;document.querySelectorAll('.chip').forEach(function(c){c.classList.remove('active')});el.classList.add('active');renderC()}

function renderC(){
var list=AC.slice();var s=$('search').value.trim().toLowerCase();
if(s)list=list.filter(function(c){return c.name.toLowerCase().indexOf(s)>=0});
if(CF==='cheap')list=list.filter(function(c){return c.price<=250});
if(CF==='premium')list=list.filter(function(c){return c.price>=300});
var ct=$('clist');
if(!list.length){ct.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--muted)">No country found</div>';return}
ct.innerHTML=list.map(function(c){return '<div class="cc"><div class="cc-top"><div class="cc-flag">'+c.flag+'</div><div class="cc-avail">Available</div></div><div class="cc-name">'+c.name+'</div><div class="cc-code">'+c.code+'</div><div class="cc-price">'+c.price+' PKR</div><button class="btn btn-p" onclick="buyNum(\''+c.name+'\','+c.price+','+c.countryId+')">Buy Number</button></div>'}).join('');
}

function loadC(){fJSON(SM[CS].a).then(function(d){AC=d;renderC()}).catch(function(){toast('Load failed','err')})}

function buyNum(name,price,id){
if(!CU){toast('Login first','err');return}
 $('pmodal').style.display='flex';
fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({countryName:name,price:price,countryId:id,service:CS}),credentials:'include'}).then(function(r){
 $('pmodal').style.display='none';
if(!r.ok)return r.text().then(function(t){throw new Error(t)});
return r.json();
}).then(function(d){
toast('Number purchased!','ok');refreshU();openOM(d.id,d.number);
}).catch(function(e){$('pmodal').style.display='none';toast(e.message,'err')});
}

function stopI(){if(OI)clearInterval(OI);if(TI)clearInterval(TI);OI=null;TI=null}

function updVis(o){
 $('otitle').innerText=(o.country||'')+' • '+(o.service_name||'');
 $('ostatus').innerText=(o.order_status||'active').toUpperCase();
 $('oprice').innerText=o.price+' PKR';
 $('onum').innerText=o.phone_number||'Loading...';
if(o.otp_code){$('oov').innerText=o.otp_code;$('ooc').style.display='block';$('owait').style.display='none'}
else{$('ooc').style.display='none';$('owait').style.display='flex'}
updBtns(o);updTimer(o);
}

function updTimer(o){
var n=new Date(),e=new Date(o.expires_at||0),c=new Date(o.cancel_available_at||0);
var ed=Math.max(0,e-n),cd=Math.max(0,c-n);
 $('otimer').innerText=ed<=0?'Expired':Math.floor(ed/60000)+':'+String(Math.floor((ed%60000)/1000)).padStart(2,'0');
 $('octimer').innerText=cd<=0?'Unlocked':Math.floor(cd/60000)+':'+String(Math.floor((cd%60000)/1000)).padStart(2,'0');
}

function updBtns(o){
var b=$('obtns');b.innerHTML='';
if(o.otp_code){b.innerHTML='<button class="btn btn-p" onclick="compO('+o.id+')">Complete</button><button class="btn btn-s" onclick="closeOM()">Close</button><button class="btn btn-i" onclick="copyT(\''+o.otp_code+'\')">Copy OTP</button>';return}
if(o.order_status!=='active'){b.innerHTML='<button class="btn btn-s" onclick="closeOM()">Close</button>';return}
var can=new Date()>=new Date(o.cancel_available_at);
b.innerHTML='<button class="btn btn-w" onclick="replO('+o.id+')">Replace</button><button class="btn btn-d" '+(can?'':'disabled')+' onclick="cancelO('+o.id+')">'+(can?'Cancel':'Locked')+'</button><button class="btn btn-s" onclick="closeOM()">Close</button>';
}

function compO(id){fetch('/api/orders/'+id+'/complete',{method:'POST',credentials:'include'}).then(function(r){if(!r.ok)throw new Error();toast('Completed','ok');closeOM();refreshU()}).catch(function(e){toast(e.message,'err')})}

function replO(id){
if(!confirm('Replace?'))return;
fetch('/api/orders/'+id+'/replace',{method:'POST',credentials:'include'}).then(function(r){if(!r.ok)throw new Error(r.text());return r.json()}).then(function(d){toast('Replaced','ok');openOM(id,d.number);refreshU()}).catch(function(e){toast(e.message,'err')})
}

function cancelO(id){
if(!confirm('Cancel & refund?'))return;
fetch('/api/orders/'+id+'/cancel',{method:'POST',credentials:'include'}).then(function(r){if(!r.ok)throw new Error(r.text());toast('Cancelled','ok');closeOM();refreshU()}).catch(function(e){toast(e.message,'err')})
}

function pollOTP(id){
fJSON('/api/orders/'+id+'/otp').then(function(d){
if(d.received){fJSON('/api/orders/'+id).then(function(o){AO=o;updVis(o);stopI();toast('OTP received!','ok');refreshU()});return true}
if(d.expired){fJSON('/api/orders/'+id).then(function(o){AO=o;updVis(o);stopI();toast('Expired','err');refreshU()});return true}
return false;
}).catch(function(){})
}

function checkOTP(){if(AO)pollOTP(AO.id)}

function openOM(id,num){
if(num)$('onum').innerText=num;
 $('omodal').style.display='flex';stopI();
fJSON('/api/orders/'+id).then(function(o){AO=o;updVis(o);
OI=setInterval(function(){if(AO)pollOTP(AO.id)},5000);
TI=setInterval(function(){if(!AO)return;fJSON('/api/orders/'+AO.id).then(function(u){AO=u;updVis(u);if(new Date()>=new Date(u.expires_at)&&!u.otp_received&&u.order_status==='active'){fetch('/api/orders/'+u.id+'/expire',{method:'POST',credentials:'include'});refreshU()}if(u.otp_code||u.order_status==='cancelled'||u.order_status==='completed')stopI()}).catch(function(){})},1000);
}).catch(function(){toast('Load failed','err')})
}

function closeOM(){$('omodal').style.display='none';stopI();AO=null}

function showLogin(){$('lform').classList.remove('hidden');$('rform').classList.add('hidden');$('fform').classList.add('hidden');$('ltab').classList.add('active');$('rtab').classList.remove('active')}
function showReg(){$('rform').classList.remove('hidden');$('lform').classList.add('hidden');$('fform').classList.add('hidden');$('rtab').classList.add('active');$('ltab').classList.remove('active')}
function showForgot(){$('fform').classList.remove('hidden');$('lform').classList.add('hidden');$('rform').classList.add('hidden')}

function doLogin(){
var e=$('le').value.trim().toLowerCase(),p=$('lp').value;
if(!e||!p)return toast('Fill all fields','err');
fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:p}),credentials:'include'}).then(function(r){if(!r.ok)throw new Error(r.text());return r.json()}).then(function(){toast('Logged in!','ok');$('le').value='';$('lp').value='';checkAuth()}).catch(function(e){toast(e.message,'err')})
}

function doReg(){
var n=$('rn').value.trim(),e=$('re').value.trim().toLowerCase(),p=$('rp').value;
if(!n||!e||!p||p.length<6)return toast('Fill correctly','err');
fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,email:e,password:p}),credentials:'include'}).then(function(r){if(!r.ok)throw new Error(r.text());return r.json()}).then(function(){toast('Created! Login now','ok');showLogin();$('rn').value='';$('re').value='';$('rp').value=''}).catch(function(e){toast(e.message,'err')})
}

function doForgot(){
var e=$('fe').value.trim().toLowerCase();if(!e)return toast('Enter email','err');
fetch('/api/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e}),credentials:'include'}).then(function(r){if(!r.ok)throw new Error(r.text());return r.json()}).then(function(){toast('Link sent','inf');showLogin()}).catch(function(e){toast(e.message,'err')})
}

function doLogout(){fetch('/api/logout',{credentials:'include'}).then(function(){CU=null;$('userBox').classList.add('hidden');$('loginBox').classList.remove('hidden');$('apanel').style.display='none';if(AR)clearInterval(AR);AR=null;stopI();toast('Logged out','ok')})}

function refreshU(){
if(!CU)return;
fJSON('/api/me').then(function(u){CU=u;$('ubal').innerText=u.balance;$('aname').innerText=u.name||'-';$('aemail').innerText=u.email;$('aref').innerText=u.referralCode||'-';
return fJSON('/api/orders');
}).then(function(orders){
var act=orders.filter(function(o){return o.order_status==='active'||o.order_status==='otp_received'});
var ct=$('olist');
if(!act.length){ct.innerHTML='<div style="font-size:10px;color:var(--muted)">No active orders</div>';return}
ct.innerHTML=act.map(function(o){return '<div class="oitem"><div class="otop"><span>'+o.service_type.toUpperCase()+' '+o.country+'</span><span class="ost">'+(o.otp_code?'OTP':'Wait')+'</span></div><div class="onum">'+(o.phone_number||'...')+'</div><div class="oacts"><button class="mbtn" onclick="openOM('+o.id+',\''+(o.phone_number||'')+'\')">View</button>'+(o.phone_number?'<button class="mbtn" onclick="copyT(\''+o.phone_number+'\')">Copy</button>':'')+'</div></div>'}).join('');
if(u.role==='admin'){$('apanel').style.display='block';loadAdmin();if(!AR)AR=setInterval(function(){if(CU&&CU.role==='admin')loadAdmin()},10000)}
else{$('apanel').style.display='none';if(AR){clearInterval(AR);AR=null}}
}).catch(function(){})
}

function checkAuth(){
fJSON('/api/me').then(function(u){CU=u;$('loginBox').classList.add('hidden');$('userBox').classList.remove('hidden');refreshU()}).catch(function(){CU=null;$('loginBox').classList.remove('hidden');$('userBox').classList.add('hidden')})
}

function loadAdmin(){
fJSON('/api/admin/stats').then(function(s){
 $('astats').innerHTML='<div class="scard"><div class="sl">Today Rev</div><div class="sv">'+s.todayRevenue+'</div></div><div class="scard"><div class="sl">Today Orders</div><div class="sv">'+s.todayOrders+'</div></div><div class="scard"><div class="sl">Users</div><div class="sv">'+s.totalUsers+'</div></div><div class="scard"><div class="sl">Active</div><div class="sv">'+s.activeOrders+'</div></div><div class="scard"><div class="sl">Success</div><div class="sv">'+s.todaySuccessRate+'%</div></div><div class="scard"><div class="sl">Profit</div><div class="sv">'+s.totalProfit+'</div></div>';
return fJSON('/api/admin/orders');
}).then(function(orders){
 $('aorders').innerHTML=orders.length?orders.map(function(o){return '<div class="acard"><strong>'+o.user_email+'</strong><div class="ameta">'+o.service_type.toUpperCase()+' '+o.country+' • '+o.price+' PKR • '+(o.phone_number||'N/A')+'</div></div>'}).join(''):'<div style="font-size:10px;color:var(--muted)">None</div>';
return fJSON('/api/admin/transactions');
}).then(function(txs){
var b=$('pbadge');if(txs.length){b.classList.remove('hidden');b.innerText=txs.length}else{b.classList.add('hidden')}
 $('atxs').innerHTML=txs.length?txs.map(function(t){return '<div class="acard"><strong>'+t.user_email+'</strong><div class="ameta">'+t.amount+' PKR</div><div class="aacts"><a href="/uploads/'+t.screenshot+'" target="_blank" class="mbtn">View</a><button class="mbtn" onclick="appTx('+t.id+')">Approve</button><button class="mbtn" onclick="rejTx('+t.id+')">Reject</button></div></div>'}).join(''):'<div style="font-size:10px;color:var(--muted)">None</div>';
}).catch(function(){})
}

function appTx(id){fetch('/api/admin/transactions/'+id+'/approve',{method:'POST',credentials:'include'}).then(function(r){if(!r.ok)throw new Error();toast('Approved','ok');loadAdmin();refreshU()}).catch(function(e){toast(e.message,'err')})}
function rejTx(id){fetch('/api/admin/transactions/'+id+'/reject',{method:'POST',credentials:'include'}).then(function(r){if(!r.ok)throw new Error();toast('Rejected','ok');loadAdmin()}).catch(function(e){toast(e.message,'err')})}

function submitPay(e){
e.preventDefault();var fd=new FormData(e.target);
fetch('/api/add-funds',{method:'POST',body:fd,credentials:'include'}).then(function(r){if(!r.ok)throw new Error(r.text());toast('Submitted','ok');$('paym').style.display='none';e.target.reset()}).catch(function(e){toast(e.message,'err')})
}

document.querySelectorAll('.modal').forEach(function(m){m.addEventListener('click',function(e){if(e.target===m)m.style.display='none'})});

loadC();checkAuth();
</script>
</body>
</html>
