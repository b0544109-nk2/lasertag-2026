/* ============================================================
   #ウィンターレーザータグ会2026｜見るページと入力ページの共通部分

   しくみ
   - 読む: Googleスプレッドシートの「記録」タブ（リンクを知っている全員が閲覧可）
   - 書く: Googleフォームに裏で送信 → 「記録」タブに1行ふえる（行は消さない・直さない）
   - 同じ試合・同じチームの行が複数あれば、いちばん新しい行が正
   - ルール・試合順・タイムテーブルは下の DEFAULT_ROWS。ここを書きかえて push する
   ============================================================ */
var LT_CFG = window.LT_CONFIG || {};
var LT_PARAMS = new URLSearchParams(location.search);
var LT = {
  sheetId: LT_PARAMS.get("id") || LT_CFG.sheetId || "",
  form: LT_CFG.form || null,
  demo: LT_PARAMS.has("demo"),
  startAt: "2026-12-13T15:00:00+09:00",
  endAt: "2026-12-13T19:00:00+09:00",
  refreshMs: 30000
};
LT.live = !!(LT.sheetId && LT.form && LT.form.action);   // false のあいだは「おためし」（この端末にだけ保存）

/* 種別ごとの列:
   勝点勝/勝点分/勝点負 | 点
   ルール | 名前 | 説明 | 点数の数えかた | 「少」と書くと数字が小さいほうが勝ち
   チーム | 記号 | 名前 | メンバー | 色      ← 名前とメンバーは入力ページで上書きされる
   試合   | ルール | ホーム | アウェイ       ← スコアは入力ページから。試合の並びは途中で変えない
   予定   | 時刻 | 内容 | 備考 */
var DEFAULT_ROWS = [
  ["勝点勝","3"],["勝点分","1"],["勝点負","0"],
  ["ルール","カウント戦","やられてもすぐ復活。やられた回数が少ないチームの勝ち！","やられた回数","少"],
  ["ルール","陣地戦","フィールドのポールを撃って自分のチームの色に。長く守ったほうが勝ち。","取った陣地"],
  ["ルール","殲滅戦","復活なし。相手を全員たおすか、最後に多く残っていたほうが勝ち。","生き残り"],
  ["チーム","A","","","#35e0ff"],
  ["チーム","B","","","#ff4fa3"],
  ["チーム","C","","","#b6ff3c"],
  ["チーム","D","","","#ffc23c"],
  ["試合","カウント戦","A","B"],["試合","カウント戦","C","D"],["試合","カウント戦","A","C"],
  ["試合","カウント戦","B","D"],["試合","カウント戦","A","D"],["試合","カウント戦","B","C"],
  ["試合","陣地戦","C","D"],["試合","陣地戦","A","B"],["試合","陣地戦","B","D"],
  ["試合","陣地戦","A","C"],["試合","陣地戦","B","C"],["試合","陣地戦","A","D"],
  ["試合","殲滅戦","A","D"],["試合","殲滅戦","B","C"],["試合","殲滅戦","A","B"],
  ["試合","殲滅戦","C","D"],["試合","殲滅戦","B","D"],["試合","殲滅戦","A","C"],
  ["予定","15:00","入場・準備・機材の説明",""],
  ["予定","15:40","カウント戦（6試合）","1試合4分＋入れ替え3分"],
  ["予定","16:22","陣地戦のルール説明",""],
  ["予定","16:27","陣地戦（6試合）","1試合5分＋入れ替え3分"],
  ["予定","17:15","休憩",""],
  ["予定","17:25","殲滅戦のルール説明",""],
  ["予定","17:30","殲滅戦（6試合）","1試合4分＋入れ替え3分"],
  ["予定","18:12","おたのしみ戦","最下位チームがルールを決める"],
  ["予定","18:30","結果発表・写真撮影",""],
  ["予定","19:00","完全退出 → 打ち上げっ！","19:30〜 笑笑"]
];
var DEMO_SCORES = [[12,9],[7,7],[10,14],[8,6],[11,5],[9,13],[2,1],[1,2],[2,0],[1,1],[0,2],[2,1],[3,0],[1,2],[2,2],[0,4],[1,0],[]];

/* ---------- 小道具 ---------- */
function parseCSV(text){
  var rows=[], row=[], cur="", i=0, q=false, c;
  while(i<text.length){
    c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else if(c==='"') q=true;
    else if(c===','){ row.push(cur); cur=""; }
    else if(c==='\n'){ row.push(cur); rows.push(row); row=[]; cur=""; }
    else if(c!=='\r') cur+=c;
    i++;
  }
  if(cur!==""||row.length){ row.push(cur); rows.push(row); }
  return rows;
}
function num(v){ v=(v==null?"":String(v)).replace(/[０-９]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-0xFEE0);}).replace(/　/g," ").trim(); if(v===""||!/^\d+$/.test(v)) return null; return Number(v); }
function esc(s){ return (s==null?"":String(s)).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function textOn(hex){ var m=/^#?([0-9a-f]{6})$/i.exec(hex||""); if(!m) return "#fff"; var n=parseInt(m[1],16); return (0.299*(n>>16)+0.587*((n>>8)&255)+0.114*(n&255))>150?"#0b1020":"#fff"; }
function readJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||"null"); return v==null?d:v; }catch(e){ return d; } }
function writeJ(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }

/* ---------- 組み立て：DEFAULT_ROWS に記録（log）を重ねる ---------- */
function build(rows, log){
  var d={ win:3, draw:1, loss:0, rules:[], teams:[], matches:[], plan:[] };
  var fallback=["#35e0ff","#ff4fa3","#b6ff3c","#ffc23c","#a78bfa","#ff8a3c"];
  rows.forEach(function(r){
    var c=r.map(function(x){return (x==null?"":String(x)).trim();}), t=c[0];
    if(t==="勝点勝"&&num(c[1])!=null) d.win=num(c[1]);
    else if(t==="勝点分"&&num(c[1])!=null) d.draw=num(c[1]);
    else if(t==="勝点負"&&num(c[1])!=null) d.loss=num(c[1]);
    else if(t==="ルール"&&c[1]) d.rules.push({name:c[1],desc:c[2]||"",unit:c[3]||"",low:c[4]==="少"});
    else if(t==="チーム"){ var i=d.teams.length; d.teams.push({sym:c[1]||"ABCDEF".charAt(i),name:c[2]||"",members:c[3]||"",color:/^#[0-9a-f]{6}$/i.test(c[4]||"")?c[4]:fallback[i%6]}); }
    else if(t==="試合"&&c[2]&&c[3]) d.matches.push({key:"m"+d.matches.length,rule:c[1]||"",home:c[2],away:c[3],hs:null,as:null,res:null});
    else if(t==="予定"&&c[2]) d.plan.push({time:c[1]||"",what:c[2],memo:c[3]||""});
  });
  d.matches.forEach(function(m){ if(m.rule && !d.rules.some(function(r){return r.name===m.rule;})) d.rules.push({name:m.rule,desc:"",unit:"",low:false}); });

  // 同じ（種類・キー）は時刻 t がいちばん新しい行だけを使う。届いた順は問わない
  var newest={};
  (log||[]).forEach(function(e){
    if(!e||!e.body||(e.kind!=="score"&&e.kind!=="team")) return;
    var k=e.kind+"|"+e.key, t=Number(e.body.t)||0;
    if(!newest[k]||t>=newest[k].t) newest[k]={t:t,e:e};
  });
  Object.keys(newest).forEach(function(k){
    var e=newest[k].e, b=e.body;
    if(e.kind==="team"){
      var tm=d.teams.filter(function(x){return x.sym===e.key;})[0];
      if(tm){ tm.name=String(b.name||"").slice(0,20); tm.members=String(b.members||"").slice(0,300); }
    }else{
      var m=d.matches.filter(function(x){return x.key===e.key;})[0];
      if(m){
        if(b.clear){ m.hs=null; m.as=null; m.res=null; }
        else if(num(b.h)!=null&&num(b.a)!=null){ m.hs=num(b.h); m.as=num(b.a); m.res=judge(d,m); }
        else if(b.w==="h"||b.w==="a"||b.w==="d"){ m.hs=null; m.as=null; m.res=b.w; }   // スコアなしで勝ち負けだけ
      }
    }
  });
  if(LT.demo) d.matches.forEach(function(m,i){ var s=DEMO_SCORES[i]||[]; if(m.res==null&&s.length){ m.hs=s[0]; m.as=s[1]; m.res=judge(d,m); } });
  return d;
}
function team(d,sym){ for(var i=0;i<d.teams.length;i++) if(d.teams[i].sym===sym) return d.teams[i]; return {sym:sym,name:"",color:"#555"}; }
function pill(d,sym,withName){ var t=team(d,sym); var lbl=esc(sym)+(withName&&t.name?"："+esc(t.name):""); return '<span class="tag" style="background:'+t.color+';color:'+textOn(t.color)+'">'+lbl+'</span>'; }
function played(m){ return m.res!=null; }
function ruleOf(d,name){ return d.rules.filter(function(r){return r.name===name;})[0]||{name:name,desc:"",unit:"",low:false}; }
/* h=ホームの勝ち a=アウェイの勝ち d=引き分け。「少」のルールは数字が小さいほうが勝ち */
function judge(d,m){ if(m.hs===m.as) return "d"; var hi=m.hs>m.as; if(ruleOf(d,m.rule).low) hi=!hi; return hi?"h":"a"; }
function standings(d, matches){
  var st={};
  d.teams.forEach(function(t){ st[t.sym]={sym:t.sym,w:0,d:0,l:0}; });
  matches.forEach(function(m){
    if(!played(m)||!st[m.home]||!st[m.away]) return;
    if(m.res==="h"){ st[m.home].w++; st[m.away].l++; } else if(m.res==="a"){ st[m.away].w++; st[m.home].l++; } else { st[m.home].d++; st[m.away].d++; }
  });
  var arr=Object.keys(st).map(function(k){ var x=st[k]; x.pts=x.w*d.win+x.d*d.draw+x.l*d.loss; x.played=x.w+x.d+x.l; return x; });
  arr.sort(function(a,b){ return b.pts-a.pts || b.w-a.w || a.sym.localeCompare(b.sym); });
  return arr;
}

/* ---------- 読む ---------- */
var LT_CACHE="lt26.cache."+(LT.sheetId||"local"), LT_PENDING="lt26.pending."+(LT.sheetId||"local");
async function fetchLog(){
  var u="https://docs.google.com/spreadsheets/d/"+LT.sheetId+"/gviz/tq?tqx=out:csv&sheet="+encodeURIComponent("記録")+"&_="+Date.now();
  var res=await fetch(u,{cache:"no-store"});
  if(!res.ok) throw new Error("HTTP "+res.status);
  var text=await res.text();
  if(/^\s*</.test(text)) throw new Error("シートを読めません（共有設定を確認）");
  return parseCSV(text).slice(1).map(function(r){
    var body=null; try{ body=JSON.parse(r[3]||""); }catch(e){}
    if(body&&!body.t){ var t=Date.parse(String(r[0]||"").replace(/\//g,"-")); body.t=isNaN(t)?Date.now():t; }   // 手で足した行は「いま」扱い＝最優先
    return {kind:(r[1]||"").trim(), key:(r[2]||"").trim(), body:body};
  }).filter(function(e){ return e.body && typeof e.body==="object"; });
}
function pendingList(){ return readJ(LT_PENDING,[]); }

/* 結果: {data, stale（最新を読めず手元の控えを表示中）, waiting（まだシートに届いていない件数）} */
async function loadData(){
  var log=[], stale=false;
  if(LT.sheetId){
    try{ log=await fetchLog(); writeJ(LT_CACHE,{at:Date.now(),log:log}); }
    catch(e){ var c=readJ(LT_CACHE,null); log=c?c.log:[]; stale=true; }
  }
  if(LT.live&&!stale) flushPending(log);
  var pend=pendingList();
  return { data:build(DEFAULT_ROWS, log.concat(pend)), stale:stale, waiting:LT.live?pend.length:0 };
}

/* ---------- 書く（入力ページ用） ---------- */
function sendNow(it){
  if(!LT.live||navigator.onLine===false) return false;
  var sink=document.getElementById("ltSink");
  if(!sink){ sink=document.createElement("iframe"); sink.name="ltSink"; sink.id="ltSink"; sink.title="送信用"; sink.style.display="none"; document.body.appendChild(sink); }
  var f=document.createElement("form"); f.action=LT.form.action; f.method="POST"; f.target="ltSink"; f.style.display="none";
  var en=LT.form.entries, vals={kind:it.kind,key:it.key,body:JSON.stringify(it.body)};
  Object.keys(vals).forEach(function(k){ var i=document.createElement("input"); i.type="hidden"; i.name=en[k]; i.value=vals[k]; f.appendChild(i); });
  document.body.appendChild(f); f.submit(); setTimeout(function(){ f.remove(); },4000);
  return true;
}
/* 返事は読めないので待たない。手元に置いてすぐ画面に出し、シートに現れたら手元から消す */
function postEntry(kind,key,body){
  body.t=Date.now(); body.i=Math.random().toString(36).slice(2,10);
  var it={kind:kind,key:key,body:body,sentAt:0};
  if(sendNow(it)) it.sentAt=Date.now();
  var q=pendingList().filter(function(x){ return !(x.kind===kind&&x.key===key); });   // 同じ対象の古い下書きは不要
  q.push(it); writeJ(LT_PENDING,q);
}
function flushPending(log){
  var seen={}; log.forEach(function(e){ if(e.body.i) seen[e.body.i]=1; });
  var q=pendingList().filter(function(it){ return !seen[it.body.i]; });
  q.forEach(function(it,n){
    if(Date.now()-it.sentAt>20000){ it.sentAt=Date.now(); setTimeout(function(){ sendNow(it); }, n*700); }   // 届いていなければ送り直す（同じ行が2回入っても結果は同じ）
  });
  writeJ(LT_PENDING,q);
}
function clearLocal(){ try{ localStorage.removeItem(LT_PENDING); }catch(e){} }
