(function(){
"use strict";

var N="#1A3A8F", OR="#F47B20";
var root=document.getElementById("ex15-root");

/* ─── Загрузка pdf-lib с резервными CDN ─────────────────────────────── */
var _lib=null;
function loadPdfLib(){
  if(window.PDFLib) return Promise.resolve(window.PDFLib);
  if(_lib) return _lib;
  var list=window.EX15_PDFLIB_CDNS.slice();
  _lib=new Promise(function(resolve,reject){
    (function next(){
      if(!list.length){ reject(new Error("Не удалось загрузить pdf-lib")); return; }
      var s=document.createElement("script"); s.src=list.shift();
      s.onload=function(){ window.PDFLib ? resolve(window.PDFLib) : next(); };
      s.onerror=next; document.head.appendChild(s);
    })();
  });
  return _lib;
}

/* ─── Состояние ─────────────────────────────────────────────────────── */
function mkP(){return {pasaporte:"",nie1:"",nie2:"",nie3:"",ap1:"",ap2:"",nombre:"",sexo:-1,dd:"",mm:"",yyyy:"",lugar:"",pais:"",nac:"",ec:-1,padre:"",madre:"",dom:"",num:"",piso:"",loc:"",cp:"",prov:"",tel:"",email:""};}
function mkRep(){return {activo:false,nombre:"",doc:"",titulo:""};}
function mkFiler(){return {activo:false,nombre:"",doc:"",dom:"",num:"",piso:"",loc:"",cp:"",prov:"",tel:"",email:""};}
function mkNotif(){return {igual:true,nombre:"",doc:"",dom:"",num:"",piso:"",loc:"",cp:"",prov:"",tel:"",email:""};}

var S={
  tipo:0,            /* 0 NIE · 1 Certificado */
  certTipo:0,        /* 0 de residente · 1 de no residente */
  motivo:0,          /* 0 económicos · 1 profesionales · 2 sociales */
  motivoTxt:"",
  lugar:0,           /* 0 Oficina de Extranjería · 1 Comisaría · 2 Oficina Consular */
  situacion:0,       /* 0 Estancia · 1 Residencia */
  p:mkP(), rep:mkRep(), filer:mkFiler(), notif:mkNotif(),
  noConsultar:false, consentDehu:false,
  idx:0, busy:false, err:"", done:false
};

/* ─── Поток шагов ───────────────────────────────────────────────────── */
var STEPS=["tipo","persona","domicilio","representante","notif","tramite","resumen"];
var LABELS={tipo:"Тип документа",persona:"Личные данные",domicilio:"Адрес в Испании",representante:"Подача и представитель",notif:"Уведомления",tramite:"Основание и место",resumen:"Проверка и PDF"};

function canNext(step){
  var p=S.p;
  if(step==="persona"){
    var nieOk=/^[XYZ]\d{7}[A-Z]$/.test((p.nie1+p.nie2+p.nie3).toUpperCase());
    var dateOk=(+p.dd>=1&&+p.dd<=31&&+p.mm>=1&&+p.mm<=12&&p.yyyy.length===4);
    return !!(p.ap1 && p.nombre && dateOk && p.nac && p.sexo>=0 && p.ec>=0 && (p.pasaporte || nieOk));
  }
  if(step==="domicilio") return !!(p.dom && p.loc);
  if(step==="representante"){
    if(S.filer.activo && !(S.filer.nombre && S.filer.doc)) return false;
    if(S.rep.activo && !(S.rep.nombre && S.rep.doc && S.rep.titulo)) return false;
    return true;
  }
  if(step==="notif"){
    if(S.notif.igual) return true;
    return !!(S.notif.nombre && S.notif.dom && S.notif.loc);
  }
  return true;
}

/* ─── DOM-хелперы (без innerHTML со строками в кавычках) ────────────── */
function el(tag,attrs,kids){
  var e=document.createElement(tag);
  if(tag==="button") e.setAttribute("type","button");
  if(attrs) Object.keys(attrs).forEach(function(k){
    if(k==="style") e.setAttribute("style",attrs[k]);
    else if(k==="onclick") e.onclick=attrs[k];
    else if(k==="oninput") e.oninput=attrs[k];
    else e.setAttribute(k,attrs[k]);
  });
  (kids||[]).forEach(function(c){
    if(c==null||c===false) return;
    e.appendChild(typeof c==="string"?document.createTextNode(c):c);
  });
  return e;
}
function latin(v){ return (v||"").replace(/[^A-Za-z0-9ÑñÁÉÍÓÚÜáéíóúüºª .,\-\/@()]/g,"").toUpperCase(); }

function Inp(o){
  var wrap=el("div",{style:"margin-bottom:12px"});
  var lab=el("div",{style:"font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:"+N+";margin-bottom:4px"},[o.label, o.req?el("span",{style:"color:"+OR},[" *"]):null]);
  wrap.appendChild(lab);
  if(o.hint) wrap.appendChild(el("div",{style:"font-size:12px;color:#888;margin-bottom:4px;line-height:1.4"},[o.hint]));
  var inp=el("input",{type:o.type||"text",placeholder:o.ph||"",
    style:"width:100%;font-size:15px;padding:10px 12px;border-radius:10px;border:1.5px solid "+(o.val?N:"#D1D9E6")+";background:"+(o.val?"#EEF3FF":"#F8F9FF")+";color:#1a1a1a;outline:none;box-sizing:border-box"});
  inp.value=o.val||"";
  inp.oninput=function(e){
    var v=e.target.value;
    if(o.type==="tel") v=v.replace(/[^0-9+\- ]/g,"");
    else if(o.type==="num") v=v.replace(/\D/g,"");
    else if(o.type==="email") v=v.toLowerCase().replace(/[^a-z0-9@._\-]/g,"");
    else v=latin(v);
    if(o.max) v=v.slice(0,o.max);
    e.target.value=v; o.set(v);
    e.target.style.border="1.5px solid "+(v?N:"#D1D9E6");
    e.target.style.background=v?"#EEF3FF":"#F8F9FF";
    refreshNav();
  };
  wrap.appendChild(inp);
  return wrap;
}

function Pills(o){
  var wrap=el("div",{style:"margin-bottom:12px"});
  wrap.appendChild(el("div",{style:"font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:"+N+";margin-bottom:8px"},[o.label]));
  var row=el("div",{style:"display:flex;flex-wrap:wrap;gap:8px"});
  o.opts.forEach(function(pair,i){
    var on=o.val===i;
    row.appendChild(el("button",{style:"font-size:13px;padding:8px 12px;border-radius:10px;cursor:pointer;background:"+(on?N:"#EEF3FF")+";color:"+(on?"#fff":N)+";border:2px solid "+(on?OR:"transparent")+";font-weight:"+(on?700:500),
      onclick:function(){ o.set(i); render(); }},[pair]));
  });
  wrap.appendChild(row);
  return wrap;
}

function Chk(o){
  var box=el("div",{style:"width:20px;height:20px;border-radius:5px;flex-shrink:0;margin-top:2px;border:2px solid "+(o.val?OR:"#CBD5E1")+";background:"+(o.val?OR:"#fff")});
  var wrap=el("div",{style:"display:flex;gap:10px;margin-bottom:12px;cursor:pointer;align-items:flex-start",
    onclick:function(){ o.set(!o.val); render(); }},[box, el("div",{},[
      el("div",{style:"font-size:13px;color:"+N+";font-weight:500;line-height:1.4"},[o.label]),
      o.hint?el("div",{style:"font-size:11px;color:#888;margin-top:2px;line-height:1.4"},[o.hint]):null
    ])]);
  return wrap;
}

function Card(title,kids){
  return el("div",{style:"border-radius:12px;overflow:hidden;margin-bottom:14px;border:1px solid #E2E8F0"},[
    el("div",{style:"padding:9px 14px;background:"+N},[el("span",{style:"font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#fff"},[title])]),
    el("div",{style:"padding:14px;background:#fff"},kids||[])
  ]);
}
function Info(text,warn){
  return el("div",{style:"padding:10px 12px;border-radius:8px;background:"+(warn?"#FFF7ED":"#EEF3FF")+";border:1px solid "+(warn?"#FED7AA":"#C7D5F7")+";margin-bottom:14px;font-size:12px;color:"+(warn?"#7C3A00":N)+";line-height:1.55"},[text]);
}
function header(title,sub){
  return el("div",{style:"text-align:center;margin-bottom:18px"},[
    el("div",{style:"font-size:18px;font-weight:800;color:"+N+";margin-bottom:4px"},[title]),
    el("div",{style:"font-size:13px;color:#666"},[sub])
  ]);
}

/* ─── Шаги ──────────────────────────────────────────────────────────── */
function renderStep(step){
  var p=S.p, box=el("div",{});
  if(step==="tipo"){
    box.appendChild(header("Что оформляем?","Solicitud de Número de Identidad de Extranjero (EX-15)"));
    box.appendChild(Info("Форма EX-15 подходит для получения NIE (номера) или для справки-сертификата. Если не уверены, что вам нужно, сначала уточните это в консульстве или ведомстве, куда подаёте."));
    box.appendChild(Pills({label:"Тип документа (4.1)",val:S.tipo,set:function(v){S.tipo=v;},opts:["Номер иностранца (NIE)","Справка резидента или нерезидента (Certificado)"]}));
    if(S.tipo===1){
      box.appendChild(Pills({label:"Вид справки",val:S.certTipo,set:function(v){S.certTipo=v;},opts:["De residente (для резидента)","De no residente (для нерезидента)"]}));
    }
    return box;
  }
  if(step==="persona"){
    box.appendChild(header("Личные данные","1) Datos del extranjero/a"));
    box.appendChild(Info("Пиши латиницей, как в паспорте. Поля заполняются заглавными буквами автоматически."));
    box.appendChild(Card("Документ",[
      Inp({label:"Паспорт (Pasaporte)",val:p.pasaporte,set:function(v){p.pasaporte=v;},ph:"AB1234567",max:20}),
      Inp({label:"NIE, если уже есть",val:p.nie1,set:function(v){p.nie1=v;},ph:"X",max:1,hint:"Формат: буква, 7 цифр, буква. Если NIE нет, поле можно оставить пустым."}),
      el("div",{style:"display:flex;gap:8px"},[
        el("div",{style:"flex:1"},[Inp({label:"Цифры",val:p.nie2,set:function(v){p.nie2=v;},ph:"1234567",max:7,type:"num"})]),
        el("div",{style:"flex:1"},[Inp({label:"Буква",val:p.nie3,set:function(v){p.nie3=v;},ph:"B",max:1})])
      ])
    ]));
    box.appendChild(Card("Фамилия и имя",[
      Inp({label:"1-я фамилия (Primer apellido)",req:true,val:p.ap1,set:function(v){p.ap1=v;},ph:"GARCIA"}),
      Inp({label:"2-я фамилия (Segundo apellido)",val:p.ap2,set:function(v){p.ap2=v;},ph:"LOPEZ"}),
      Inp({label:"Имя (Nombre)",req:true,val:p.nombre,set:function(v){p.nombre=v;},ph:"DMITRY"})
    ]));
    box.appendChild(Card("Дата и место рождения",[
      el("div",{style:"display:flex;gap:8px"},[
        el("div",{style:"flex:1"},[Inp({label:"День",req:true,val:p.dd,set:function(v){p.dd=v;},ph:"05",max:2,type:"num"})]),
        el("div",{style:"flex:1"},[Inp({label:"Месяц",req:true,val:p.mm,set:function(v){p.mm=v;},ph:"02",max:2,type:"num"})]),
        el("div",{style:"flex:1.6"},[Inp({label:"Год",req:true,val:p.yyyy,set:function(v){p.yyyy=v;},ph:"1985",max:4,type:"num"})])
      ]),
      Inp({label:"Место рождения (Lugar)",val:p.lugar,set:function(v){p.lugar=v;},ph:"KYIV"}),
      Inp({label:"Страна (País)",val:p.pais,set:function(v){p.pais=v;},ph:"UCRANIA"}),
      Inp({label:"Гражданство (Nacionalidad)",req:true,val:p.nac,set:function(v){p.nac=v;},ph:"UCRANIANA"})
    ]));
    box.appendChild(Card("Пол и семейное положение",[
      Pills({label:"Пол (Sexo)",val:p.sexo,set:function(v){p.sexo=v;},opts:["Мужской","Женский"]}),
      Pills({label:"Семейное положение (Estado civil)",val:p.ec,set:function(v){p.ec=v;},opts:["Холост/не замужем (S)","В браке (C)","Вдовец/вдова (V)","Разведён/а (D)","Раздельно (Sp)"]})
    ]));
    box.appendChild(Card("Родители",[
      Inp({label:"Имя отца (Nombre del padre)",val:p.padre,set:function(v){p.padre=v;},ph:"IVAN PETROV"}),
      Inp({label:"Имя матери (Nombre de la madre)",val:p.madre,set:function(v){p.madre=v;},ph:"ELENA PETROVA"})
    ]));
    return box;
  }
  if(step==="domicilio"){
    box.appendChild(header("Адрес в Испании","Domicilio de residencia"));
    box.appendChild(Info("Адрес по месту проживания. Если вы пока за границей, укажите адрес, по которому вам будут писать из Испании, или тот, который требует ведомство."));
    box.appendChild(Card("Адрес",[
      Inp({label:"Улица (Domicilio)",req:true,val:p.dom,set:function(v){p.dom=v;},ph:"CALLE MAYOR"}),
      el("div",{style:"display:flex;gap:8px"},[
        el("div",{style:"flex:1"},[Inp({label:"Дом (Nº)",val:p.num,set:function(v){p.num=v;},ph:"12",max:6})]),
        el("div",{style:"flex:1"},[Inp({label:"Этаж, квартира (Piso)",val:p.piso,set:function(v){p.piso=v;},ph:"3B",max:6})])
      ]),
      Inp({label:"Населённый пункт (Localidad)",req:true,val:p.loc,set:function(v){p.loc=v;},ph:"MADRID"}),
      el("div",{style:"display:flex;gap:8px"},[
        el("div",{style:"flex:1"},[Inp({label:"Индекс (C.P.)",val:p.cp,set:function(v){p.cp=v;},ph:"28013",max:5,type:"num"})]),
        el("div",{style:"flex:1.6"},[Inp({label:"Провинция (Provincia)",val:p.prov,set:function(v){p.prov=v;},ph:"MADRID"})])
      ])
    ]));
    box.appendChild(Card("Контакты",[
      Inp({label:"Мобильный (Teléfono móvil)",val:p.tel,set:function(v){p.tel=v;},ph:"+34 600 000 000",type:"num",max:20}),
      Inp({label:"E-mail",val:p.email,set:function(v){p.email=v;},ph:"correo@email.com",type:"email"})
    ]));
    return box;
  }
  if(step==="representante"){
    box.appendChild(header("Подача и представитель","Раздел 2 заполняется, только если подаёт другой человек"));
    box.appendChild(Chk({label:"Заявление подаёт представитель (не сам заявитель)",val:S.filer.activo,set:function(v){S.filer.activo=v;},
      hint:"Например, человек в Испании по доверенности. Бланк заполняет и подписывает заявитель."}));
    if(S.filer.activo){
      box.appendChild(Info("Доверенность должна прямо давать право подать заявление на NIE. Проверь требования к её форме (нотариальная, апостиль, перевод) в своём консульстве или ведомстве."));
      box.appendChild(Card("Представитель (Nombre/Razón Social, DNI/NIE/PAS)",[
        Inp({label:"ФИО представителя",req:true,val:S.filer.nombre,set:function(v){S.filer.nombre=v;},ph:"IVAN PETROV"}),
        Inp({label:"DNI / NIE / Паспорт",req:true,val:S.filer.doc,set:function(v){S.filer.doc=v;},ph:"X1234567B"}),
        Inp({label:"Улица (Domicilio)",val:S.filer.dom,set:function(v){S.filer.dom=v;},ph:"CALLE MAYOR"}),
        el("div",{style:"display:flex;gap:8px"},[
          el("div",{style:"flex:1"},[Inp({label:"Nº",val:S.filer.num,set:function(v){S.filer.num=v;},ph:"12",max:6})]),
          el("div",{style:"flex:1"},[Inp({label:"Piso",val:S.filer.piso,set:function(v){S.filer.piso=v;},ph:"3B",max:6})])
        ]),
        Inp({label:"Населённый пункт",val:S.filer.loc,set:function(v){S.filer.loc=v;},ph:"MADRID"}),
        el("div",{style:"display:flex;gap:8px"},[
          el("div",{style:"flex:1"},[Inp({label:"C.P.",val:S.filer.cp,set:function(v){S.filer.cp=v;},ph:"28013",max:5,type:"num"})]),
          el("div",{style:"flex:1.6"},[Inp({label:"Провинция",val:S.filer.prov,set:function(v){S.filer.prov=v;},ph:"MADRID"})])
        ]),
        Inp({label:"Телефон",val:S.filer.tel,set:function(v){S.filer.tel=v;},ph:"+34 600 000 000",type:"num",max:20}),
        Inp({label:"E-mail",val:S.filer.email,set:function(v){S.filer.email=v;},ph:"correo@email.com",type:"email"})
      ]));
    }
    box.appendChild(Card("Законный представитель (если заявитель несовершеннолетний)",[
      Chk({label:"Заявитель несовершеннолетний",val:S.rep.activo,set:function(v){S.rep.activo=v;}}),
      S.rep.activo?Inp({label:"ФИО законного представителя",req:true,val:S.rep.nombre,set:function(v){S.rep.nombre=v;},ph:"IVAN PETROV"}):null,
      S.rep.activo?Inp({label:"DNI / NIE / Паспорт представителя",req:true,val:S.rep.doc,set:function(v){S.rep.doc=v;},ph:"X1234567B"}):null,
      S.rep.activo?Pills({label:"Основание представительства (Título)",val:S.rep.titulo===""?-1:(S.rep.titulo==="PADRE/MADRE"?0:1),set:function(v){S.rep.titulo=v===0?"PADRE/MADRE":"TUTOR";},opts:["Отец / мать (Padre/Madre)","Опекун (Tutor)"]}):null
    ]));
    return box;
  }
  if(step==="notif"){
    box.appendChild(header("Уведомления","3) Domicilio a efectos de notificaciones"));
    box.appendChild(Chk({label:"Адрес для уведомлений совпадает с адресом проживания",val:S.notif.igual,set:function(v){S.notif.igual=v;}}));
    if(!S.notif.igual){
      box.appendChild(Card("Другой адрес для уведомлений",[
        Inp({label:"ФИО / Razón Social",req:true,val:S.notif.nombre,set:function(v){S.notif.nombre=v;},ph:"GARCIA LOPEZ DMITRY"}),
        Inp({label:"DNI / NIE / Паспорт",val:S.notif.doc,set:function(v){S.notif.doc=v;},ph:"X1234567B"}),
        Inp({label:"Улица (Domicilio)",req:true,val:S.notif.dom,set:function(v){S.notif.dom=v;},ph:"CALLE MAYOR"}),
        el("div",{style:"display:flex;gap:8px"},[
          el("div",{style:"flex:1"},[Inp({label:"Nº",val:S.notif.num,set:function(v){S.notif.num=v;},ph:"12",max:6})]),
          el("div",{style:"flex:1"},[Inp({label:"Piso",val:S.notif.piso,set:function(v){S.notif.piso=v;},ph:"3B",max:6})])
        ]),
        Inp({label:"Населённый пункт",req:true,val:S.notif.loc,set:function(v){S.notif.loc=v;},ph:"MADRID"}),
        el("div",{style:"display:flex;gap:8px"},[
          el("div",{style:"flex:1"},[Inp({label:"C.P.",val:S.notif.cp,set:function(v){S.notif.cp=v;},ph:"28013",max:5,type:"num"})]),
          el("div",{style:"flex:1.6"},[Inp({label:"Провинция",val:S.notif.prov,set:function(v){S.notif.prov=v;},ph:"MADRID"})])
        ]),
        Inp({label:"Телефон",val:S.notif.tel,set:function(v){S.notif.tel=v;},ph:"+34 600 000 000",type:"num",max:20}),
        Inp({label:"E-mail",val:S.notif.email,set:function(v){S.notif.email=v;},ph:"correo@email.com",type:"email"})
      ]));
    }
    box.appendChild(Card("Электронные уведомления",[
      Chk({label:"Согласен(на) на электронные уведомления (CONSIENTO)",val:S.consentDehu,set:function(v){S.consentDehu=v;},
        hint:"Уведомление будет размещено в электронном офисе (sede electrónica). Чтобы его открыть, нужен электронный сертификат, привязанный к DNI/NIE из раздела уведомлений. Без отметки уведомления придут по почте на указанный адрес."}),
      Chk({label:"NO CONSIENTO: не согласен(на) на проверку моих данных в госорганах",val:S.noConsultar,set:function(v){S.noConsultar=v;},
        hint:"Тогда эти документы придётся приложить самому и перечислить их в приложении II бланка (Anexo II), заполнив его от руки."})
    ]));
    return box;
  }
  if(step==="tramite"){
    box.appendChild(header("Основание и место подачи","Пункты 4.2-4.4 формы EX-15"));
    box.appendChild(Pills({label:"Основание (Motivos)",val:S.motivo,set:function(v){S.motivo=v;},opts:["Экономические интересы","Профессиональные интересы","Социальные интересы"]}));
    box.appendChild(Card("Пояснение (Especificar)",[
      Inp({label:"Коротко, зачем нужен номер",val:S.motivoTxt,set:function(v){S.motivoTxt=v;},ph:"TRABAJO / BANCO",hint:"Одна-две фразы. Это поле в бланке, оно не юридическое заявление."})
    ]));
    box.appendChild(Pills({label:"Место подачи (Lugar de presentación)",val:S.lugar,set:function(v){S.lugar=v;},opts:["Oficina de Extranjería","Comisaría de Policía","Oficina Consular (консульство)"]}));
    box.appendChild(Pills({label:"Ситуация в Испании (Situación)",val:S.situacion,set:function(v){S.situacion=v;},opts:["Estancia (краткосрочное пребывание)","Residencia (вид на жительство)"]}));
    box.appendChild(Info("Если подаёте из-за границы, обычно выбирают «Oficina Consular». Выбор подтверждает консульство, которое примет заявление. Пункт «Situación» выбирайте по своей реальной ситуации."));
    return box;
  }
  if(step==="resumen"){
    box.appendChild(header("Проверь данные","Потом скачаешь заполненный PDF"));
    var rows=[
      ["Документ", S.tipo===0?"NIE":"Certificado "+(S.certTipo===0?"de residente":"de no residente")],
      ["Заявитель", ((p.ap1||"")+" "+(p.ap2||"")+" "+(p.nombre||"")).trim()],
      ["Паспорт", p.pasaporte||"—"],
      ["NIE", (p.nie1+p.nie2+p.nie3)||"—"],
      ["Дата рождения", (p.dd||"")+"/"+(p.mm||"")+"/"+(p.yyyy||"")],
      ["Адрес", ((p.dom||"")+" "+(p.num||"")+" "+(p.piso||"")).trim()+", "+(p.loc||"")],
      ["Подаёт", S.filer.activo?("представитель: "+S.filer.nombre):"сам заявитель"],
      ["Место подачи", ["Oficina de Extranjería","Comisaría de Policía","Oficina Consular"][S.lugar]]
    ];
    var card=Card("Сводка",rows.map(function(r){
      return el("div",{style:"font-size:13px;color:"+N+";margin-bottom:6px;line-height:1.4"},[el("span",{style:"color:#666;font-size:11px"},[r[0]+": "]),el("b",{},[r[1]])]);
    }));
    box.appendChild(card);
    box.appendChild(Info("Подпись ставишь от руки на распечатке, в 2 экземплярах (оригинал и копия). Бланк заполняется заглавными буквами. Перед подачей проверьте всё по своим документам.",true));
    return box;
  }
  return box;
}

/* ─── Форма ─────────────────────────────────────────────────────────── */
function renderForm(){
  var step=STEPS[S.idx], total=STEPS.length, pct=((S.idx+1)/total)*100;
  var ok=canNext(step);
  var wrap=el("div",{style:"max-width:480px;margin:0 auto;background:#F4F7FF;padding:12px 16px 24px"});
  wrap.appendChild(el("div",{style:"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"},[
    el("div",{},[
      el("div",{style:"font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:"+OR},["TuTrámite.online"]),
      el("div",{style:"font-size:13px;font-weight:700;color:"+N},["Форма EX-15 — NIE"])
    ]),
    el("div",{style:"font-size:11px;color:#888;text-align:right"},[
      el("div",{style:"font-weight:600;color:"+N},[LABELS[step]]),
      el("div",{},["шаг "+(S.idx+1)+" из "+total])
    ])
  ]));
  wrap.appendChild(el("div",{style:"height:4px;border-radius:2px;background:#D1D9E6;margin-bottom:16px"},[
    el("div",{id:"ex15-bar",style:"height:4px;border-radius:2px;background:linear-gradient(90deg,"+N+","+OR+");width:"+pct+"%"})
  ]));
  wrap.appendChild(renderStep(step));
  if(S.err) wrap.appendChild(Info("Ошибка: "+S.err,true));
  wrap.appendChild(el("div",{style:"display:flex;gap:10px;margin-top:8px"},[
    el("button",{style:"width:50px;height:50px;border-radius:12px;border:1px solid #D1D9E6;background:#fff;color:"+N+";font-size:18px;cursor:"+(S.idx===0?"default":"pointer")+";opacity:"+(S.idx===0?0.3:1),
      onclick:function(){ if(S.idx>0){ S.idx--; S.err=""; render(); } }},["←"]),
    el("button",{id:"ex15-next",style:navStyle(ok),
      onclick:function(){
        if(!canNext(STEPS[S.idx])||S.busy) return;
        if(S.idx<STEPS.length-1){ S.idx++; S.err=""; render(); }
        else { genPDF(); }
      }},[S.idx===STEPS.length-1?(S.busy?"Создаём PDF...":"📄 Скачать заполненный PDF"):"Далее →"])
  ]));
  return wrap;
}
function navStyle(ok){
  return "flex:1;height:50px;border-radius:12px;border:none;cursor:"+(ok?"pointer":"default")+";background:"+(ok?"linear-gradient(135deg,"+N+","+OR+")":"#CBD5E1")+";color:#fff;font-size:15px;font-weight:700";
}
function refreshNav(){
  var step=STEPS[S.idx], btn=document.getElementById("ex15-next");
  if(btn) btn.setAttribute("style", navStyle(canNext(step)));
  var bar=document.getElementById("ex15-bar");
  if(bar) bar.style.width=(((S.idx+1)/STEPS.length)*100)+"%";
}

/* ─── Заполнение PDF ────────────────────────────────────────────────── */
function setText(form,id,value){
  try{ var f=form.getTextField(id); f.setText(value==null?"":String(value)); }catch(e){}
}
function pick(form,id,idx){
  try{
    var f=form.getRadioGroup(id); var opts=f.getOptions();
    if(idx>=0 && idx<opts.length) f.select(opts[idx]);
  }catch(e){}
}
function check(form,id,on){
  try{ var f=form.getCheckBox(id); if(on) f.check(); else f.uncheck(); }catch(e){}
}
function up(v){ return (v||"").toUpperCase(); }

function fillForm(form){
  var p=S.p;
  /* Раздел 1 */
  setText(form,"Pasaporte",up(p.pasaporte));
  setText(form,"NIE1_Extranjero",up(p.nie1));
  setText(form,"NIE2_Extranjero",(p.nie2||"").replace(/\D/g,""));
  setText(form,"NIE3_Extranjero",up(p.nie3));
  setText(form,"Apellido1_extranjero",up(p.ap1));
  setText(form,"Apellido2_extranjero",up(p.ap2));
  setText(form,"Nombre_Extranjero",up(p.nombre));
  pick(form,"Sexo",p.sexo);                       /* 0 Hombre · 1 Mujer */
  setText(form,"FechaNacimiento_Extranjero",("0"+p.dd).slice(-2)+"/"+("0"+p.mm).slice(-2)+"/"+p.yyyy);
  setText(form,"Lugar_Extranjero",up(p.lugar));
  setText(form,"Pais_Extranjero",up(p.pais));
  setText(form,"Nacionalidad_Extranjero",up(p.nac));
  pick(form,"Estado_Civil",p.ec);                 /* S C V D Sp = 0..4 */
  setText(form,"NombrePadre_Extranjero",up(p.padre));
  setText(form,"NombreMadre_Extranjero",up(p.madre));
  setText(form,"Domicilio_Extranjero",up(p.dom));
  setText(form,"Numero_Extranjero",p.num);
  setText(form,"Piso_Extranjero",p.piso);
  setText(form,"Localidad_Extranjero",up(p.loc));
  setText(form,"CodigoPostal_Extranjero",p.cp);
  setText(form,"Provincia_Extranjero",up(p.prov));
  setText(form,"TelefonoMovil_Extranjero",p.tel);
  setText(form,"Email_Extranjero",p.email);
  if(S.rep.activo){
    setText(form,"RepresentanteLegal_Extranjero",up(S.rep.nombre));
    setText(form,"DNI_Extranjero",up(S.rep.doc));
    setText(form,"Titulo_Extranjero",up(S.rep.titulo));
  }
  /* Раздел 2 — подающий, если не сам заявитель */
  if(S.filer.activo){
    var F=S.filer;
    setText(form,"Nombre_Representante",up(F.nombre));
    setText(form,"DNI_Representante",up(F.doc));
    setText(form,"Domicilio_Representante",up(F.dom));
    setText(form,"Numero_representante",F.num);
    setText(form,"Piso_Representante",F.piso);
    setText(form,"Localidad_Representante",up(F.loc));
    setText(form,"CodigoPostal_Representante",F.cp);
    setText(form,"Provincia_Representante",up(F.prov));
    setText(form,"TelefonoMovil_Representante",F.tel);
    setText(form,"Email_Representante",F.email);
  }
  /* Раздел 3 — уведомления */
  var N2=S.notif;
  if(N2.igual){
    setText(form,"Nombre_Notificacion",up((p.nombre+" "+p.ap1+" "+p.ap2).trim()));
    setText(form,"DNI_Notificacion",up((p.nie1+p.nie2+p.nie3)||p.pasaporte));
    setText(form,"Domicilio_Notificacion",up(p.dom));
    setText(form,"Numero_Notificacion",p.num);
    setText(form,"Piso_Notificacion",p.piso);
    setText(form,"Localidad_Notificacion",up(p.loc));
    setText(form,"CodigoPostal_Notificacion",p.cp);
    setText(form,"Provincia_Notificacion",up(p.prov));
    setText(form,"TelefonoMovil_Notificacion",p.tel);
    setText(form,"Email_Notificacion",p.email);
  } else {
    setText(form,"Nombre_Notificacion",up(N2.nombre));
    setText(form,"DNI_Notificacion",up(N2.doc));
    setText(form,"Domicilio_Notificacion",up(N2.dom));
    setText(form,"Numero_Notificacion",N2.num);
    setText(form,"Piso_Notificacion",N2.piso);
    setText(form,"Localidad_Notificacion",up(N2.loc));
    setText(form,"CodigoPostal_Notificacion",N2.cp);
    setText(form,"Provincia_Notificacion",up(N2.prov));
    setText(form,"TelefonoMovil_Notificacion",N2.tel);
    setText(form,"Email_Notificacion",N2.email);
  }
  check(form,"Consiento",S.consentDehu);
  check(form,"NoConsiento",S.noConsultar);
  /* Раздел 4 */
  pick(form,"TipoDocumento",S.tipo);              /* 0 NIE · 1 Certificado */
  if(S.tipo===1) pick(form,"Certificado",S.certTipo); /* 0 residente · 1 no residente */
  pick(form,"Motivos",S.motivo);                  /* 0 económicos · 1 profesionales · 2 sociales */
  setText(form,"MotivosEspecificar",up(S.motivoTxt));
  pick(form,"LugarPresentacion",S.lugar);         /* 0 Extranjería · 1 Comisaría · 2 Consulado */
  pick(form,"Situacion",S.situacion);             /* 0 Estancia · 1 Residencia */
  /* Подпись, дата */
  var h=new Date(), months=["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
  setText(form,"FirmaLocalidad",up(p.loc));
  setText(form,"Firma_dia",String(h.getDate()).padStart(2,"0"));
  setText(form,"Firma_Mes",months[h.getMonth()]);
  setText(form,"Firma_Anio",String(h.getFullYear()));
  var full=up((p.ap1+" "+p.ap2+" "+p.nombre).trim());
  setText(form,"Nombre y apellidos del titular",full);
  setText(form,"Nombre y apellidos del titular_2",full);
}

function genPDF(){
  S.busy=true; S.err=""; render();
  loadPdfLib().then(function(PDFLib){
    return fetch(window.EX15_PDF_URL).then(function(r){
      if(!r.ok) throw new Error("Не удалось загрузить форму-основу (HTTP "+r.status+"). Проверь EX15_PDF_URL.");
      return r.arrayBuffer().then(function(buf){ return PDFLib.PDFDocument.load(buf).then(function(doc){
        var form=doc.getForm();
        fillForm(form);
        try{ form.updateFieldAppearances(); }catch(e){}
        return doc.save().then(function(bytes){ download(bytes); });
      }); });
    });
  }).catch(function(e){
    S.busy=false; S.err=(e&&e.message)||"Ошибка генерации PDF"; render();
  });
}
function download(bytes){
  var blob=new Blob([bytes],{type:"application/pdf"});
  var url=URL.createObjectURL(blob);
  var a=document.createElement("a");
  a.href=url; a.download="EX15-"+up(S.p.ap1||"solicitante")+".pdf";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); },1500);
  S.busy=false; S.done=true; render();
}

function render(){
  root.innerHTML="";
  if(S.done){
    root.appendChild(el("div",{style:"max-width:480px;margin:0 auto;padding:40px 24px;text-align:center;background:#F4F7FF"},[
      el("div",{style:"font-size:56px;margin-bottom:12px"},["✅"]),
      el("div",{style:"font-size:20px;font-weight:800;color:"+N+";margin-bottom:8px"},["PDF скачан"]),
      el("div",{style:"font-size:14px;color:#666;line-height:1.6;margin-bottom:20px"},["Распечатай в 2 экземплярах, подпиши от руки и отнеси в место подачи, которое выбрал. Уточни заранее в консульстве или ведомстве, нужны ли апостиль, перевод и предварительная запись."]),
      el("button",{style:"padding:12px 24px;border-radius:12px;border:2px solid "+N+";background:#fff;color:"+N+";font-size:14px;font-weight:700;cursor:pointer",
        onclick:function(){ S=resetState(); render(); }},["Заполнить заново"])
    ]));
    return;
  }
  root.appendChild(renderForm());
}
function resetState(){
  return {tipo:0,certTipo:0,motivo:0,motivoTxt:"",lugar:0,situacion:0,p:mkP(),rep:mkRep(),filer:mkFiler(),notif:mkNotif(),noConsultar:false,consentDehu:false,idx:0,busy:false,err:"",done:false};
}

render();
})();
