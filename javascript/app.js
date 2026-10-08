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

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

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

/* ========== Helpers ========== */
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
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2800);
}
function chatIdFor(a, b) {
  return [a, b].sort().join("_");
}

/* ========== Nicknames ========== */
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

/* ========== UI Helpers ========== */
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
  const nick = nicknames[c.otherUid];
  return nick || c.otherName || "مستخدم";
}

/* ========== Presence ========== */
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

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") beat();
    else if (me) {
      updateDoc(doc(db, "users", me.uid), { online: false }).catch(() => {});
    }
  });
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
  if (isOnline) return "متصل الآن";
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 90 * 1000) return "متصل الآن";
  if (diff < 60 * 60 * 1000) return `آخر ظهور منذ ${Math.floor(diff / 60000)} د`;
  if (diff < 24 * 60 * 60 * 1000) return `آخر ظهور ${fmtTime(ts)}`;
  return `آخر ظهور ${fmtDay(ts)}`;
}
async function fetchUserStatus(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const d = snap.data();
      return {
        lastActive: d.lastActive,
        online: !!d.online,
        name: d.name,
        photoURL: d.photoURL || "",
      };
    }
  } catch (_) {}
  return null;
}

/* ========== Notifications ========== */
async function requestNotifPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    notifPermission = "granted";
    return;
  }
  if (Notification.permission !== "denied") {
    try {
      const p = await Notification.requestPermission();
      notifPermission = p;
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

/* ========== Auth ========== */
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
      ib,
      name,
      photoURL: "",
      lastActive: serverTimestamp(),
      online: true,
      createdAt: serverTimestamp(),
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
  return {
    uid: user.uid,
    ib: d.ib,
    name: d.name,
    photoURL: d.photoURL || "",
  };
}

/* ========== Conversations ========== */
function listenConversations() {
  if (unsubChats) unsubChats();
  const q = query(
    collection(db, "conversations"),
    where("participants", "array-contains", me.uid)
  );

  unsubChats = onSnapshot(
    q,
    async (snap) => {
      const map = {};
      const fetches = [];

      for (const d of snap.docs) {
        const data = d.data();
        const isGroup = !!data.isGroup;
        const chatId = d.id;

        if (isGroup) {
          map[chatId] = {
            id: chatId,
            ...data,
            isGroup: true,
            otherUid: null,
            otherName: data.groupName || "مجموعة",
            otherIb: "",
            otherPhoto: "",
            unread: data.unread?.[me.uid] || 0,
          };
          continue;
        }

        const otherUid = (data.participants || []).find((x) => x !== me.uid) || null;
        let otherName = (data.names && otherUid && data.names[otherUid]) || "مستخدم";
        let otherIb = (data.ibs && otherUid && data.ibs[otherUid]) || "—";
        let otherPhoto = (data.photos && otherUid && data.photos[otherUid]) || "";

        const base = {
          id: chatId,
          ...data,
          isGroup: false,
          otherUid,
          otherName,
          otherIb,
          otherPhoto,
          unread: data.unread?.[me.uid] || 0,
        };

        if (otherUid) {
          fetches.push(
            getDoc(doc(db, "users", otherUid))
              .then((uSnap) => {
                if (uSnap.exists()) {
                  const u = uSnap.data();
                  if (u.photoURL) base.otherPhoto = u.photoURL;
                  if (u.name) base.otherName = u.name;
                  base._online = !!u.online;
                  base._lastActive = u.lastActive;
                }
                map[chatId] = base;
              })
              .catch(() => {
                map[chatId] = base;
              })
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
    },
    (err) => {
      console.error("listenConversations error:", err);
      toast("مشكلة في تحميل المحادثات");
    }
  );
}

async function updatePeerHeader(c) {
  if (!c) return;
  $("#peer-name").textContent = displayName(c);
  setAvatar($("#peer-av"), displayName(c), c.otherPhoto, c.otherIb || c.id);

  if (c.isGroup) {
    \( ("#peer-sub").textContent = ` \){c.participants?.length || 0} أعضاء`;
    $("#peer-sub").classList.remove("online");
  } else if (c.otherUid) {
    const st = await fetchUserStatus(c.otherUid);
    if (st) {
      const status = formatLastSeen(st.lastActive, st.online);
      $("#peer-sub").textContent = status || c.otherIb;
      $("#peer-sub").classList.toggle("online", !!st.online);
      if (st.name) c.otherName = st.name;
      if (st.photoURL) c.otherPhoto = st.photoURL;
    } else {
      $("#peer-sub").textContent = c.otherIb || "—";
      $("#peer-sub").classList.remove("online");
    }
  } else {
    $("#peer-sub").textContent = c.otherIb || "—";
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
    const hay = (
      displayName(c) +
      " " +
      (c.otherIb || "") +
      " " +
      (c.groupName || "")
    ).toLowerCase();
    return !q || hay.includes(q);
  });

  filtered.forEach((c) => {
    const el = document.createElement("div");
    el.className = "chat-item" + (currentChatId === c.id ? " active" : "");
    const name = displayName(c);
    const avContent = c.otherPhoto
      ? `<img src="${c.otherPhoto}" alt="" loading="lazy">`
      : initial(name);
    const avStyle = c.otherPhoto
      ? ""
      : `style="background:${hashColor(c.otherIb || c.id)}"`;
    const unreadBadge =
      c.unread > 0
        ? `<span class="badge">${c.unread > 99 ? "99+" : c.unread}</span>`
        : "";
    const onlineDot =
      !c.isGroup && c._online ? '<span class="online-dot"></span>' : "";

    el.innerHTML = `
      <div class="avatar" \( {avStyle}> \){avContent}${onlineDot}</div>
      <div class="item-body">
        <div class="item-top">
          <div class="item-name">${
            c.isGroup ? '<span class="group-badge">مجموعة</span>' : ""
          }${escapeHtml(name)}</div>
          <div class="item-time">${c.updatedAt ? fmtTime(c.updatedAt) : ""}</div>
        </div>
        <div class="item-bottom">
          <div class="item-preview">${escapeHtml(
            c.lastMessage || "ابدأ المحادثة"
          )}</div>
          ${unreadBadge}
        </div>
        \( {c.isGroup ? "" : `<div class="ib-tag"> \){escapeHtml(c.otherIb)}</div>`}
      </div>`;
    el.onclick = () => openChat(c.id);
    box.appendChild(el);
  });

  if (!list.length) {
    box.innerHTML =
      '<div style="padding:20px;color:#8696a0;text-align:center;font-size:14px">مفيش محادثات لسه.<br>اضغط ✎ عشان تبدأ</div>';
  }
}

/* ========== Open / Close Chat ========== */
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
      await updateDoc(doc(db, "conversations", chatId), {
        ["unread." + me.uid]: 0,
      });
    } catch (_) {}
  }

  setTimeout(() => {
    try {
      $("#msg-input").focus();
    } catch (_) {}
  }, 250);

  clearInterval(openChat._t);
  if (!c.isGroup && c.otherUid) {
    openChat._t = setInterval(async () => {
      if (currentChatId !== chatId) return;
      await updatePeerHeader(conversations[chatId] || c);
    }, 20000);
  }
}

function goBackToList() {
  isInChatView = false;
  currentChatId = null;
  clearInterval(openChat._t);
  $("#app .sidebar").classList.remove("mobile-hide");
  $("#conversation").classList.add("hidden");
  $("#empty-state").classList.remove("hidden");
  if (unsubMessages) {
    unsubMessages();
    unsubMessages = null;
  }
  renderChatList();
  history.pushState({ chat: null }, "", "#");
}

/* ========== Messages ========== */
function hideMsgMenu() {
  const menu = $("#msg-menu");
  if (menu) menu.remove();
}

function showMsgMenu(e, msgId, isMine, isPinned, msgText) {
  hideMsgMenu();
  e.preventDefault();
  e.stopPropagation();
  const menu = document.createElement("div");
  menu.id = "msg-menu";
  menu.className = "msg-menu";

  const pinBtn = document.createElement("button");
  pinBtn.textContent = isPinned ? "إلغاء التثبيت" : "تثبيت";
  pinBtn.onclick = async (ev) => {
    ev.stopPropagation();
    hideMsgMenu();
    try {
      await updateDoc(
        doc(db, "conversations", currentChatId, "messages", msgId),
        { pinned: !isPinned }
      );
      toast(isPinned ? "تم إلغاء التثبيت" : "تم التثبيت");
    } catch {
      toast("فشل");
    }
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
        await deleteDoc(
          doc(db, "conversations", currentChatId, "messages", msgId)
        );
        await refreshLastMessage(currentChatId);
        toast("تم المسح");
      } catch {
        toast("فشل");
      }
    };
    menu.appendChild(delBtn);
  }

  if (msgText) {
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "نسخ";
    copyBtn.onclick = (ev) => {
      ev.stopPropagation();
      hideMsgMenu();
      navigator.clipboard
        .writeText(msgText)
        .then(() => toast("اتنسخ"))
        .catch(() => {});
    };
    menu.appendChild(copyBtn);
  }

  document.body.appendChild(menu);
  const x = Math.min(
    e.clientX || (e.touches && e.touches[0]?.clientX) || 100,
    window.innerWidth - 160
  );
  const y = Math.min(
    e.clientY || (e.touches && e.touches[0]?.clientY) || 100,
    window.innerHeight - 140
  );
  menu.style.left = x + "px";
  menu.style.top = y + "px";
}

async function refreshLastMessage(chatId) {
  try {
    const q = query(
      collection(db, "conversations", chatId, "messages"),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    const snap = await getDocs(q);
    let last = "";
    if (!snap.empty) {
      const m = snap.docs[0].data();
      last =
        m.type === "audio"
          ? "🎤 رسالة صوتية"
          : m.type === "image"
          ? "📷 صورة"
          : m.text || "";
    }
    await updateDoc(doc(db, "conversations", chatId), {
      lastMessage: last,
      updatedAt: serverTimestamp(),
    });
  } catch (_) {}
}

async function markMessagesSeen(chatId, docs) {
  const updates = [];
  for (const d of docs) {
    const m = d.data();
    if (m.senderId !== me.uid && !(m.seenBy || []).includes(me.uid)) {
      updates.push(
        updateDoc(doc(db, "conversations", chatId, "messages", d.id), {
          seenBy: arrayUnion(me.uid),
        })
      );
    }
  }
  if (updates.length) {
    try {
      await Promise.all(updates);
    } catch (_) {}
  }
}

function listenMessages(chatId) {
  if (unsubMessages) unsubMessages();
  const box = $("#messages");
  box.innerHTML = '<div class="loading-msgs">جاري التحميل...</div>';

  const q = query(
    collection(db, "conversations", chatId, "messages"),
    orderBy("createdAt", "asc"),
    limit(300)
  );

  unsubMessages = onSnapshot(q, (snap) => {
    const wasAtBottom =
      box.scrollHeight - box.scrollTop - box.clientHeight < 80;

    box.innerHTML = "";
    let lastDay = "";

    const docs = [...snap.docs].sort((a, b) => {
      const ap = a.data().pinned ? 1 : 0;
      const bp = b.data().pinned ? 1 : 0;
      if (bp !== ap) return bp - ap;
      const at = a.data().createdAt?.toMillis?.() || 0;
      const bt = b.data().createdAt?.toMillis?.() || 0;
      return at - bt;
    });

    markMessagesSeen(chatId, snap.docs);

    if (!snap.empty) {
      const lastDoc = snap.docs[snap.docs.length - 1];
      const lastM = lastDoc.data();
      if (
        lastM.senderId !== me.uid &&
        lastDoc.id !== lastNotifiedMsg[chatId]
      ) {
        lastNotifiedMsg[chatId] = lastDoc.id;
        const c = conversations[chatId];
        const preview =
          lastM.type === "audio"
            ? "🎤 رسالة صوتية"
            : lastM.type === "image"
            ? "📷 صورة"
            : lastM.text || "رسالة جديدة";
        showNotification(displayName(c) || "IB Chat", preview, chatId);
      }
    }

    if (docs.length === 0) {
      box.innerHTML =
        '<div class="empty-msgs">مفيش رسائل لسه… ابعت أول رسالة 💬</div>';
      return;
    }

 
