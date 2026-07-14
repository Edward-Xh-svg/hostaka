<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="icon" href="hostaka-icon.png" type="image/png">
  <title>Hostaka — الرسائل</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    /* ===== أنماط Malines الأصلية (مع تعديل بسيط للثيم) ===== */
    :root {
      --black: #ffffff;
      --dark: #f7f7f8;
      --border: #e5e5e5;
      --text: #1a1a1a;
      --muted: #6b7280;
      --red: #000000;
      --red-h: #333333;
      --mine-bg: rgba(0,0,0,0.08);
      --mine-border: rgba(0,0,0,0.12);
      --their-bg: rgba(0,0,0,0.04);
      --their-border: rgba(0,0,0,0.06);
      --topbar-bg: rgba(255,255,255,0.85);
      --input-bg: #f7f7f8;
      --modal-bg: #ffffff;
      --shadow: 0 10px 30px rgba(0,0,0,0.4);
      --avatar-gradient: linear-gradient(145deg, var(--red), #333333);
      --sidebar-bg: rgba(255,255,255,0.6);
    }
    [data-theme="dark"] {
      --black: #0d0d0d;
      --dark: #141414;
      --border: #2a2a2a;
      --text: #e5e5e5;
      --muted: #8d8d8d;
      --red: #d4af37;
      --red-h: #e6c74a;
      --mine-bg: rgba(212,175,55,0.15);
      --mine-border: rgba(212,175,55,0.25);
      --their-bg: rgba(255,255,255,0.05);
      --their-border: rgba(255,255,255,0.08);
      --topbar-bg: rgba(13,13,13,0.85);
      --input-bg: #222222;
      --modal-bg: #1a1a1a;
      --shadow: 0 10px 30px rgba(0,0,0,0.7);
      --avatar-gradient: linear-gradient(145deg, #d4af37, #b8962e);
      --sidebar-bg: rgba(20,20,20,0.8);
    }
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
    html,body{height:100%;overflow:hidden;}
    body{
      background:radial-gradient(circle at 18% 16%,rgba(0,0,0,0.05),transparent 22%),var(--black);
      color:var(--text);
      font-family:'Cairo',sans-serif;
      display:flex;
      flex-direction:column;
      -webkit-font-smoothing:antialiased;
      transition:background 0.3s, color 0.3s;
    }

    /* ===== الشريط العلوي (من Malines) ===== */
    .topbar{
      height:56px;
      background:var(--topbar-bg);
      backdrop-filter:blur(24px);
      border-bottom:1px solid var(--border);
      display:flex;
      align-items:center;
      padding:0 16px;
      gap:12px;
      flex-shrink:0;
      z-index:20;
      transition:background 0.3s, border-color 0.3s;
    }
    .back-btn{
      display:flex;align-items:center;gap:6px;
      color:var(--muted);font-size:0.82rem;cursor:pointer;
      padding:6px 12px;border-radius:999px;
      background:rgba(128,128,128,0.06);
      border:1px solid var(--border);
      font-family:'Cairo';font-weight:600;
      text-decoration:none;
      transition:all 0.18s;
    }
    .back-btn:hover{color:var(--text);background:rgba(128,128,128,0.12);border-color:var(--border);}
    .back-btn:active{transform:scale(0.95);}
    .back-btn svg{width:14px;height:14px;}
    .topbar-title{
      font-weight:800;font-size:0.9rem;color:var(--text);
      flex:1;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    }
    .topbar-peer{
      display:flex;align-items:center;gap:10px;flex:1;
      cursor:pointer;padding:4px;border-radius:10px;
      transition:background 0.15s;
    }
    .topbar-peer:hover{background:rgba(128,128,128,0.06);}
    .topbar-peer:active{transform:scale(0.98);}
    .topbar-peer-av{
      width:34px;height:34px;border-radius:50%;
      background:var(--avatar-gradient);
      display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:0.9rem;color:#fff;
      overflow:hidden;flex-shrink:0;
      border:2px solid rgba(255,255,255,0.05);
    }
    .topbar-peer-av img{width:100%;height:100%;object-fit:cover;}
    .topbar-peer-name{font-weight:700;font-size:0.9rem;color:var(--text);}
    .topbar-peer-role{font-size:0.7rem;color:var(--muted);}

    /* ===== أيقونات الثيم واللغة ===== */
    .icon-btn{
      width:36px;height:36px;border-radius:50%;
      background:rgba(128,128,128,0.06);
      border:1px solid var(--border);
      display:flex;align-items:center;justify-content:center;
      cursor:pointer;color:var(--muted);
      transition:all 0.2s;flex-shrink:0;
    }
    .icon-btn:hover,.icon-btn:active{background:rgba(128,128,128,0.12);color:var(--text);border-color:var(--border);}
    .icon-btn svg{width:16px;height:16px;}
    .lang-selector{position:relative;}
    .lang-menu{
      position:absolute;top:42px;left:0;
      background:var(--modal-bg);
      border:1px solid var(--border);border-radius:12px;
      padding:6px 0;min-width:140px;
      opacity:0;visibility:hidden;
      transform:translateY(-6px) scale(0.96);
      transition:all 0.2s cubic-bezier(0.16,1,0.3,1);
      z-index:30;box-shadow:var(--shadow);
    }
    .lang-menu.show{opacity:1;visibility:visible;transform:translateY(0) scale(1);}
    .lang-menu button{
      display:flex;align-items:center;gap:8px;
      width:100%;padding:8px 16px;
      background:none;border:none;
      color:var(--text);
      font-family:'Cairo',sans-serif;
      font-size:0.85rem;
      cursor:pointer;transition:background 0.15s;
      text-align:right;
    }
    .lang-menu button:hover{background:rgba(128,128,128,0.08);}
    .lang-menu button .flag{font-size:1.1rem;}

    /* ===== التخطيط (من Malines) ===== */
    .chat-layout{display:flex;flex:1;overflow:hidden;}

    /* ===== الشريط الجانبي ===== */
    .sidebar{
      width:300px;
      display:flex;flex-direction:column;
      border-left:1px solid var(--border);
      background:var(--sidebar-bg);
      flex-shrink:0;
      transition:transform 0.3s cubic-bezier(0.16,1,0.3,1);
    }
    .sidebar-head{
      padding:14px 16px;
      border-bottom:1px solid var(--border);
      display:flex;align-items:center;justify-content:space-between;gap:8px;
    }
    .sidebar-head-title{font-weight:800;font-size:0.88rem;color:var(--text);}
    .btn-new-group{
      display:flex;align-items:center;gap:5px;
      background:rgba(128,128,128,0.08);
      border:1px solid var(--border);
      color:var(--muted);
      padding:6px 12px;border-radius:8px;
      cursor:pointer;font-family:'Cairo';font-size:0.78rem;font-weight:700;
      transition:all 0.18s;
    }
    .btn-new-group:hover{background:rgba(128,128,128,0.15);color:var(--text);border-color:var(--border);}
    .btn-new-group:active{transform:scale(0.95);}
    .btn-new-group svg{width:12px;height:12px;}
    .user-list{flex:1;overflow-y:auto;padding:6px 0;}
    .user-list::-webkit-scrollbar{width:4px;}
    .user-list::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
    .section-label{
      padding:10px 16px 4px;
      font-size:0.68rem;color:var(--muted);font-weight:700;
      text-transform:uppercase;letter-spacing:0.06em;
    }
    .user-item{
      display:flex;align-items:center;gap:10px;
      padding:10px 14px;cursor:pointer;
      transition:all 0.15s;border-radius:10px;
      margin:2px 8px;position:relative;
    }
    .user-item:hover{background:rgba(128,128,128,0.06);}
    .user-item.active{
      background:rgba(128,128,128,0.12);
      border:1px solid var(--border);
    }
    .user-item:active{transform:scale(0.98);}
    .u-av{
      width:40px;height:40px;border-radius:50%;
      background:var(--avatar-gradient);
      display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:0.95rem;color:#fff;
      flex-shrink:0;overflow:hidden;
      border:2px solid rgba(255,255,255,0.05);
    }
    .u-av img{width:100%;height:100%;object-fit:cover;}
    .u-info{flex:1;min-width:0;}
    .u-name{
      font-weight:700;font-size:0.86rem;color:var(--text);
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      display:flex;align-items:center;gap:5px;
    }
    .u-last{
      font-size:0.72rem;color:var(--muted);
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      margin-top:2px;
    }
    .u-badge{
      display:inline-flex;align-items:center;gap:3px;
      font-size:0.66rem;color:var(--red);font-weight:700;
    }
    .u-badge svg{width:9px;height:9px;}

    /* ===== منطقة المحادثة ===== */
    .chat-main{
      flex:1;display:flex;flex-direction:column;
      min-width:0;min-height:0;position:relative;
    }
    .empty-state{
      flex:1;display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      gap:14px;color:var(--muted);
    }
    .empty-state svg{width:52px;height:52px;opacity:0.15;}
    .empty-state span{font-size:0.9rem;font-weight:600;}

    /* ===== الرسائل (من Malines) ===== */
    .msgs-area{
      flex:1;overflow-y:auto;padding:16px 14px;
      display:flex;flex-direction:column;gap:4px;min-height:0;
    }
    .msgs-area::-webkit-scrollbar{width:4px;}
    .msgs-area::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
    .date-divider{
      text-align:center;font-size:0.68rem;color:var(--muted);
      padding:10px 0;position:relative;font-weight:600;
    }
    .date-divider::before{
      content:'';position:absolute;top:50%;left:0;right:0;
      height:1px;background:linear-gradient(90deg,transparent,var(--border),transparent);
    }
    .date-divider span{position:relative;z-index:1;background:var(--black);padding:0 12px;}
    .msg-row{
      display:flex;align-items:flex-end;gap:8px;
      margin-bottom:6px;
      animation:msgIn 0.25s cubic-bezier(0.16,1,0.3,1);
    }
    @keyframes msgIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
    .msg-row.mine{flex-direction:row-reverse;}
    .msg-av{
      width:28px;height:28px;border-radius:50%;
      background:var(--avatar-gradient);
      display:flex;align-items:center;justify-content:center;
      font-weight:700;font-size:0.75rem;color:#fff;
      flex-shrink:0;overflow:hidden;
      border:2px solid rgba(255,255,255,0.05);
    }
    .msg-av img{width:100%;height:100%;object-fit:cover;}
    .msg-av.invisible{opacity:0;pointer-events:none;}
    .bubble-wrap{
      display:flex;flex-direction:column;
      max-width:68%;min-width:0;
    }
    .msg-row.mine .bubble-wrap{align-items:flex-end;}
    .bubble{
      padding:10px 14px;border-radius:18px;
      font-size:0.9rem;line-height:1.6;word-break:break-word;
      position:relative;cursor:pointer;transition:filter 0.15s;
    }
    .bubble:hover{filter:brightness(1.12);}
    .msg-row.mine .bubble{
      background:var(--mine-bg);
      border:1px solid var(--mine-border);
      border-bottom-left-radius:5px;
    }
    .msg-row.theirs .bubble{
      background:var(--their-bg);
      border:1px solid var(--their-border);
      border-bottom-right-radius:5px;
    }
    .bubble-img{
      max-width:100%;border-radius:10px;
      display:block;margin-bottom:5px;
      max-height:180px;object-fit:cover;
    }
    .msg-time{
      font-size:0.62rem;color:var(--muted);
      padding:3px 5px;font-weight:600;
    }
    .msg-reaction{
      display:inline-flex;align-items:center;gap:4px;
      background:rgba(250,250,250,0.95);
      border:1px solid var(--border);
      border-radius:999px;padding:3px 8px;
      font-size:0.78rem;margin-top:4px;
      cursor:pointer;transition:all 0.15s;
      backdrop-filter:blur(10px);
    }
    .msg-reaction:hover{background:rgba(30,30,32,0.95);border-color:rgba(255,255,255,0.1);}
    .msg-reaction svg{width:12px;height:12px;}

    /* ===== React Picker ===== */
    .react-picker{
      position:absolute;bottom:calc(100% + 8px);
      background:var(--modal-bg);
      border:1px solid var(--border);
      border-radius:999px;padding:5px 8px;
      display:none;gap:3px;
      backdrop-filter:blur(20px);
      z-index:30;white-space:nowrap;
      box-shadow:var(--shadow);
      animation:menuPop 0.2s cubic-bezier(0.16,1,0.3,1);
    }
    @keyframes menuPop{from{opacity:0;transform:translateY(6px) scale(0.9);}to{opacity:1;transform:translateY(0) scale(1);}}
    .msg-row.mine .react-picker{right:0;}
    .msg-row.theirs .react-picker{left:0;}
    .react-picker.show{display:flex;}
    .r-emoji{
      background:none;border:none;cursor:pointer;
      padding:5px 7px;border-radius:8px;
      transition:all 0.15s;line-height:1;
      display:flex;align-items:center;justify-content:center;
      color:var(--muted);
    }
    .r-emoji:hover{background:rgba(128,128,128,0.08);transform:scale(1.2);color:var(--text);}
    .r-emoji.active{background:rgba(212,175,55,0.15);color:var(--red);}
    .r-emoji svg{width:16px;height:16px;}

    /* ===== الإدخال ===== */
    .img-preview-bar{
      padding:8px 14px;
      background:var(--topbar-bg);
      border-top:1px solid var(--border);
      display:none;align-items:center;gap:10px;
      flex-shrink:0;animation:slideUp 0.2s ease;
    }
    @keyframes slideUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
    .img-preview-bar img{height:50px;border-radius:8px;object-fit:cover;border:1px solid var(--border);}
    .img-rm-btn{
      background:rgba(0,0,0,0.7);border:none;color:#fff;
      border-radius:50%;width:22px;height:22px;
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      flex-shrink:0;transition:all 0.15s;
    }
    .img-rm-btn:hover{background:rgba(0,0,0,0.9);transform:scale(1.1);}
    .img-rm-btn svg{width:10px;height:10px;}
    .input-area{
      padding:10px 14px;
      border-top:1px solid var(--border);
      display:flex;align-items:flex-end;gap:8px;
      background:var(--topbar-bg);flex-shrink:0;
    }
    .btn-attach{
      width:40px;height:40px;border-radius:50%;
      background:rgba(128,128,128,0.06);
      border:1px solid var(--border);
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      color:var(--muted);transition:all 0.18s;flex-shrink:0;
    }
    .btn-attach:hover{color:var(--text);background:rgba(128,128,128,0.12);border-color:var(--border);}
    .btn-attach:active{transform:scale(0.92);}
    .btn-attach svg{width:15px;height:15px;}
    .msg-input{
      flex:1;padding:11px 16px;
      background:var(--input-bg);
      border:1px solid var(--border);border-radius:22px;
      color:var(--text);font-family:'Cairo';font-size:0.9rem;
      resize:none;max-height:120px;overflow-y:auto;line-height:1.5;
      outline:none;transition:all 0.2s;
    }
    .msg-input:focus{
      border-color:var(--border);background:var(--input-bg);
      box-shadow:0 0 0 3px rgba(128,128,128,0.08);
    }
    .msg-input::placeholder{color:var(--muted);}
    .send-btn{
      width:42px;height:42px;border-radius:50%;
      background:var(--red);border:none;
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      transition:all 0.2s;flex-shrink:0;
    }
    .send-btn:hover{background:var(--red-h);transform:scale(1.08);}
    .send-btn:active{transform:scale(0.95);}
    .send-btn:disabled{opacity:0.4;cursor:not-allowed;transform:none;}
    .send-btn svg{width:17px;height:17px;}

    /* ===== الهواتف ===== */
    .sidebar-toggle{
      display:none;
      width:38px;height:38px;border-radius:10px;
      background:rgba(128,128,128,0.06);
      border:1px solid var(--border);
      align-items:center;justify-content:center;
      cursor:pointer;color:var(--muted);flex-shrink:0;
      transition:all 0.18s;
    }
    .sidebar-toggle:hover{color:var(--text);background:rgba(128,128,128,0.12);}
    .sidebar-toggle:active{transform:scale(0.92);}
    .sidebar-toggle svg{width:17px;height:17px;}
    .sidebar-overlay{
      display:none;
      position:fixed;inset:0;
      background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);
      z-index:15;opacity:0;transition:opacity 0.3s;
    }
    .sidebar-overlay.show{display:block;opacity:1;}

    /* ===== غير مسجل ===== */
    .not-logged{
      flex:1;display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      gap:14px;
    }
    .not-logged h2{font-size:1.2rem;font-weight:800;color:var(--text);}
    .not-logged p{color:var(--muted);font-size:0.85rem;max-width:300px;text-align:center;line-height:1.6;}
    .btn-go{
      display:inline-flex;align-items:center;gap:6px;
      padding:11px 24px;background:var(--red);color:#fff;
      border-radius:10px;font-weight:800;font-size:0.88rem;
      text-decoration:none;transition:all 0.2s;
    }
    .btn-go:hover{background:var(--red-h);transform:translateY(-1px);}
    .btn-go:active{transform:scale(0.97);}

    /* ===== مودال ===== */
    .modal-bg{
      position:fixed;inset:0;
      background:rgba(0,0,0,0.85);backdrop-filter:blur(16px);
      display:none;align-items:center;justify-content:center;
      z-index:200;padding:20px;opacity:0;transition:opacity 0.25s;
    }
    .modal-bg.show{display:flex;opacity:1;}
    .modal-box{
      background:var(--modal-bg);
      border:1px solid var(--border);
      border-radius:22px;padding:28px 24px;
      width:100%;max-width:440px;max-height:85vh;
      overflow-y:auto;transform:translateY(12px) scale(0.97);
      transition:all 0.3s cubic-bezier(0.16,1,0.3,1);
      box-shadow:var(--shadow);
    }
    .modal-bg.show .modal-box{transform:translateY(0) scale(1);}
    .modal-title{
      font-weight:800;font-size:1.05rem;color:var(--text);
      margin-bottom:20px;display:flex;align-items:center;gap:10px;
    }
    .modal-title svg{width:20px;height:20px;color:var(--red);}
    .m-input{
      width:100%;padding:11px 14px;
      background:var(--input-bg);
      border:1px solid var(--border);border-radius:10px;
      color:var(--text);font-family:'Cairo';font-size:0.9rem;
      margin-bottom:14px;transition:all 0.2s;
    }
    .m-input:focus{outline:none;border-color:var(--border);background:var(--input-bg);box-shadow:0 0 0 3px rgba(128,128,128,0.08);}
    .m-input::placeholder{color:var(--muted);}
    .member-check{
      display:flex;align-items:center;gap:10px;
      padding:10px 12px;background:rgba(128,128,128,0.04);
      border-radius:10px;cursor:pointer;margin-bottom:6px;
      transition:all 0.15s;border:1px solid transparent;
    }
    .member-check:hover{background:rgba(128,128,128,0.08);border-color:var(--border);}
    .member-check input[type="checkbox"]{accent-color:var(--red);width:16px;height:16px;flex-shrink:0;}
    .member-check .u-av{width:28px;height:28px;font-size:0.78rem;flex-shrink:0;}
    .member-check span{font-size:0.86rem;color:var(--text);}
    .m-footer{display:flex;gap:10px;justify-content:flex-end;margin-top:20px;}
    .btn-cancel{
      padding:10px 18px;
      background:rgba(128,128,128,0.06);
      border:1px solid var(--border);border-radius:9px;
      color:var(--muted);cursor:pointer;font-family:'Cairo';
      font-size:0.86rem;font-weight:600;transition:all 0.2s;
    }
    .btn-cancel:hover{background:rgba(128,128,128,0.12);color:var(--text);border-color:var(--border);}
    .btn-cancel:active{transform:scale(0.96);}
    .btn-confirm{
      padding:10px 18px;
      background:var(--red);border:none;border-radius:9px;
      color:#fff;font-weight:800;cursor:pointer;font-family:'Cairo';
      font-size:0.86rem;transition:all 0.2s;
    }
    .btn-confirm:hover{background:var(--red-h);transform:translateY(-1px);}
    .btn-confirm:active{transform:translateY(0);}
    .btn-confirm:disabled{opacity:0.5;cursor:not-allowed;transform:none;}

    /* ===== توست ===== */
    .toast{
      position:fixed;bottom:24px;left:50%;
      transform:translateX(-50%) translateY(20px);
      padding:12px 22px;border-radius:14px;
      font-size:0.88rem;font-weight:600;
      z-index:999;border:1px solid var(--border);
      backdrop-filter:blur(16px);
      opacity:0;visibility:hidden;
      transition:all 0.3s cubic-bezier(0.16,1,0.3,1);
      white-space:nowrap;max-width:90vw;text-align:center;
    }
    .toast.show{opacity:1;visibility:visible;transform:translateX(-50%) translateY(0);}
    .toast-success{background:var(--modal-bg);color:var(--text);border-color:var(--border);}
    .toast-error{background:var(--red);color:#fff;border-color:var(--red);}

    /* ===== سكرول ===== */
    ::-webkit-scrollbar{width:4px;}
    ::-webkit-scrollbar-track{background:transparent;}
    ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
    ::-webkit-scrollbar-thumb:hover{background:var(--muted);}

    /* ===== استجابة ===== */
    @media(max-width:680px){
      .topbar{height:52px;padding:0 12px;gap:6px;}
      .back-btn{padding:5px 10px;font-size:0.76rem;}
      .back-btn svg{width:12px;height:12px;}
      .topbar-title{font-size:0.82rem;}
      .topbar-peer-av{width:30px;height:30px;}
      .topbar-peer-name{font-size:0.84rem;}
      .sidebar{
        position:fixed;top:0;right:0;bottom:0;z-index:16;
        width:280px;transform:translateX(100%);
        border-left:none;border-right:1px solid var(--border);
      }
      .sidebar.open{transform:translateX(0);}
      .sidebar-head{padding:12px 14px;}
      .btn-new-group{padding:5px 10px;font-size:0.74rem;}
      .user-item{padding:9px 12px;margin:2px 6px;}
      .u-av{width:36px;height:36px;}
      .u-name{font-size:0.82rem;}
      .u-last{font-size:0.7rem;}
      .sidebar-toggle{display:flex;}
      .bubble-wrap{max-width:82%;}
      .bubble{padding:9px 12px;font-size:0.88rem;border-radius:16px;}
      .msg-av{width:24px;height:24px;font-size:0.68rem;}
      .msg-time{font-size:0.6rem;}
      .input-area{padding:8px 12px;}
      .btn-attach{width:36px;height:36px;}
      .msg-input{padding:9px 14px;font-size:0.86rem;}
      .send-btn{width:38px;height:38px;}
      .send-btn svg{width:15px;height:15px;}
      .modal-box{padding:22px 18px;border-radius:18px;}
      .modal-title{font-size:0.95rem;}
      .m-input{padding:10px 12px;font-size:0.86rem;}
      .member-check{padding:8px 10px;}
      .not-logged{padding:60px 20px;}
      .not-logged h2{font-size:1.1rem;}
    }
    @media(max-width:400px){
      .topbar{padding:0 10px;}
      .back-btn span{display:none;}
      .back-btn{padding:6px;}
      .back-btn svg{margin:0;}
      .topbar-peer-name{max-width:120px;overflow:hidden;text-overflow:ellipsis;}
      .bubble-wrap{max-width:88%;}
      .msgs-area{padding:12px 10px;}
    }
    @media(prefers-reduced-motion:reduce){
      *,*::before,*::after{animation-duration:0.01ms!important;transition-duration:0.01ms!important;}
    }
  </style>
</head>
<body>

<div class="topbar" id="topbar">
  <a href="/" class="back-btn" id="backBtn">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    <span id="backText">Hostaka</span>
  </a>
  <span class="topbar-title" id="topbarTitle">الرسائل</span>
  <div style="display:flex;gap:6px;align-items:center;">
    <button class="icon-btn" id="themeToggle" onclick="toggleTheme()" title="تبديل الثيم">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    </button>
    <div class="lang-selector icon-btn" id="langToggle" onclick="toggleLangMenu()" title="تغيير اللغة">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
      <div class="lang-menu" id="langMenu">
        <button onclick="setLang('ar')"><span class="flag">🇸🇦</span> العربية</button>
        <button onclick="setLang('en')"><span class="flag">🇬🇧</span> English</button>
        <button onclick="setLang('fr')"><span class="flag">🇫🇷</span> Français</button>
        <button onclick="setLang('ru')"><span class="flag">🇷🇺</span> Русский</button>
        <button onclick="setLang('zh')"><span class="flag">🇨🇳</span> 中文</button>
        <button onclick="setLang('ja')"><span class="flag">🇯🇵</span> 日本語</button>
      </div>
    </div>
    <button class="sidebar-toggle" onclick="toggleSidebar()" id="sidebarToggle">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
  </div>
</div>

<div class="chat-layout">
  <div class="chat-main" id="chatMain">
    <div class="empty-state" id="emptyState">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span id="emptyStateText">اختر محادثة من القائمة</span>
    </div>
  </div>

  <div class="sidebar" id="sidebar">
    <div class="sidebar-head">
      <span class="sidebar-head-title" id="sidebarTitle">الرسائل</span>
      <button class="btn-new-group" onclick="openCreateGroup()" id="newGroupBtn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span id="newGroupText">جروب جديد</span>
      </button>
    </div>
    <div class="user-list" id="userList">
      <div style="text-align:center;padding:30px;color:var(--muted);font-size:0.84rem;" id="loadingUsers">جارٍ التحميل...</div>
    </div>
  </div>
</div>

<div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleSidebar()"></div>

<div class="modal-bg" id="createGroupModal">
  <div class="modal-box">
    <div class="modal-title">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      <span id="modalGroupTitle">إنشاء مجموعة جديدة</span>
    </div>
    <input class="m-input" type="text" id="cgName" placeholder="اسم المجموعة *">
    <div id="cgMembers" style="max-height:220px;overflow-y:auto;margin-bottom:4px;"></div>
    <div class="m-footer">
      <button class="btn-cancel" onclick="closeCreateGroup()" id="modalCancelBtn">إلغاء</button>
      <button class="btn-confirm" id="createGroupBtn" onclick="createGroup()"><span id="modalCreateBtn">إنشاء</span></button>
    </div>
  </div>
</div>

<script>
// ============================================================
//  الترجمة (i18n) – فقط للنصوص الثابتة
// ============================================================
const LANG = {
  ar: {
    back: 'Hostaka', title: 'الرسائل', sidebarTitle: 'الرسائل',
    newGroup: 'جروب جديد', loading: 'جارٍ التحميل...',
    emptyState: 'اختر محادثة من القائمة',
    groups: 'المجموعات', conversations: 'المحادثات', allMembers: 'جميع الأعضاء',
    noMembers: 'لا يوجد أعضاء آخرون', startChat: 'ابدأ محادثة',
    you: 'أنت', admin: 'مدير', member: 'عضو',
    groupName: 'اسم المجموعة *', create: 'إنشاء', cancel: 'إلغاء',
    createGroupTitle: 'إنشاء مجموعة جديدة',
    sendPlaceholder: 'اكتب رسالة...', attach: 'إرفاق صورة JPG', imageAttached: 'صورة مرفقة',
    loginRequired: 'يجب تسجيل الدخول', home: 'الرئيسية',
    groupCreated: 'تم إنشاء المجموعة', error: 'فشل',
    noMessages: 'ابدأ المحادثة', today: 'اليوم', yesterday: 'أمس'
  },
  en: {
    back: 'Hostaka', title: 'Messages', sidebarTitle: 'Messages',
    newGroup: 'New Group', loading: 'Loading...',
    emptyState: 'Select a conversation',
    groups: 'Groups', conversations: 'Conversations', allMembers: 'All Members',
    noMembers: 'No other members', startChat: 'Start chat',
    you: 'You', admin: 'Admin', member: 'Member',
    groupName: 'Group name *', create: 'Create', cancel: 'Cancel',
    createGroupTitle: 'Create New Group',
    sendPlaceholder: 'Type a message...', attach: 'Attach JPG', imageAttached: 'Image attached',
    loginRequired: 'Please login', home: 'Home',
    groupCreated: 'Group created', error: 'Failed',
    noMessages: 'Start the conversation', today: 'Today', yesterday: 'Yesterday'
  },
  fr: {
    back: 'Hostaka', title: 'Messages', sidebarTitle: 'Messages',
    newGroup: 'Nouveau groupe', loading: 'Chargement...',
    emptyState: 'Choisissez une conversation',
    groups: 'Groupes', conversations: 'Conversations', allMembers: 'Tous',
    noMembers: 'Aucun autre', startChat: 'Commencer',
    you: 'Vous', admin: 'Admin', member: 'Membre',
    groupName: 'Nom *', create: 'Créer', cancel: 'Annuler',
    createGroupTitle: 'Nouveau groupe',
    sendPlaceholder: 'Écrivez...', attach: 'Joindre JPG', imageAttached: 'Image jointe',
    loginRequired: 'Connectez-vous', home: 'Accueil',
    groupCreated: 'Groupe créé', error: 'Échec',
    noMessages: 'Démarrez', today: "Aujourd'hui", yesterday: 'Hier'
  },
  ru: {
    back: 'Hostaka', title: 'Сообщения', sidebarTitle: 'Сообщения',
    newGroup: 'Новая группа', loading: 'Загрузка...',
    emptyState: 'Выберите чат',
    groups: 'Группы', conversations: 'Чаты', allMembers: 'Все',
    noMembers: 'Нет других', startChat: 'Начать',
    you: 'Вы', admin: 'Админ', member: 'Участник',
    groupName: 'Название *', create: 'Создать', cancel: 'Отмена',
    createGroupTitle: 'Создать группу',
    sendPlaceholder: 'Напишите...', attach: 'Прикрепить JPG', imageAttached: 'Изображение',
    loginRequired: 'Войдите', home: 'Главная',
    groupCreated: 'Группа создана', error: 'Ошибка',
    noMessages: 'Начните', today: 'Сегодня', yesterday: 'Вчера'
  },
  zh: {
    back: 'Hostaka', title: '消息', sidebarTitle: '消息',
    newGroup: '新建群组', loading: '加载中...',
    emptyState: '选择对话',
    groups: '群组', conversations: '对话', allMembers: '所有',
    noMembers: '没有其他', startChat: '开始',
    you: '你', admin: '管理员', member: '成员',
    groupName: '名称 *', create: '创建', cancel: '取消',
    createGroupTitle: '新建群组',
    sendPlaceholder: '输入...', attach: '附加图片', imageAttached: '已附加',
    loginRequired: '请登录', home: '首页',
    groupCreated: '已创建', error: '失败',
    noMessages: '开始', today: '今天', yesterday: '昨天'
  },
  ja: {
    back: 'Hostaka', title: 'メッセージ', sidebarTitle: 'メッセージ',
    newGroup: '新規グループ', loading: '読み込み中...',
    emptyState: 'チャットを選択',
    groups: 'グループ', conversations: 'チャット', allMembers: '全',
    noMembers: '他にいません', startChat: '開始',
    you: 'あなた', admin: '管理者', member: 'メンバー',
    groupName: '名前 *', create: '作成', cancel: 'キャンセル',
    createGroupTitle: '新規グループ',
    sendPlaceholder: '入力...', attach: '画像を添付', imageAttached: '添付済み',
    loginRequired: 'ログイン', home: 'ホーム',
    groupCreated: '作成しました', error: '失敗',
    noMessages: '開始', today: '今日', yesterday: '昨日'
  }
};

let currentLang = localStorage.getItem('hostaka_lang') || 'ar';
let currentTheme = localStorage.getItem('hostaka_theme') || 'light';

function t(key) {
  return LANG[currentLang]?.[key] || LANG['ar'][key] || key;
}

function applyLang() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = (currentLang === 'ar') ? 'rtl' : 'ltr';
  document.getElementById('backText').textContent = t('back');
  document.getElementById('topbarTitle').textContent = t('title');
  document.getElementById('sidebarTitle').textContent = t('sidebarTitle');
  document.getElementById('newGroupText').textContent = t('newGroup');
  document.getElementById('loadingUsers').textContent = t('loading');
  document.getElementById('emptyStateText').textContent = t('emptyState');
  document.getElementById('modalGroupTitle').textContent = t('createGroupTitle');
  document.getElementById('modalCancelBtn').textContent = t('cancel');
  document.getElementById('modalCreateBtn').textContent = t('create');
  const cgName = document.getElementById('cgName');
  if (cgName) cgName.placeholder = t('groupName');
  const msgInput = document.getElementById('msgInput');
  if (msgInput) msgInput.placeholder = t('sendPlaceholder');
  // تحديث القائمة الجانبية
  renderSidebar();
}

function toggleTheme() {
  const html = document.documentElement;
  if (currentTheme === 'light') {
    html.setAttribute('data-theme', 'dark');
    currentTheme = 'dark';
    document.getElementById('themeToggle').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  } else {
    html.removeAttribute('data-theme');
    currentTheme = 'light';
    document.getElementById('themeToggle').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  }
  localStorage.setItem('hostaka_theme', currentTheme);
}

function toggleLangMenu() {
  document.getElementById('langMenu').classList.toggle('show');
}
document.addEventListener('click', (e) => {
  if (!document.getElementById('langToggle').contains(e.target)) {
    document.getElementById('langMenu').classList.remove('show');
  }
});

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('hostaka_lang', lang);
  document.getElementById('langMenu').classList.remove('show');
  applyLang();
  renderSidebar();
  if (currentPeer) {
    const peer = allUsers.find(u => u.username === currentPeer);
    if (peer) updateTopbarPeer(peer);
    loadMsgs(currentPeer, false);
  }
}

// ============================================================
//  منطق المحادثة (نسخة Malines الأصلية)
// ============================================================
const getToken = () => localStorage.getItem('hostaka_token') || '';
let ME = null;
let currentPeer = null;
let allUsers = [];
let conversations = [];
let groups = [];
let pollTimer = null;
let msgReactions = {};
let chatImgBase64 = '';

function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtTime(s) { if(!s) return ''; return new Date(s).toLocaleTimeString(currentLang === 'ar' ? 'ar' : 'en', {hour:'2-digit',minute:'2-digit'}); }
function fmtDay(s) {
  if(!s) return '';
  const d = new Date(s), t = new Date();
  const diff = Math.floor((t - d) / 86400000);
  if(diff === 0) return t('today');
  if(diff === 1) return t('yesterday');
  return d.toLocaleDateString(currentLang === 'ar' ? 'ar-SA' : 'en-US', {month:'short', day:'numeric'});
}

// ====== API (بدون التحقق من r.ok) ======
async function apiFetch(url, method = 'GET', body = null) {
  const token = getToken();
  const opts = { method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  return r.json();
}

// ====== SVG (نفس Malines) ======
const SVG = {
  msg:      `<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  user:     `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  group:    `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  send:     `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  attach:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  close:    `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  arrow:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`,
  like:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`,
  heart:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  haha:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  sad:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 16c-1.5-1-2.5-1.5-4-1.5s-2.5.5-4 1.5"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  angry:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 16c-1.5-1-2.5-1.5-4-1.5s-2.5.5-4 1.5"/><path d="M8 8l2 2"/><path d="M16 8l-2 2"/></svg>`,
};

// ====== الرياكتشنز ======
const REACTIONS = [
  { emoji:'like',  label:'أعجبني',  icon:SVG.like },
  { emoji:'heart', label:'أحببته',  icon:SVG.heart },
  { emoji:'haha',  label:'أضحكني',  icon:SVG.haha },
  { emoji:'sad',   label:'أحزنني',  icon:SVG.sad },
  { emoji:'angry', label:'أغضبني',  icon:SVG.angry },
];

// ============================================================
//  التهيئة
// ============================================================
async function init() {
  if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('themeToggle').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  }
  applyLang();

  const token = getToken();
  if (!token) { showNotLogged(); return; }
  try {
    const r = await fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } });
    if (!r.ok) { showNotLogged(); return; }
    const u = await r.json();
    if (!u || u.error) { showNotLogged(); return; }
    ME = u;
  } catch (e) { showNotLogged(); return; }

  await loadSidebar();

  const withUser = new URLSearchParams(location.search).get('with');
  if (withUser) openChat(withUser);
}

function showNotLogged() {
  document.getElementById('chatMain').innerHTML = `<div class="not-logged">${SVG.user}<h2>${t('loginRequired')}</h2><p>${t('loginRequired')}</p><a href="/" class="btn-go">${SVG.arrow}${t('home')}</a></div>`;
  document.getElementById('sidebar').style.display = 'none';
  document.querySelector('.sidebar-toggle').style.display = 'none';
}

function showToast(msg, type = 'success') {
  let t = document.querySelector('.toast');
  if (t) t.remove();
  t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

// ============================================================
//  الشريط الجانبي (من Malines)
// ============================================================
async function loadSidebar() {
  try {
    [allUsers, conversations, groups] = await Promise.all([
      apiFetch('/api/users'),
      apiFetch('/api/messages/conversations'),
      apiFetch('/api/groups'),
    ]);
  } catch (e) {
    allUsers = []; conversations = []; groups = [];
  }
  renderSidebar();
}

function renderSidebar() {
  const list = document.getElementById('userList');
  if (!list) return;

  const others = Array.isArray(allUsers) ? allUsers.filter(u => u.username !== ME?.username) : [];
  const convMap = {};
  if (Array.isArray(conversations)) {
    conversations.forEach(c => {
      const peer = c.from_id == ME?.id ? c.to_name : c.from_name;
      convMap[peer] = c;
    });
  }

  let html = '';

  if (Array.isArray(groups) && groups.length) {
    html += `<div class="section-label">${t('groups')}</div>`;
    html += groups.map(g => {
      const av = g.avatar ? `<img src="${esc(g.avatar)}" alt="">` : (g.name || '?').charAt(0).toUpperCase();
      return `<div class="user-item" onclick="window.location='/group?g=${g.id}'">
        <div class="u-av" style="background:linear-gradient(145deg,#566573,#2c3e50);">${av}</div>
        <div class="u-info">
          <div class="u-name">${SVG.group}${esc(g.name)}</div>
          <div class="u-last">${g.my_role === 'admin' ? t('admin') : t('member')}</div>
        </div>
      </div>`;
    }).join('');
  }

  const withConv = others.filter(u => convMap[u.username]);
  if (withConv.length) {
    html += `<div class="section-label">${t('conversations')}</div>`;
    html += withConv.map(u => userItemHtml(u, convMap[u.username])).join('');
  }

  html += `<div class="section-label">${t('allMembers')}</div>`;
  html += others.length ? others.map(u => userItemHtml(u, convMap[u.username] || null)).join('') :
    `<div style="padding:12px 16px;font-size:0.82rem;color:var(--muted);">${t('noMembers')}</div>`;

  list.innerHTML = html;
}

function userItemHtml(u, conv) {
  const av = u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : (u.display_name || u.username || '?').charAt(0).toUpperCase();
  const lastMsg = conv ? (conv.from_id == ME?.id ? t('you') + ': ' : '') + esc((conv.content || '').slice(0, 30)) : t('startChat');
  const active = currentPeer === u.username ? 'active' : '';
  const role = u.role === 'admin' ? `<span class="u-badge">${SVG.like}${t('admin')}</span>` : '';
  return `<div class="user-item ${active}" onclick="openChat('${esc(u.username)}')">
    <div class="u-av">${av}</div>
    <div class="u-info">
      <div class="u-name">${role}${esc(u.display_name || u.username)}</div>
      <div class="u-last">${lastMsg}</div>
    </div>
  </div>`;
}

function updateTopbarPeer(peer) {
  const av = peer.avatar ? `<img src="${esc(peer.avatar)}" alt="">` : (peer.display_name || peer.username || '?').charAt(0).toUpperCase();
  const role = peer.role === 'admin' ? t('admin') : t('member');
  document.getElementById('topbarTitle').innerHTML = `
    <div class="topbar-peer" onclick="window.location='/profile?u='+encodeURIComponent('${esc(peer.username)}')">
      <div class="topbar-peer-av">${av}</div>
      <div>
        <div class="topbar-peer-name">${esc(peer.display_name || peer.username)}</div>
        <div class="topbar-peer-role">${role}</div>
      </div>
    </div>`;
}

// ============================================================
//  فتح المحادثة (من Malines)
// ============================================================
async function openChat(username) {
  currentPeer = username;
  if (window.innerWidth <= 680) toggleSidebar(false);
  renderSidebar();

  const peer = allUsers.find(u => u.username === username) || { username };
  updateTopbarPeer(peer);

  // بناء واجهة المحادثة
  document.getElementById('chatMain').innerHTML = `
    <div class="msgs-area" id="msgsArea"></div>
    <div class="img-preview-bar" id="imgPreviewBar">
      <img id="imgPreviewThumb" src="" alt="">
      <button class="img-rm-btn" onclick="removeChatImg()">${SVG.close}</button>
      <span style="font-size:0.76rem;color:var(--muted);">${t('imageAttached')}</span>
    </div>
    <div class="input-area">
      <button class="btn-attach" onclick="document.getElementById('chatImgFile').click()" title="${t('attach')}">${SVG.attach}</button>
      <input type="file" id="chatImgFile" accept=".jpg,.jpeg,image/jpeg" style="display:none;" onchange="onChatImg(event)">
      <textarea class="msg-input" id="msgInput" placeholder="${t('sendPlaceholder')}" rows="1" onkeydown="onKey(event)" oninput="autoResize(this)"></textarea>
      <button class="send-btn" id="sendBtn" onclick="sendMsg()">${SVG.send}</button>
    </div>`;

  await loadMsgs(username);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => loadMsgs(username, false), 4000);
}

// ============================================================
//  تحميل وعرض الرسائل (نسخة Malines الأصلية)
// ============================================================
async function loadMsgs(username, scroll = true) {
  try {
    const msgs = await apiFetch('/api/messages/' + encodeURIComponent(username));
    if (!Array.isArray(msgs)) return;
    renderMsgs(msgs, scroll);
  } catch (e) {}
}

function renderMsgs(msgs, scroll = true) {
  const area = document.getElementById('msgsArea');
  if (!area) return;
  if (!msgs.length) {
    area.innerHTML = '<div style="text-align:center;color:var(--muted);padding:30px;font-size:0.85rem;font-weight:600;">' + t('noMessages') + '</div>';
    return;
  }
  let html = '', lastDay = '';
  msgs.forEach((m, i) => {
    const isMine = m.from_id == ME?.id;
    const day = fmtDay(m.created_at);
    if (day !== lastDay) {
      html += `<div class="date-divider"><span>${day}</span></div>`;
      lastDay = day;
    }
    const next = msgs[i + 1];
    const isLast = !next || next.from_id != m.from_id;
    const av = m.from_avatar ? `<img src="${esc(m.from_avatar)}" alt="">` : (m.from_name || '?').charAt(0).toUpperCase();
    const rc = msgReactions[m.id] || { reactions: [], userReaction: null };
    const reactionHtml = rc.reactions && rc.reactions.length ?
      `<div class="msg-reaction" onclick="togglePicker(${m.id})">${rc.reactions.map(r => r.icon || r.emoji).join('')} <span style="font-size:0.7rem;color:var(--muted);">${rc.reactions.reduce((s, r) => s + Number(r.count), 0)}</span></div>` : '';
    html += `<div class="msg-row ${isMine ? 'mine' : 'theirs'}">
      ${!isMine ? `<div class="msg-av ${isLast ? '' : 'invisible'}">${av}</div>` : ''}
      <div class="bubble-wrap">
        <div class="bubble" id="bubble-${m.id}" onclick="togglePicker(${m.id})">
          ${m.image ? `<img class="bubble-img" src="${esc(m.image)}" loading="lazy" onerror="this.style.display='none'">` : ''}
          ${m.content ? esc(m.content) : ''}
          <div class="react-picker" id="picker-${m.id}">
            ${REACTIONS.map(r => `<button class="r-emoji ${rc?.userReaction === r.emoji ? 'active' : ''}" onclick="reactMsg(event,${m.id},'${r.emoji}')" title="${r.label}">${r.icon}</button>`).join('')}
          </div>
        </div>
        ${reactionHtml}
        ${isLast ? `<div class="msg-time">${fmtTime(m.created_at)}</div>` : ''}
      </div>
      ${isMine ? `<div class="msg-av ${isLast ? '' : 'invisible'}">${av}</div>` : ''}
    </div>`;
  });
  area.innerHTML = html;
  if (scroll) area.scrollTop = area.scrollHeight;
}

// ============================================================
//  التفاعلات (من Malines)
// ============================================================
function togglePicker(id) {
  const p = document.getElementById('picker-' + id);
  if (!p) return;
  document.querySelectorAll('.react-picker.show').forEach(x => { if (x !== p) x.classList.remove('show'); });
  p.classList.toggle('show');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.bubble')) document.querySelectorAll('.react-picker.show').forEach(p => p.classList.remove('show'));
});

async function reactMsg(e, mid, emoji) {
  e.stopPropagation();
  document.querySelectorAll('.react-picker.show').forEach(p => p.classList.remove('show'));
  const d = await apiFetch('/api/messages/react/' + mid, 'POST', { emoji });
  if (d.success) {
    msgReactions[mid] = { reactions: d.reactions, userReaction: d.userReaction };
  }
  if (currentPeer) await loadMsgs(currentPeer, false);
}

// ============================================================
//  الصور والإرسال (من Malines)
// ============================================================
function onChatImg(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (!f.type.match('image/jpeg')) { showToast('JPG/JPEG فقط', 'error'); return; }
  const r = new FileReader();
  r.onload = ev => {
    chatImgBase64 = ev.target.result;
    document.getElementById('imgPreviewThumb').src = chatImgBase64;
    document.getElementById('imgPreviewBar').style.display = 'flex';
  };
  r.readAsDataURL(f);
  e.target.value = '';
}
function removeChatImg() {
  chatImgBase64 = '';
  document.getElementById('imgPreviewBar').style.display = 'none';
}

async function sendMsg() {
  const input = document.getElementById('msgInput');
  const content = input?.value.trim() || '';
  if (!content && !chatImgBase64) return;
  input.value = '';
  input.style.height = '';
  document.getElementById('sendBtn').disabled = true;
  try {
    let imageUrl = '';
    if (chatImgBase64) {
      const up = await apiFetch('/api/upload', 'POST', { image: chatImgBase64 });
      if (up.url) imageUrl = up.url;
      removeChatImg();
    }
    await apiFetch('/api/messages/' + encodeURIComponent(currentPeer), 'POST', { content, image: imageUrl });
    await loadMsgs(currentPeer);
    loadSidebar();
  } catch (e) {}
  document.getElementById('sendBtn').disabled = false;
}

function onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }
function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }

// ============================================================
//  الشريط الجانبي في الهاتف (من Malines)
// ============================================================
function toggleSidebar(force) {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  const open = force !== undefined ? force : !sb.classList.contains('open');
  sb.classList.toggle('open', open);
  ov.classList.toggle('show', open);
}

// ============================================================
//  إنشاء مجموعة (من Malines)
// ============================================================
async function openCreateGroup() {
  document.getElementById('cgName').value = '';
  document.getElementById('createGroupModal').classList.add('show');
  const others = Array.isArray(allUsers) ? allUsers.filter(u => u.username !== ME?.username) : [];
  document.getElementById('cgMembers').innerHTML = others.map(u => `
    <label class="member-check">
      <input type="checkbox" value="${u.id}">
      <div class="u-av" style="width:28px;height:28px;font-size:0.78rem;flex-shrink:0;">
        ${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : ((u.display_name || u.username || '?').charAt(0).toUpperCase())}
      </div>
      <span>${esc(u.display_name || u.username)}</span>
    </label>`).join('');
}
function closeCreateGroup() { document.getElementById('createGroupModal').classList.remove('show'); }
document.getElementById('createGroupModal').addEventListener('click', e => { if (e.target === document.getElementById('createGroupModal')) closeCreateGroup(); });

async function createGroup() {
  const name = document.getElementById('cgName').value.trim();
  if (!name) { showToast(t('groupName') + ' ' + t('error'), 'error'); return; }
  const members = [...document.querySelectorAll('#cgMembers input:checked')].map(i => Number(i.value));
  const btn = document.getElementById('createGroupBtn');
  btn.disabled = true;
  btn.textContent = '...';
  const d = await apiFetch('/api/groups', 'POST', { name, members });
  if (d.id) {
    closeCreateGroup();
    showToast(t('groupCreated'));
    window.location = '/group?g=' + d.id;
  } else {
    showToast(d.error || t('error'), 'error');
    btn.disabled = false;
    btn.innerHTML = `<span id="modalCreateBtn">${t('create')}</span>`;
  }
}

// ====== بدء التشغيل ======
init();
</script>
</body>
</html>
