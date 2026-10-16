import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile, deleteUser,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where,
  orderBy, onSnapshot, serverTimestamp, updateDoc, deleteDoc, limit,
  arrayUnion, increment, writeBatch, getDocs,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAT4-O3Wqay8WU1PdnZN_ugbdzDc5Bo6ro",
  authDomain: "ib-chat-8aa84.firebaseapp.com",
  projectId: "ib-chat-8aa84",
  storageBucket: "ib-chat-8aa84.firebasestorage.app",
  messagingSenderId: "775368610720",
  appId: "1:775368610720:web:de966ab2c6ebdd37d8cac5",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (s, r = document) => r.querySelector(s); const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const EMOJIS = ["😀","😁","😂","🤣","😊","😍","😘","🥰","😅","😉","😎","🤔","😴","🙌","👍","👎","❤️","🔥","✨","🎉","🙏","✅","❌","👋","💪","🤝","💯","🌟","💕","😭","😤","😡","😱","🤩","😇","🤗","🫡","🫠","🤡","👻","💀","👀","💬","📱","⏰","💡","🚀","⭐","💔","🥺","😏","😈","💋","🌹"];

let me = null;
let conversations = {};
let currentChatId = null;
let unsubMessages = null;
let unsubChats = null;
let isInChatView = false;
let nicknames = {};
let presenceTimer = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordStart = 0;
let lastNotifiedMsg = {};
let notifPermission = "default";

function normalizeIB(v) {
  return String(v || "").trim().replace(/\D/g, "");
}
function isValidIB(ib) {
  return /^\d{9}$/.test(ib);
}
function ibToEmail(ib) {
  return `${normalizeIB(ib)}@ibchat.app`;
}
function initial(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
}
function hashColor(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hues = [150, 170, 190, 210, 280, 20, 340];
  return `hsl(${hues[h % hues.length]} 45% 32%)`;
}
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function fmtTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "اليوم";
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "أمس";
  return d.toLocaleDateString("ar-EG");
}
function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2800);
}
function chatIdFor(a, b) {
  return [a, b].sort().join("_");
}

function loadNicknames() {
  try {
    nicknames = JSON.parse(localStorage.getItem("ib_nicks_" + (me?.uid || "")) || "{}");
  } catch {
    nicknames = {};
  }
}
function saveNicknames() {
  localStorage.setItem("ib_nicks_" + (me?.uid || ""), JSON.stringify(nicknames));
}

function showAuth() {
  $("#auth-screen").classList.remove("hidden");
  $("#app").classList.add("hidden");
  isInChatView = false;
  stopPresence();
}
function showApp() {
  $("#auth-screen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  updateMeUI();
  loadNicknames();
  startPresence();
  requestNotifPermission();
}
function updateMeUI() {
  if (!me) return;
  $("#me-name").textContent = me.name;
  $("#me-ib").textContent = me.ib;
  setAvatar($("#me-av"), me.name, me.photoURL, me.ib);
}
function setAvatar(el, name, photoURL, seed) {
  if (!el) return;
  if (photoURL) {
    el.innerHTML = `<img src="${photoURL}" alt="" loading="lazy">`;
    el.style.background = "transparent";
  } else {
    el.innerHTML = "";
    el.textContent = initial(name);
    el.style.background = hashColor(seed || name);
  }
}
function displayName(c) {
  if (!c) return "مستخدم";
  if (c.isGroup) return c.groupName || "مجموعة";
  return nicknames[c.otherUid] || c.otherName || "مستخدم";
}

function startPresence() {
  stopPresence();
  const beat = async () => {
    if (!me) return;
    try {
      await updateDoc(doc(db, "users", me.uid), {
        lastActive: serverTimestamp(),
        online: true,
      });
    } catch (_) {}
  };
  beat();
  presenceTimer = setInterval(beat, 30000);
  if (!startPresence._bound) {
    document.addEventListener("visibilitychange", () => {
      if (!me) return;
      if (document.visibilityState === "visible") beat();
      else updateDoc(doc(db, "users", me.uid), { online: false }).catch(() => {});
    });
    startPresence._bound = true;
  }
}
function stopPresence() {
  if (presenceTimer) {
    clearInterval(presenceTimer);
    presenceTimer = null;
  }
  if (me) {
    updateDoc(doc(db, "users", me.uid), { online: false }).catch(() => {});
  }
}

function formatLastSeen(ts, isOnline) {
  if (!isOnline) {
    if (!ts) return "غير متصل";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60 * 60 * 1000) return `آخر ظهور منذ ${Math.floor(diff / 60000)} د`;
    if (diff < 24 * 60 * 60 * 1000) return `آخر ظهور ${fmtTime(ts)}`;
    return `آخر ظهور ${fmtDay(ts)}`;
  }
  
  if (!ts) return "متصل الآن";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  
  if (diff < 45 * 1000) return "متصل الآن";
  return `آخر ظهور ${fmtTime(ts)}`;
}
function listenUserStatus(uid, callback) {
  if (!uid) return null;
  return onSnapshot(doc(db, "users", uid), (snap) => {
    if (snap.exists()) {
      const d = snap.data();
      callback({
        lastActive: d.lastActive,
        online: !!d.online,
        name: d.name,
        photoURL: d.photoURL || "",
      });
    }
  });
}
async function requestNotifPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    notifPermission = "granted";
    return;
  }
  if (Notification.permission !== "denied") {
    try {
      notifPermission = await Notification.requestPermission();
    } catch (_) {}
  }
}
function showNotification(title, body, chatId) {
  if (notifPermission !== "granted") return;
  if (document.visibilityState === "visible" && currentChatId === chatId) return;
  try {
    const n = new Notification(title || "IB Chat", {
      body: body || "رسالة جديدة",
      icon: "/favicon.ico",
      tag: chatId || "ibchat",
      dir: "rtl",
      lang: "ar",
    });
    n.onclick = () => {
      window.focus();
      if (chatId) openChat(chatId);
      n.close();
    };
  } catch (_) {}
}

async function register(name, ibRaw, pass) {
  const ib = normalizeIB(ibRaw);
  name = name.trim();
  if (name.length < 2) return toast("الاسم قصير");
  if (!isValidIB(ib)) return toast("الـ IB لازم 9 أرقام");
  if (pass.length < 6) return toast("كلمة السر ٦ حروف على الأقل");
  if ((await getDoc(doc(db, "ibs", ib))).exists()) return toast("الـ IB متاخد");
  try {
    const cred = await createUserWithEmailAndPassword(auth, ibToEmail(ib), pass);
    const uid = cred.user.uid;
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", uid), {
      ib, name, photoURL: "", lastActive: serverTimestamp(), online: true, createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, "ibs", ib), { uid, name });
    toast("تم إنشاء الحساب ✨");
  } catch (e) {
    console.error(e);
    toast(e.code === "auth/email-already-in-use" ? "الـ IB متاخد" : "حصل خطأ");
  }
}
async function login(ibRaw, pass) {
  const ib = normalizeIB(ibRaw);
  if (!isValidIB(ib)) return toast("الـ IB لازم 9 أرقام");
  if (!pass) return toast("املأ البيانات");
  try {
    await signInWithEmailAndPassword(auth, ibToEmail(ib), pass);
  } catch (e) {
    console.error(e);
    toast("IB أو كلمة السر غلط");
  }
}
async function loadMe(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) {
    await signOut(auth);
    toast("الحساب مش مكتمل");
    return null;
  }
  const d = snap.data();
  return { uid: user.uid, ib: d.ib, name: d.name, photoURL: d.photoURL || "" };
}

function listenConversations() {
  if (unsubChats) unsubChats();
  const q = query(collection(db, "conversations"), where("participants", "array-contains", me.uid));
  unsubChats = onSnapshot(q, async (snap) => {
    const map = {};
    const fetches = [];
    for (const d of snap.docs) {
      const data = d.data();
      const chatId = d.id;
      const isGroup = !!data.isGroup;
      if (isGroup) {
        map[chatId] = {
          id: chatId, ...data, isGroup: true, otherUid: null,
          otherName: data.groupName || "مجموعة", otherIb: "", otherPhoto: "",
          unread: data.unread?.[me.uid] || 0,
        };
        continue;
      }
      const otherUid = (data.participants || []).find((x) => x !== me.uid) || null;
      const base = {
        id: chatId, ...data, isGroup: false, otherUid,
        otherName: (data.names && otherUid && data.names[otherUid]) || "مستخدم",
        otherIb: (data.ibs && otherUid && data.ibs[otherUid]) || "—",
        otherPhoto: (data.photos && otherUid && data.photos[otherUid]) || "",
        unread: data.unread?.[me.uid] || 0,
      };
      if (otherUid) {
        fetches.push(
          getDoc(doc(db, "users", otherUid)).then((uSnap) => {
            if (uSnap.exists()) {
              const u = uSnap.data();
              if (u.photoURL) base.otherPhoto = u.photoURL;
              if (u.name) base.otherName = u.name;
              base._online = !!u.online;
              base._lastActive = u.lastActive;
            }
            map[chatId] = base;
          }).catch(() => { map[chatId] = base; })
        );
      } else {
        map[chatId] = base;
      }
    }
    if (fetches.length) await Promise.all(fetches);
    conversations = map;
    renderChatList();
    if (currentChatId && conversations[currentChatId]) {
      updatePeerHeader(conversations[currentChatId]);
    }
  }, (err) => {
    console.error(err);
    toast("مشكلة في تحميل المحادثات");
  });
}

let peerStatusUnsub = null;

function updatePeerHeader(c) {
  if (!c) return;

  if (peerStatusUnsub) {
    peerStatusUnsub();
    peerStatusUnsub = null;
  }

  $("#peer-name").textContent = displayName(c);
  setAvatar($("#peer-av"), displayName(c), c.otherPhoto, c.otherIb || c.id);

  if (c.isGroup) {
    $("#peer-sub").textContent = `${c.participants?.length || 0} أعضاء`;
    $("#peer-sub").classList.remove("online");
  } else if (c.otherUid) {
    peerStatusUnsub = listenUserStatus(c.otherUid, (st) => {
      const statusText = formatLastSeen(st.lastActive, st.online);
      const isActuallyOnline = statusText === "متصل الآن";

      $("#peer-sub").textContent = statusText;
      $("#peer-sub").classList.toggle("online", isActuallyOnline);

      if (st.name) c.otherName = st.name;
      if (st.photoURL) c.otherPhoto = st.photoURL;
    });
  } else {
    $("#peer-sub").textContent = c.otherIb || "—";
    $("#peer-sub").classList.remove("online");
  }
}
function renderChatList() {
  const q = ($("#search").value || "").trim().toLowerCase();
  const list = Object.values(conversations).sort(
    (a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0)
  );
  const box = $("#chat-list");
  box.innerHTML = "";
  const filtered = list.filter((c) => {
    const hay = (displayName(c) + " " + (c.otherIb || "") + " " + (c.groupName || "")).toLowerCase();
    return !q || hay.includes(q);
  });
  filtered.forEach((c) => {
    const el = document.createElement("div");
    el.className = "chat-item" + (currentChatId === c.id ? " active" : "");
    const name = displayName(c);
    const avContent = c.otherPhoto ? `<img src="${c.otherPhoto}" alt="" loading="lazy">` : initial(name);
    const avStyle = c.otherPhoto ? "" : `style="background:${hashColor(c.otherIb || c.id)}"`;
    const unreadBadge = c.unread > 0 ? `<span class="badge">${c.unread > 99 ? "99+" : c.unread}</span>` : "";
    const onlineDot = !c.isGroup && c._online ? '<span class="online-dot"></span>' : "";
    el.innerHTML = `
      <div class="avatar" ${avStyle}>${avContent}${onlineDot}</div>
      <div class="item-body">
        <div class="item-top">
          <div class="item-name">${c.isGroup ? '<span class="group-badge">مجموعة</span>' : ""}${escapeHtml(name)}</div>
          <div class="item-time">${c.updatedAt ? fmtTime(c.updatedAt) : ""}</div>
        </div>
        <div class="item-bottom">
          <div class="item-preview">${escapeHtml(c.lastMessage || "ابدأ المحادثة")}</div>
          ${unreadBadge}
        </div>
        ${c.isGroup ? "" : `<div class="ib-tag">${escapeHtml(c.otherIb)}</div>`}
      </div>`;
    el.onclick = () => openChat(c.id);
    box.appendChild(el);
  });
  if (!list.length) {
    box.innerHTML = `<div style="padding:20px;color:#8696a0;text-align:center;font-size:14px">مفيش محادثات لسه.<br>اضغط ✎ عشان تبدأ</div>`;
  }
}

async function openChat(chatId) {
  if (!chatId || !conversations[chatId]) {
    toast("المحادثة مش موجودة");
    return;
  }
  currentChatId = chatId;
  isInChatView = true;
  const c = conversations[chatId];
  history.pushState({ chat: chatId }, "", "#chat");
  $("#empty-state").classList.add("hidden");
  $("#conversation").classList.remove("hidden");
  updatePeerHeader(c);
  if (window.innerWidth <= 860) $("#app .sidebar").classList.add("mobile-hide");
  renderChatList();
  listenMessages(chatId);
  if (c.unread > 0) {
    try {
      await updateDoc(doc(db, "conversations", chatId), { ["unread." + me.uid]: 0 });
    } catch (_) {}
  }
  setTimeout(() => { try { $("#msg-input").focus(); } catch (_) {} }, 200);
}

function goBackToList() {
  if (peerStatusUnsub) { peerStatusUnsub(); peerStatusUnsub = null; }
  isInChatView = false;
  currentChatId = null;
  $("#app .sidebar").classList.remove("mobile-hide");
  $("#conversation").classList.add("hidden");
  $("#empty-state").classList.remove("hidden");
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  renderChatList();
  history.pushState({ chat: null }, "", "#");
}

function hideMsgMenu() {
  const menu = $("#msg-menu");
  if (menu) menu.remove();
}

let pendingReply = null;

function showMsgMenu(e, msgId, isMine, isPinned, msgText, msgData = {}) {
  hideMsgMenu();
  e.preventDefault();
  e.stopPropagation();
  const menu = document.createElement("div");
  menu.id = "msg-menu";
  menu.className = "msg-menu";

  // رد
  const replyBtn = document.createElement("button");
  replyBtn.textContent = "رد";
  replyBtn.onclick = (ev) => {
    ev.stopPropagation();
    hideMsgMenu();
    pendingReply = {
      id: msgId,
      text: msgText || (msgData.type === "image" ? "📷 صورة" : msgData.type === "audio" ? "🎤 صوت" : ""),
      name: isMine ? me.name : (conversations[currentChatId]?.otherName || "مستخدم"),
    };
    showReplyBar();
    $("#msg-input")?.focus();
  };
  menu.appendChild(replyBtn);

  const pinBtn = document.createElement("button");
  pinBtn.textContent = isPinned ? "إلغاء التثبيت" : "تثبيت";
  pinBtn.onclick = async (ev) => {
    ev.stopPropagation();
    hideMsgMenu();
    try {
      await updateDoc(doc(db, "conversations", currentChatId, "messages", msgId), { pinned: !isPinned });
      toast(isPinned ? "تم إلغاء التثبيت" : "تم التثبيت");
    } catch { toast("فشل"); }
  };
  menu.appendChild(pinBtn);

  if (isMine) {
    const delBtn = document.createElement("button");
    delBtn.textContent = "مسح عندي";
    delBtn.className = "danger";
    delBtn.onclick = async (ev) => {
      ev.stopPropagation();
      hideMsgMenu();
      if (!confirm("مسح الرسالة؟")) return;
      try {
        await deleteDoc(doc(db, "conversations", currentChatId, "messages", msgId));
        await refreshLastMessage(currentChatId);
        toast("تم المسح");
      } catch { toast("فشل"); }
    };
    menu.appendChild(delBtn);
  }

  if (msgText) {
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "نسخ";
    copyBtn.onclick = async (ev) => {
      ev.stopPropagation();
      hideMsgMenu();
      try {
        // نسخ نظيف بدون تدخل جوجل أو أي ترجمة
        await navigator.clipboard.writeText(msgText);
        toast("اتنسخ ✓");
      } catch {
        // fallback آمن
        const ta = document.createElement("textarea");
        ta.value = msgText;
        ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toast("اتنسخ ✓");
      }
    };
    menu.appendChild(copyBtn);
  }

  document.body.appendChild(menu);
  const x = Math.min(e.clientX || e.touches?.[0]?.clientX || 100, window.innerWidth - 160);
  const y = Math.min(e.clientY || e.touches?.[0]?.clientY || 100, window.innerHeight - 140);
  menu.style.left = x + "px";
  menu.style.top = y + "px";
}

function showReplyBar() {
  let bar = $("#composer-reply");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "composer-reply";
    bar.className = "composer-reply";
    bar.innerHTML = `
      <div class="reply-info">
        <div class="r-name"></div>
        <div class="r-text"></div>
      </div>
      <button class="cancel-reply" id="cancel-reply">✕</button>
    `;
    const composer = $(".composer");
    if (composer) composer.parentNode.insertBefore(bar, composer);
    $("#cancel-reply").onclick = () => {
      pendingReply = null;
      bar.classList.remove("show");
    };
  }
  if (pendingReply) {
    bar.querySelector(".r-name").textContent = "رد على " + pendingReply.name;
    bar.querySelector(".r-text").textContent = pendingReply.text;
    bar.classList.add("show");
  }
}

async function refreshLastMessage(chatId) {
  try {
    const q = query(collection(db, "conversations", chatId, "messages"), orderBy("createdAt", "desc"), limit(1));
    const snap = await getDocs(q);
    let last = "";
    if (!snap.empty) {
      const m = snap.docs[0].data();
      last = m.type === "audio" ? "🎤 رسالة صوتية" : m.type === "image" ? "📷 صورة" : m.text || "";
    }
    await updateDoc(doc(db, "conversations", chatId), { lastMessage: last, updatedAt: serverTimestamp() });
  } catch (_) {}
}
async function markMessagesSeen(chatId, docs) {
  const updates = [];
  for (const d of docs) {
    const m = d.data();
    if (m.senderId !== me.uid && !(m.seenBy || []).includes(me.uid)) {
      updates.push(updateDoc(doc(db, "conversations", chatId, "messages", d.id), { seenBy: arrayUnion(me.uid) }));
    }
  }
  if (updates.length) {
    try { await Promise.all(updates); } catch (_) {}
  }
}

async function sendMessage(text = "", type = "text", extra = {}) {
  if (!currentChatId || !me) return;
  const t = text.trim();
  if (!t && type === "text") return;
  if (type === "image" && extra.image && extra.image.length > 900000) return toast("الصورة كبيرة أوي");
  if (type === "audio" && extra.audio && extra.audio.length > 900000) return toast("التسجيل طويل أوي");

  try {
    const c = conversations[currentChatId];
    const last = type === "audio" ? "🎤 رسالة صوتية" : type === "image" ? "📷 صورة" : t;
    const unreadUpdate = {};
    if (c?.participants) {
      c.participants.forEach((uid) => {
        if (uid !== me.uid) unreadUpdate["unread." + uid] = increment(1);
      });
    }

    const payload = {
      senderId: me.uid,
      text: t,
      type,
      createdAt: serverTimestamp(),
      seenBy: [me.uid],
      ...extra
    };

    // إضافة بيانات الرد لو موجودة
    if (pendingReply) {
      payload.replyTo = pendingReply.id;
      payload.replyText = pendingReply.text;
      payload.replyName = pendingReply.name;
      pendingReply = null;
      const bar = $("#composer-reply");
      if (bar) bar.classList.remove("show");
    }

    await addDoc(collection(db, "conversations", currentChatId, "messages"), payload);

    await updateDoc(doc(db, "conversations", currentChatId), {
      lastMessage: last,
      updatedAt: serverTimestamp(),
      ...unreadUpdate,
    });
  } catch (e) {
    console.error("خطأ أثناء الإرسال:", e);
    toast("فشل إرسال الرسالة");
  }
}

function listenMessages(chatId) {
  if (unsubMessages) unsubMessages();
  const box = $("#messages");
  box.innerHTML = '<div class="loading-msgs">جاري التحميل...</div>';
  const q = query(collection(db, "conversations", chatId, "messages"), orderBy("createdAt", "asc"), limit(300));
  unsubMessages = onSnapshot(q, (snap) => {
    const wasAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 100;
    box.innerHTML = "";
    let lastDay = "";
    const docs = [...snap.docs].sort((a, b) => {
      const ap = a.data().pinned ? 1 : 0;
      const bp = b.data().pinned ? 1 : 0;
      if (bp !== ap) return bp - ap;
      return (a.data().createdAt?.toMillis?.() || 0) - (b.data().createdAt?.toMillis?.() || 0);
    });
    markMessagesSeen(chatId, snap.docs);
    if (!snap.empty) {
      const lastDoc = snap.docs[snap.docs.length - 1];
      const lastM = lastDoc.data();
      if (lastM.senderId !== me.uid && lastDoc.id !== lastNotifiedMsg[chatId]) {
        lastNotifiedMsg[chatId] = lastDoc.id;
        const c = conversations[chatId];
        const preview = lastM.type === "audio" ? "🎤 رسالة صوتية" : lastM.type === "image" ? "📷 صورة" : lastM.text || "رسالة جديدة";
        showNotification(displayName(c) || "IB Chat", preview, chatId);
      }
    }
    if (docs.length === 0) {
      box.innerHTML = '<div class="empty-msgs">مفيش رسائل لسه… ابعت أول رسالة 💬</div>';
      return;
    }
    docs.forEach((d) => {
      const m = d.data();
      const day = fmtDay(m.createdAt);
      if (day && day !== lastDay && !m.pinned) {
        lastDay = day;
        const chip = document.createElement("div");
        chip.className = "day-chip";
        chip.textContent = day;
        box.appendChild(chip);
      }
      const mine = m.senderId === me.uid;
      const isSeen = mine && (m.seenBy || []).length > 0;
      const b = document.createElement("div");
      b.className = "bubble " + (mine ? "out" : "in") + (m.pinned ? " pinned" : "");
      b.dataset.id = d.id;
      let body = "";
      if (m.type === "audio" && m.audio) {
        body = `<div class="voice-msg"><button class="play-voice" data-src="${m.audio}">▶</button><div class="wave"></div><span class="dur">${m.duration || "0:00"}</span></div>`;
      } else if (m.type === "image" && m.image) {
        body = `<img class="msg-img" src="${m.image}" alt="صورة" loading="lazy">`;
        if (m.text) body += `<div>${escapeHtml(m.text)}</div>`;
      } else {
        body = escapeHtml(m.text || "");
      }
      b.innerHTML = `${body}<div class="meta">${m.pinned ? '<span class="pin-icon">📌</span>' : ""}<span>${fmtTime(m.createdAt)}</span>${mine ? `<span class="ticks ${isSeen ? "seen" : "sent"}">${isSeen ? "✓✓" : "✓"}</span>` : ""}</div>`;
      b.oncontextmenu = (e) => showMsgMenu(e, d.id, mine, !!m.pinned, m.text || "", m);
      b.addEventListener("touchstart", (e) => {
        b._touchTimer = setTimeout(() => showMsgMenu(e, d.id, mine, !!m.pinned, m.text || "", m), 550);
      }, { passive: true });
      b.addEventListener("touchend", () => clearTimeout(b._touchTimer));
      b.addEventListener("touchmove", () => clearTimeout(b._touchTimer));
      const img = b.querySelector(".msg-img");
      if (img) {
        img.onclick = (ev) => {
          ev.stopPropagation();
          openLightbox(img.src);
        };
      }
      const playBtn = b.querySelector(".play-voice");
      if (playBtn) {
        playBtn.onclick = () => {
          const audio = new Audio(playBtn.dataset.src);
          playBtn.textContent = "⏸";
          audio.play();
          audio.onended = () => (playBtn.textContent = "▶");
          audio.onerror = () => { playBtn.textContent = "▶"; toast("مشكلة في تشغيل الصوت"); };
        };
      }
      // دعم الرد
      if (m.replyTo) {
        const replyEl = document.createElement("div");
        replyEl.className = "reply-preview";
        replyEl.innerHTML = `<span class="reply-name">${escapeHtml(m.replyName || "رسالة")}</span> ${escapeHtml(m.replyText || "")}`;
        b.insertBefore(replyEl, b.firstChild);
      }
      box.appendChild(b);
    });
    if (wasAtBottom) box.scrollTop = box.scrollHeight;
  });
}

async function startNewChat(ibRaw) {
  const ib = normalizeIB(ibRaw);
  if (!isValidIB(ib)) return toast("الـ IB لازم 9 أرقام");
  if (ib === me.ib) return toast("مش هتكلم نفسك");
  try {
    const ibSnap = await getDoc(doc(db, "ibs", ib));
    if (!ibSnap.exists()) return toast("الـ IB ده مش موجود");
    const otherUid = ibSnap.data().uid;
    const otherName = ibSnap.data().name || "مستخدم";
    const chatId = chatIdFor(me.uid, otherUid);
    const existing = await getDoc(doc(db, "conversations", chatId));
    if (existing.exists()) {
      $("#new-modal").classList.add("hidden");
      openChat(chatId);
      return;
    }
    const otherUser = await getDoc(doc(db, "users", otherUid));
    const otherPhoto = otherUser.exists() ? otherUser.data().photoURL || "" : "";
    await setDoc(doc(db, "conversations", chatId), {
      participants: [me.uid, otherUid],
      names: { [me.uid]: me.name, [otherUid]: otherName },
      ibs: { [me.uid]: me.ib, [otherUid]: ib },
      photos: { [me.uid]: me.photoURL || "", [otherUid]: otherPhoto },
      lastMessage: "", updatedAt: serverTimestamp(),
      unread: { [me.uid]: 0, [otherUid]: 0 }, isGroup: false,
    });
    $("#new-modal").classList.add("hidden");
    toast("تم بدء المحادثة");
    setTimeout(() => openChat(chatId), 350);
  } catch (e) {
    console.error(e);
    toast("حصل خطأ");
  }
}

async function createGroup(name, memberUids) {
  name = name.trim();
  if (name.length < 2) return toast("اسم المجموعة قصير");
  if (!memberUids.length) return toast("اختار أعضاء");
  const participants = [me.uid, ...memberUids];
  const names = { [me.uid]: me.name };
  const ibs = { [me.uid]: me.ib };
  const photos = { [me.uid]: me.photoURL || "" };
  const unread = { [me.uid]: 0 };
  for (const uid of memberUids) {
    const u = await getDoc(doc(db, "users", uid));
    if (u.exists()) {
      const d = u.data();
      names[uid] = d.name;
      ibs[uid] = d.ib;
      photos[uid] = d.photoURL || "";
      unread[uid] = 0;
    }
  }
  try {
    const ref = await addDoc(collection(db, "conversations"), {
      participants, names, ibs, photos, groupName: name, isGroup: true,
      lastMessage: "", updatedAt: serverTimestamp(), unread, createdBy: me.uid,
    });
    $("#group-modal").classList.add("hidden");
    toast("تم إنشاء المجموعة");
    setTimeout(() => openChat(ref.id), 350);
  } catch (e) {
    console.error(e);
    toast("فشل إنشاء المجموعة");
  }
}

async function saveProfile(name, photoBase64) {
  name = name.trim();
  if (name.length < 2) return toast("الاسم قصير");
  try {
    const updates = { name };
    if (photoBase64) updates.photoURL = photoBase64;
    await updateDoc(doc(db, "users", me.uid), updates);
    await updateProfile(auth.currentUser, { displayName: name, ...(photoBase64 ? { photoURL: photoBase64 } : {}) });
    await updateDoc(doc(db, "ibs", me.ib), { name });
    me.name = name;
    if (photoBase64) me.photoURL = photoBase64;
    updateMeUI();
    $("#profile-modal").classList.add("hidden");
    toast("تم الحفظ");
  } catch (e) {
    console.error(e);
    toast("فشل الحفظ");
  }
}

async function toggleRecording() {
  if (isRecording) {
    mediaRecorder?.stop();
    isRecording = false;
    $("#mic-btn").classList.remove("recording");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    audioChunks = [];
    recordStart = Date.now();
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onload = async () => {
        const durationSec = Math.round((Date.now() - recordStart) / 1000);
        const mins = Math.floor(durationSec / 60);
        const secs = String(durationSec % 60).padStart(2, "0");
        await sendMessage("", "audio", { audio: reader.result, duration: `${mins}:${secs}` });
      };
      reader.readAsDataURL(blob);
    };
    mediaRecorder.start();
    isRecording = true;
    $("#mic-btn").classList.add("recording");
  } catch (e) {
    console.error(e);
    toast("محتاج إذن المايك");
  }
}

function handleImageFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  if (file.size > 1.2 * 1024 * 1024) return toast("الصورة كبيرة (حد أقصى 1MB)");
  const reader = new FileReader();
  reader.onload = () => sendMessage("", "image", { image: reader.result });
  reader.readAsDataURL(file);
}

async function deleteCurrentChat() {
  if (!currentChatId) return toast("مفيش محادثة مفتوحة");
  if (!confirm("حذف المحادثة دي نهائي؟")) return;
  try {
    const msgs = await getDocs(collection(db, "conversations", currentChatId, "messages"));
    const batch = writeBatch(db);
    msgs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, "conversations", currentChatId));
    await batch.commit();
    delete conversations[currentChatId];
    goBackToList();
    toast("تم الحذف");
  } catch (e) {
    console.error(e);
    toast("فشل الحذف");
  }
}

async function deleteAccount() {
  if (!confirm("هتمسح الحساب نهائي؟ مفيش رجوع")) return;
  if (!confirm("متأكد 100%؟")) return;
  try {
    await deleteDoc(doc(db, "ibs", me.ib));
    await deleteDoc(doc(db, "users", me.uid));
    await deleteUser(auth.currentUser);
    toast("تم مسح الحساب");
  } catch (e) {
    console.error(e);
    toast("فشل المسح");
  }
}

/* ========== Lightbox متقدم للصور ========== */
let lightboxScale = 1;
let lightboxX = 0;
let lightboxY = 0;
let isDragging = false;
let startX = 0, startY = 0, startLX = 0, startLY = 0;
let lastTap = 0;
let currentPhotoSrc = "";

function openLightbox(src) {
  if (!src) return;
  currentPhotoSrc = src;
  const modal = $("#photo-modal");
  const img = $("#photo-full");
  if (!modal || !img) return;
  img.src = src;
  lightboxScale = 1;
  lightboxX = 0;
  lightboxY = 0;
  applyLightboxTransform();
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setupLightboxGestures();
}

function closeLightbox() {
  const modal = $("#photo-modal");
  if (modal) modal.classList.add("hidden");
  document.body.style.overflow = "";
  lightboxScale = 1;
  lightboxX = 0;
  lightboxY = 0;
  currentPhotoSrc = "";
}

function setLightboxZoom(s) {
  lightboxScale = Math.max(0.5, Math.min(4, s));
  if (lightboxScale === 1) {
    lightboxX = 0;
    lightboxY = 0;
  }
  applyLightboxTransform();
}

function applyLightboxTransform() {
  const img = $("#photo-full");
  if (img) {
    img.style.transform = `translate(${lightboxX}px, ${lightboxY}px) scale(${lightboxScale})`;
  }
}

function downloadCurrentPhoto() {
  if (!currentPhotoSrc) return;
  try {
    const a = document.createElement("a");
    a.href = currentPhotoSrc;
    a.download = "ibchat-photo-" + Date.now() + ".jpg";
    a.click();
    toast("جاري التحميل...");
  } catch {
    toast("فشل التحميل");
  }
}

function setupLightboxGestures() {
  const body = $("#lightbox-body");
  const img = $("#photo-full");
  if (!body || !img || body._gesturesReady) return;
  body._gesturesReady = true;

  // Double tap zoom
  body.addEventListener("click", (e) => {
    const now = Date.now();
    if (now - lastTap < 300) {
      if (lightboxScale > 1.1) setLightboxZoom(1);
      else setLightboxZoom(2.2);
    }
    lastTap = now;
  });

  // Mouse drag
  body.addEventListener("mousedown", (e) => {
    if (lightboxScale <= 1) return;
    isDragging = true;
    body.classList.add("grabbing");
    startX = e.clientX;
    startY = e.clientY;
    startLX = lightboxX;
    startLY = lightboxY;
  });
  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    lightboxX = startLX + (e.clientX - startX);
    lightboxY = startLY + (e.clientY - startY);
    applyLightboxTransform();
  });
  window.addEventListener("mouseup", () => {
    isDragging = false;
    body.classList.remove("grabbing");
  });

  // Touch drag + pinch
  let lastDist = 0;
  body.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1 && lightboxScale > 1) {
      isDragging = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startLX = lightboxX;
      startLY = lightboxY;
    } else if (e.touches.length === 2) {
      isDragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist = Math.hypot(dx, dy);
    }
  }, { passive: true });

  body.addEventListener("touchmove", (e) => {
    if (e.touches.length === 1 && isDragging) {
      lightboxX = startLX + (e.touches[0].clientX - startX);
      lightboxY = startLY + (e.touches[0].clientY - startY);
      applyLightboxTransform();
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastDist > 0) {
        const delta = dist / lastDist;
        setLightboxZoom(lightboxScale * delta);
      }
      lastDist = dist;
    }
  }, { passive: true });

  body.addEventListener("touchend", () => {
    isDragging = false;
    lastDist = 0;
  });

  // Swipe down to close when not zoomed
  let swipeStartY = 0;
  body.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1 && lightboxScale <= 1.05) {
      swipeStartY = e.touches[0].clientY;
    }
  }, { passive: true });
  body.addEventListener("touchend", (e) => {
    if (lightboxScale <= 1.05 && e.changedTouches[0]) {
      const dy = e.changedTouches[0].clientY - swipeStartY;
      if (Math.abs(dy) > 90) closeLightbox();
    }
  }, { passive: true });

  // Keyboard
  window.addEventListener("keydown", (e) => {
    if ($("#photo-modal")?.classList.contains("hidden")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "+" || e.key === "=") setLightboxZoom(lightboxScale + 0.3);
    if (e.key === "-") setLightboxZoom(lightboxScale - 0.3);
  });
}

function initEvents() {
  $$(".tab").forEach((tab) => {
    tab.onclick = () => {
      $$(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const isLogin = tab.dataset.tab === "login";
      $("#login-form").classList.toggle("hidden", !isLogin);
      $("#register-form").classList.toggle("hidden", isLogin);
    };
  });

  $("#send-btn").onclick = () => {
    const input = $("#msg-input");
    if (input && input.value.trim()) {
      sendMessage(input.value);
      input.value = "";
      $("#emoji-panel").classList.add("hidden");
    }
  };

  $("#msg-input").onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("#send-btn").click();
    }
  };

  $("#login-form").onsubmit = (e) => {
    e.preventDefault();
    login($("#login-ib").value, $("#login-pass").value);
  };
  $("#register-form").onsubmit = (e) => {
    e.preventDefault();
    register($("#reg-name").value, $("#reg-ib").value, $("#reg-pass").value);
  };

  $("#btn-new").onclick = () => {
    $("#new-ib").value = "";
    $("#new-modal").classList.remove("hidden");
  };
  $("#cancel-new").onclick = () => $("#new-modal").classList.add("hidden");
  $("#start-new").onclick = () => startNewChat($("#new-ib").value);

  $("#btn-group").onclick = () => {
    $("#more-menu").classList.add("hidden");
    const box = $("#group-contacts");
    box.innerHTML = "";
    Object.values(conversations).filter((c) => !c.isGroup && c.otherUid).forEach((c) => {
      const div = document.createElement("div");
      div.className = "contact-check";
      div.innerHTML = `<input type="checkbox" value="${c.otherUid}" id="g-${c.otherUid}"><label for="g-${c.otherUid}">${escapeHtml(displayName(c))}</label>`;
      box.appendChild(div);
    });
    $("#group-name").value = "";
    $("#group-modal").classList.remove("hidden");
  };
  $("#cancel-group").onclick = () => $("#group-modal").classList.add("hidden");
  $("#start-group").onclick = () => {
    const name = $("#group-name").value;     const members = [...$$("#group-contacts input:checked")].map((i) => i.value);
    createGroup(name, members);
  };

  $("#me-chip").onclick = () => {
    $("#profile-name").value = me.name;
    const pav = $("#profile-av");
    delete pav.dataset.photo;
    if (me.photoURL) {
      pav.innerHTML = `<img src="${me.photoURL}" alt=""><div class="edit-hint">اضغط لتغيير الصورة</div>`;
      pav.style.background = "transparent";
    } else {
      pav.innerHTML = `<span id="profile-av-letter">${initial(me.name)}</span><div class="edit-hint">اضغط لتغيير الصورة</div>`;
      pav.style.background = "";
    }
    $("#profile-modal").classList.remove("hidden");
  };
  $("#profile-av").onclick = () => $("#profile-file").click();
  $("#profile-file").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1.2 * 1024 * 1024) return toast("الصورة كبيرة");
    const reader = new FileReader();
    reader.onload = () => {
      $("#profile-av").innerHTML = `<img src="${reader.result}" alt=""><div class="edit-hint">اضغط لتغيير الصورة</div>`;
      $("#profile-av").dataset.photo = reader.result;
    };
    reader.readAsDataURL(file);
  };
  $("#cancel-profile").onclick = () => $("#profile-modal").classList.add("hidden");
  $("#save-profile").onclick = () => {
    const photo = $("#profile-av").dataset.photo || null;
    saveProfile($("#profile-name").value, photo);
  };

  $("#btn-nickname").onclick = () => {
    const c = conversations[currentChatId];
    if (!c || c.isGroup) return;
    $("#nick-input").value = nicknames[c.otherUid] || "";
    $("#nick-modal").classList.remove("hidden");
  };
  $("#cancel-nick").onclick = () => $("#nick-modal").classList.add("hidden");
  $("#save-nick").onclick = () => {
    const c = conversations[currentChatId];
    if (!c) return;
    const val = $("#nick-input").value.trim();
    if (val) nicknames[c.otherUid] = val;
    else delete nicknames[c.otherUid];
    saveNicknames();
    updatePeerHeader(c);
    renderChatList();
    $("#nick-modal").classList.add("hidden");
    toast("تم");
  };

  $("#btn-more").onclick = (e) => {
    e.stopPropagation();
    $("#more-menu").classList.toggle("hidden");
  };
  document.addEventListener("click", () => {
    $("#more-menu").classList.add("hidden");
    hideMsgMenu();
    $("#emoji-panel").classList.add("hidden");
  });

  $("#copy-ib").onclick = () => navigator.clipboard.writeText(me.ib).then(() => toast("اتنسخ الـ IB"));
  $("#delete-chat").onclick = deleteCurrentChat;
  $("#delete-account").onclick = deleteAccount;
  $("#open-settings").onclick = () => {
    const menu = $("#more-menu");
    if (menu) menu.classList.add("hidden");

    openCustomModal(
      "الإعدادات",
      `<p>خيارات المظهر والحساب والتنبيهات...</p>`
    );
  }; 
  $("#logout").onclick = async () => {
    await signOut(auth);
    me = null;
    conversations = {};
    currentChatId = null;
    localStorage.clear();
    showAuth();
    toast("تم تسجيل الخروج");
  };

  $("#emoji-btn").onclick = (e) => {
    e.stopPropagation();
    const panel = $("#emoji-panel");
    panel.classList.toggle("hidden");
    if (!panel.dataset.ready) {
      panel.innerHTML = EMOJIS.map((em) => `<span>${em}</span>`).join("");
      panel.onclick = (ev) => {
        if (ev.target.tagName === "SPAN") {
          $("#msg-input").value += ev.target.textContent;
          $("#msg-input").focus();
        }
      };
      panel.dataset.ready = "1";
    }
  };

  $("#img-btn").onclick = () => $("#img-file").click();
  $("#img-file").onchange = (e) => {
    handleImageFile(e.target.files[0]);
    e.target.value = "";
  };

  $("#mic-btn").onclick = toggleRecording;
  $("#back-btn").onclick = goBackToList;
  $("#search").oninput = renderChatList;

  // Lightbox controls
  $("#close-photo").onclick = closeLightbox;
  $("#lightbox-backdrop")?.addEventListener("click", closeLightbox);
  $("#download-photo").onclick = downloadCurrentPhoto;
  $("#zoom-in-photo").onclick = () => setLightboxZoom(lightboxScale + 0.4);
  $("#zoom-out-photo").onclick = () => setLightboxZoom(lightboxScale - 0.4);
  $("#reset-zoom-photo").onclick = () => setLightboxZoom(1);

  $("#peer-av").onclick = () => {
    const c = conversations[currentChatId];
    if (c?.otherPhoto) openLightbox(c.otherPhoto);
  };

  window.addEventListener("popstate", () => {
    if (isInChatView) goBackToList();
  });

  // منع القائمة الافتراضية على الصور عشان النسخ يشتغل نظيف
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".lightbox-img") || e.target.closest(".msg-img")) {
      // نسمح بالقائمة المخصصة بس
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    me = await loadMe(user);
    if (!me) return;
    showApp();
    listenConversations();
  } else {
    me = null;
    conversations = {};
    currentChatId = null;
    if (unsubChats) unsubChats();
    if (unsubMessages) unsubMessages();
    showAuth();
  }
});

initEvents();

function openCustomModal(title, contentHTML) {
  const modal = $("#global-modal");
  const modalTitle = $("#modal-title");
  const modalBody = $("#modal-body");

  if (modalTitle) modalTitle.innerText = title;
  if (modalBody) modalBody.innerHTML = contentHTML;
  if (modal) {
    modal.classList.remove("hidden");
    modal.style.display = "grid";
  }
}

function closeModal() {
  const modal = $("#global-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.style.display = "none";
  }
}

window.addEventListener("click", (event) => {
  const modals = [
    $("#global-modal"),
    $("#new-modal"),
    $("#group-modal"),
    $("#nick-modal"),
  ];

  modals.forEach((modal) => {
    if (modal && event.target === modal) {
      modal.classList.add("hidden");
      modal.style.display = "none";
    }
  });

  const cancelBtn = $("#modal-cancel-btn");
  if (cancelBtn && cancelBtn.contains(event.target)) {
    closeModal();
  }
});
