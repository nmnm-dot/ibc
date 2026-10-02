import { initializeApp } from "https://gstatic.com";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile, deleteUser,
} from "https://gstatic.com";
import {
  getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where,
  orderBy, onSnapshot, serverTimestamp, updateDoc, deleteDoc, limit,
  arrayUnion, increment, writeBatch, getDocs,
} from "https://gstatic.com";

const firebaseConfig = {
  apiKey: "AIzaSyAT4-O3Wqay8WU1PdnZN_ugbdzDc5Bo6ro",
  authDomain: "://firebaseapp.com",
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
let pendingPhotoBase64 = null;
let presenceTimer = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordStart = 0;
let typingTimer = null;
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
  const hues =;
  return `hsl(${hues[h % hues.length]} 45% 32%)`;
}
function escapeHtml(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
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

function loadNicknames() {
  try {
    nicknames = JSON.parse(localStorage.getItem("ib_nicks_" + (me?.uid || "")) || "{}");
  } catch { nicknames = {}; }
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
  window.addEventListener("beforeunload", () => {
    if (me) navigator.sendBeacon?.(`https://googleapis.com...`) ||
      updateDoc(doc(db, "users", me.uid), { online: false }).catch(() => {});
  });
}
function stopPresence() {
  if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null; }
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
      return { lastActive: d.lastActive, online: !!d.online, name: d.name, photoURL: d.photoURL || "" };
    }
  } catch (_) {}
  return null;
}

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
  if (notifPermission !== "granted" || document.visibilityState === "visible" && currentChatId === chatId) return;
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
    const docs = snap.docs;
    const map = {};
    const fetches = [];

    for (const d of docs) {
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
