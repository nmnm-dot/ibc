import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile, deleteUser,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where,
  orderBy, onSnapshot, serverTimestamp, updateDoc, deleteDoc, limit, arrayUnion, increment,
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

const EMOJIS = ["😀","😁","😂","🤣","😊","😍","😘","🥰","😅","😉","😎","🤔","😴","🙌","👍","👎","❤️","🔥","✨","🎉","🙏","✅","❌","👋","💪","🤝","💯","🌟","💕","😭","😤","😡","😱","🤩","😇","🤗","🫡","🫠","🤡","👻","💀","👀","💬","📱","⏰","💡","🚀","⭐"];

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
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
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
  toast._t = setTimeout(() => el.classList.add("hidden"), 2500);
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
      await updateDoc(doc(db, "users", me.uid), { lastActive: serverTimestamp() });
    } catch (_) {}
  };
  beat();
  presenceTimer = setInterval(beat, 45000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") beat();
  });
}
function stopPresence() {
  if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null; }
}

function formatLastSeen(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 90 * 1000) return "متصل";
  if (diff < 60 * 60 * 1000) return `آخر ظهور منذ ${Math.floor(diff / 60000)} د`;
  if (diff < 24 * 60 * 60 * 1000) return `آخر ظهور ${fmtTime(ts)}`;
  return `آخر ظهور ${fmtDay(ts)}`;
}

async function fetchLastActive(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) return snap.data().lastActive;
  } catch (_) {}
  return null;
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
      ib, name, photoURL: "", lastActive: serverTimestamp(), createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, "ibs", ib), { uid, name });
    toast("تم إنشاء الحساب");
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
    const photoFetches = [];
    for (const d of snap.docs) {
      const data = d.data();
      const isGroup = !!data.isGroup;
      let otherUid = null, otherName = data.groupName || "مجموعة", otherIb = "", otherPhoto = "";
      if (!isGroup) {
        otherUid = data.participants.find((x) => x !== me.uid);
        otherName = data.names?.[otherUid] || "مستخدم";
        otherIb = data.ibs?.[otherUid] || "—";
        otherPhoto = data.photos?.[otherUid] || "";
        if (otherUid) {
          photoFetches.push(
            getDoc(doc(db, "users", otherUid)).then((uSnap) => {
              if (uSnap.exists()) {
                const u = uSnap.data();
                if (u.photoURL) otherPhoto = u.photoURL;
                if (u.name) otherName = u.name;
              }
              map[d.id] = {
                id: d.id, ...data, isGroup, otherUid, otherName, otherIb, otherPhoto,
                unread: data.unread?.[me.uid] || 0,
              };
            }).catch(() => {
              map[d.id] = {
                id: d.id, ...data, isGroup, otherUid, otherName, otherIb, otherPhoto,
                unread: data.unread?.[me.uid] || 0,
              };
            })
          );
          continue;
        }
      }
      map[d.id] = {
        id: d.id, ...data, isGroup, otherUid, otherName, otherIb, otherPhoto,
        unread: data.unread?.[me.uid] || 0,
      };
    }
    if (photoFetches.length) await Promise.all(photoFetches);
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

async function updatePeerHeader(c) {
  $("#peer-name").textContent = displayName(c);
  setAvatar($("#peer-av"), displayName(c), c.otherPhoto, c.otherIb || c.id);
  if (c.isGroup) {
    $("#peer-sub").textContent = `${c.participants?.length || 0} أعضاء`;
  } else if (c.otherUid) {
    const last = await fetchLastActive(c.otherUid);
    const status = formatLastSeen(last);
    $("#peer-sub").textContent = status || c.otherIb;
  } else {
    $("#peer-sub").textContent = c.otherIb;
  }
}

function renderChatList() {
  const q = ($("#search").value || "").trim().toLowerCase();
  const list = Object.values(conversations).sort((a, b) => {
    return (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0);
  });

  const box = $("#chat-list");
  box.innerHTML = "";
  list.filter((c) => {
    const hay = (displayName(c) + " " + (c.otherIb || "") + " " + (c.groupName || "")).toLowerCase();
    return !q || hay.includes(q);
  }).forEach((c) => {
    const el = document.createElement("div");
    el.className = "chat-item" + (currentChatId === c.id ? " active" : "");
    const name = displayName(c);
    const avContent = c.otherPhoto
      ? `<img src="${c.otherPhoto}" alt="" loading="lazy">`
      : initial(name);
    const avStyle = c.otherPhoto ? "" : `style="background:${hashColor(c.otherIb || c.id)}"`;
    const unreadBadge = c.unread > 0 ? `<span class="badge">${c.unread > 99 ? "99+" : c.unread}</span>` : "";
    el.innerHTML = `
      <div class="avatar" ${avStyle}>${avContent}</div>
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
    box.innerHTML = '<div style="padding:20px;color:#8696a0;text-align:center;font-size:14px">مفيش محادثات لسه.<br>اضغط ✎ أو 👥</div>';
  }
}

async function openChat(chatId) {
  currentChatId = chatId;
  isInChatView = true;
  const c = conversations[chatId];
  if (!c) return;

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

  setTimeout(() => { try { $("#msg-input").focus(); } catch (_) {} }, 300);

  if (!c.isGroup && c.otherUid) {
    const refresh = async () => {
      if (currentChatId !== chatId) return;
      const last = await fetchLastActive(c.otherUid);
      $("#peer-sub").textContent = formatLastSeen(last) || c.otherIb;
    };
    refresh();
    clearInterval(openChat._t);
    openChat._t = setInterval(refresh, 30000);
  }
}

function goBackToList() {
  isInChatView = false;
  currentChatId = null;
  clearInterval(openChat._t);
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

function showMsgMenu(e, msgId, isMine, isPinned) {
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
      await updateDoc(doc(db, "conversations", currentChatId, "messages", msgId), { pinned: !isPinned });
      toast(isPinned ? "تم إلغاء التثبيت" : "تم التثبيت");
    } catch { toast("فشل"); }
  };
  menu.appendChild(pinBtn);

  if (isMine) {
    const delBtn = document.createElement("button");
    delBtn.textContent = "مسح";
    delBtn.className = "danger";
    delBtn.onclick = async (ev) => {
      ev.stopPropagation();
      hideMsgMenu();
      if (!confirm("مسح الرسالة؟")) return;
      try {
        await deleteDoc(doc(db, "conversations", currentChatId, "messages", msgId));
        toast("تم المسح");
      } catch { toast("فشل"); }
    };
    menu.appendChild(delBtn);
  }

  document.body.appendChild(menu);
  const x = Math.min(e.clientX || e.touches?.[0]?.clientX || 100, window.innerWidth - 160);
  const y = Math.min(e.clientY || e.touches?.[0]?.clientY || 100, window.innerHeight - 120);
  menu.style.left = x + "px";
  menu.style.top = y + "px";
}

async function markMessagesSeen(chatId, docs) {
  const updates = [];
  for (const d of docs) {
    const m = d.data();
    if (m.senderId !== me.uid && !(m.seenBy || []).includes(me.uid)) {
      updates.push(updateDoc(doc(db, "conversations", chatId, "messages", d.id), {
        seenBy: arrayUnion(me.uid),
      }));
    }
  }
  if (updates.length) {
    try { await Promise.all(updates); } catch (_) {}
  }
}

function listenMessages(chatId) {
  if (unsubMessages) unsubMessages();
  const q = query(
    collection(db, "conversations", chatId, "messages"),
    orderBy("createdAt", "asc"),
    limit(200)
  );
  unsubMessages = onSnapshot(q, (snap) => {
    const box = $("#messages");
    box.innerHTML = "";
    let lastDay = "";

    const docs = [...snap.docs].sort((a, b) => {
      const ap = a.data().pinned ? 1 : 0;
      const bp = b.data().pinned ? 1 : 0;
      return bp - ap;
    });

    markMessagesSeen(chatId, snap.docs);

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
        const dur = m.duration ? m.duration + '"' : "";
        body = '<div class="voice-msg"><button class="play-btn" data-src="' + m.audio + '">▶</button><div class="wave"></div><span class="dur">' + dur + '</span></div>';
      } else {
        body = escapeHtml(m.text || "");
      }

      const seenHtml = mine ? '<span class="seen-dot ' + (isSeen ? "seen" : "") + '"></span>' : "";
      b.innerHTML = (m.pinned ? '<span class="pin-icon">📌</span>' : "") + body + '<div class="meta"><span>' + fmtTime(m.createdAt) + '</span>' + seenHtml + '</div>';

      const playBtn = b.querySelector(".play-btn");
      if (playBtn) {
        playBtn.onclick = (ev) => {
          ev.stopPropagation();
          const audio = new Audio(playBtn.dataset.src);
          playBtn.textContent = "⏸";
          audio.play();
          audio.onended = () => { playBtn.textContent = "▶"; };
          audio.onerror = () => { playBtn.textContent = "▶"; toast("فشل التشغيل"); };
        };
      }

      let pressTimer = null;
      b.addEventListener("contextmenu", (e) => showMsgMenu(e, d.id, mine, !!m.pinned));
      b.addEventListener("touchstart", (e) => {
        pressTimer = setTimeout(() => showMsgMenu(e, d.id, mine, !!m.pinned), 500);
      }, { passive: true });
      b.addEventListener("touchend", () => clearTimeout(pressTimer));
      b.addEventListener("touchmove", () => clearTimeout(pressTimer));

      box.appendChild(b);
    });
    box.scrollTop = box.scrollHeight;
  });
}

async function sendMessage() {
  const input = $("#msg-input");
  const text = input.value.trim();
  if (!text || !currentChatId) return;
  input.value = "";
  try {
    await addDoc(collection(db, "conversations", currentChatId, "messages"), {
      text, type: "text", senderId: me.uid, createdAt: serverTimestamp(), seenBy: [],
    });
    await bumpConversation(text);
  } catch (e) {
    console.error(e);
    toast("فشل إرسال الرسالة");
  }
}

async function bumpConversation(lastMessage) {
  const c = conversations[currentChatId];
  const updates = { lastMessage, updatedAt: serverTimestamp() };
  if (c && !c.isGroup && c.otherUid) {
    updates["unread." + c.otherUid] = increment(1);
  } else if (c && c.isGroup) {
    for (const uid of (c.participants || [])) {
      if (uid !== me.uid) updates["unread." + uid] = increment(1);
    }
  }
  await updateDoc(doc(db, "conversations", currentChatId), updates);
}

async function toggleRecord() {
  if (isRecording) {
    stopRecord();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
    mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      const duration = Math.max(1, Math.round((Date.now() - recordStart) / 1000));
      if (duration < 1) return toast("التسجيل قصير");
      if (blob.size > 350 * 1024) return toast("التسجيل طويل جدًا");
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          await addDoc(collection(db, "conversations", currentChatId, "messages"), {
            type: "audio",
            audio: reader.result,
            duration,
            text: "🎤 رسالة صوتية",
            senderId: me.uid,
            createdAt: serverTimestamp(),
            seenBy: [],
          });
          await bumpConversation("🎤 رسالة صوتية");
        } catch (e) {
          console.error(e);
          toast("فشل إرسال الصوت");
        }
      };
      reader.readAsDataURL(blob);
    };
    mediaRecorder.start();
    isRecording = true;
    recordStart = Date.now();
    $("#mic-btn").classList.add("recording");
    $("#mic-btn").textContent = "⏹";
    toast("جاري التسجيل...");
  } catch (e) {
    console.error(e);
    toast("محتاج إذن المايكروفون");
  }
}

function stopRecord() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  mediaRecorder.stop();
  isRecording = false;
  $("#mic-btn").classList.remove("recording");
  $("#mic-btn").textContent = "🎤";
}

async function startChatByIB(raw) {
  const ib = normalizeIB(raw);
  if (!isValidIB(ib)) return toast("الـ IB لازم 9 أرقام");
  if (ib === me.ib) return toast("ده الـ IB بتاعك");

  const ibSnap = await getDoc(doc(db, "ibs", ib));
  if (!ibSnap.exists()) return toast("مفيش مستخدم بالـ IB ده");
  const other = ibSnap.data();
  const id = chatIdFor(me.uid, other.uid);

  const existing = await getDoc(doc(db, "conversations", id));
  if (!existing.exists()) {
    let otherPhoto = "";
    try {
      const uSnap = await getDoc(doc(db, "users", other.uid));
      if (uSnap.exists()) otherPhoto = uSnap.data().photoURL || "";
    } catch (_) {}
    await setDoc(doc(db, "conversations", id), {
      participants: [me.uid, other.uid],
      ibs: { [me.uid]: me.ib, [other.uid]: ib },
      names: { [me.uid]: me.name, [other.uid]: other.name },
      photos: { [me.uid]: me.photoURL || "", [other.uid]: otherPhoto },
      lastMessage: "", updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
      isGroup: false, unread: {},
    });
  }
  $("#new-modal").classList.add("hidden");
  $("#new-ib").value = "";
  setTimeout(() => openChat(id), 300);
}

function openGroupModal() {
  const box = $("#group-contacts");
  box.innerHTML = "";
  const contacts = Object.values(conversations).filter((c) => !c.isGroup);
  if (!contacts.length) {
    box.innerHTML = '<p style="color:var(--muted);font-size:13px">مفيش محادثات فردية لسه</p>';
  } else {
    contacts.forEach((c) => {
      const row = document.createElement("label");
      row.className = "contact-check";
      row.innerHTML = '<input type="checkbox" value="' + c.otherUid + '" data-ib="' + c.otherIb + '" data-name="' + escapeHtml(c.otherName) + '" data-photo="' + (c.otherPhoto || "") + '" /><span>' + escapeHtml(displayName(c)) + ' <small style="color:var(--muted)">(' + c.otherIb + ')</small></span>';
      box.appendChild(row);
    });
  }
  $("#group-modal").classList.remove("hidden");
}

async function createGroup() {
  const name = ($("#group-name").value || "").trim();
  if (name.length < 2) return toast("اسم المجموعة قصير");
  const checks = $$("#group-contacts input:checked");
  if (!checks.length) return toast("اختار عضو واحد على الأقل");

  const memberUids = [me.uid];
  const names = { [me.uid]: me.name };
  const ibsMap = { [me.uid]: me.ib };
  const photos = { [me.uid]: me.photoURL || "" };

  checks.forEach((ch) => {
    const uid = ch.value;
    if (memberUids.includes(uid)) return;
    memberUids.push(uid);
    names[uid] = ch.dataset.name || "مستخدم";
    ibsMap[uid] = ch.dataset.ib || "";
    photos[uid] = ch.dataset.photo || "";
  });

  try {
    const ref = await addDoc(collection(db, "conversations"), {
      participants: memberUids, names, ibs: ibsMap, photos,
      groupName: name, isGroup: true, lastMessage: "",
      updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
      createdBy: me.uid, unread: {},
    });
    $("#group-modal").classList.add("hidden");
    $("#group-name").value = "";
    toast("تم إنشاء المجموعة");
    setTimeout(() => openChat(ref.id), 300);
  } catch (e) {
    console.error(e);
    toast("فشل إنشاء المجموعة");
  }
}

function openProfile() {
  if (!me) return;
  pendingPhotoBase64 = null;
  $("#profile-name").value = me.name || "";
  const av = $("#profile-av");
  if (me.photoURL) {
    av.innerHTML = '<img src="' + me.photoURL + '" alt=""><div class="edit-hint">اضغط لتغيير الصورة</div>';
  } else {
    av.innerHTML = '<span id="profile-av-letter">' + initial(me.name) + '</span><div class="edit-hint">اضغط لتغيير الصورة</div>';
  }
  $("#profile-modal").classList.remove("hidden");
}

function handleProfilePhoto(file) {
  if (!file || !file.type.startsWith("image/")) return toast("اختار صورة");
  if (file.size > 400 * 1024) return toast("الصورة كبيرة، اختار أصغر من 400KB");

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const max = 200;
      let w = img.width, h = img.height;
      if (w > h) { if (w > max) { h *= max / w; w = max; } }
      else { if (h > max) { w *= max / h; h = max; } }
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      pendingPhotoBase64 = canvas.toDataURL("image/jpeg", 0.7);
      $("#profile-av").innerHTML = '<img src="' + pendingPhotoBase64 + '" alt=""><div class="edit-hint">اضغط لتغيير الصورة</div>';
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

async function saveProfile() {
  const name = ($("#profile-name").value || "").trim();
  if (name.length < 2) return toast("الاسم قصير");
  const photoURL = pendingPhotoBase64 !== null ? pendingPhotoBase64 : me.photoURL;
  try {
    await updateDoc(doc(db, "users", me.uid), { name, photoURL });
    await updateDoc(doc(db, "ibs", me.ib), { name });
    me.name = name;
    me.photoURL = photoURL;
    updateMeUI();
    // حدّث صورتي واسمي في كل المحادثات بتاعتي
    for (const c of Object.values(conversations)) {
      try {
        const updates = {};
        updates["names." + me.uid] = name;
        updates["photos." + me.uid] = photoURL || "";
        await updateDoc(doc(db, "conversations", c.id), updates);
      } catch (_) {}
    }
    $("#profile-modal").classList.add("hidden");
    toast("تم حفظ البروفايل");
  } catch (e) {
    console.error(e);
    toast("فشل الحفظ");
  }
}

function openNickname() {
  const c = conversations[currentChatId];
  if (!c || c.isGroup) return;
  $("#nick-input").value = nicknames[c.otherUid] || c.otherName || "";
  $("#nick-modal").classList.remove("hidden");
}

function saveNickname() {
  const c = conversations[currentChatId];
  if (!c || c.isGroup) return;
  const val = ($("#nick-input").value || "").trim();
  if (val) nicknames[c.otherUid] = val;
  else delete nicknames[c.otherUid];
  saveNicknames();
  $("#peer-name").textContent = displayName(c);
  renderChatList();
  $("#nick-modal").classList.add("hidden");
  toast("تم حفظ الاسم");
}

function showFullPhoto() {
  const c = conversations[currentChatId];
  if (!c || !c.otherPhoto) return toast("مفيش صورة");
  $("#photo-full").src = c.otherPhoto;
  $("#photo-modal").classList.remove("hidden");
}

function wire() {
  $$(".auth-tabs .tab").forEach((tab) => {
    tab.onclick = () => {
      $$(".auth-tabs .tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      $("#login-form").classList.toggle("hidden", tab.dataset.tab !== "login");
      $("#register-form").classList.toggle("hidden", tab.dataset.tab !== "register");
    };
  });

  $("#login-form").onsubmit = (e) => { e.preventDefault(); login($("#login-ib").value, $("#login-pass").value); };
  $("#register-form").onsubmit = (e) => { e.preventDefault(); register($("#reg-name").value, $("#reg-ib").value, $("#reg-pass").value); };

  $("#search").oninput = renderChatList;
  $("#send-btn").onclick = sendMessage;
  $("#msg-input").addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

  $("#btn-new").onclick = () => $("#new-modal").classList.remove("hidden");
  $("#cancel-new").onclick = () => $("#new-modal").classList.add("hidden");
  $("#start-new").onclick = () => startChatByIB($("#new-ib").value);
  $("#new-ib").addEventListener("keydown", (e) => { if (e.key === "Enter") startChatByIB($("#new-ib").value); });

  $("#btn-group").onclick = openGroupModal;
  $("#cancel-group").onclick = () => $("#group-modal").classList.add("hidden");
  $("#start-group").onclick = createGroup;

  $("#me-chip").onclick = openProfile;
  $("#cancel-profile").onclick = () => $("#profile-modal").classList.add("hidden");
  $("#save-profile").onclick = saveProfile;
  $("#profile-av").onclick = () => $("#profile-file").click();
  $("#profile-file").onchange = (e) => {
    if (e.target.files && e.target.files[0]) handleProfilePhoto(e.target.files[0]);
  };

  $("#btn-nickname").onclick = openNickname;
  $("#cancel-nick").onclick = () => $("#nick-modal").classList.add("hidden");
  $("#save-nick").onclick = saveNickname;

  $("#peer-av").onclick = showFullPhoto;
  $("#close-photo").onclick = () => $("#photo-modal").classList.add("hidden");

  $("#mic-btn").onclick = toggleRecord;

  $("#btn-more").onclick = (e) => { e.stopPropagation(); $("#more-menu").classList.toggle("hidden"); };
  document.addEventListener("click", () => $("#more-menu").classList.add("hidden"));

  $("#copy-ib").onclick = () => { navigator.clipboard.writeText(me.ib); toast("اتنسخ: " + me.ib); };
  $("#logout").onclick = () => signOut(auth);

  $("#delete-account").onclick = async () => {
    if (!confirm("مسح الحساب نهائيًا؟")) return;
    if (!confirm("تأكيد أخير؟")) return;
    try {
      await deleteDoc(doc(db, "ibs", me.ib));
      await deleteDoc(doc(db, "users", me.uid));
      try { await deleteUser(auth.currentUser); } catch { await signOut(auth); }
      toast("تم مسح الحساب");
    } catch { toast("فشل"); }
  };

  $("#back-btn").onclick = goBackToList;
  window.addEventListener("popstate", () => { if (isInChatView) goBackToList(); });

  const panel = $("#emoji-panel");
  EMOJIS.forEach((e) => {
    const s = document.createElement("span");
    s.textContent = e;
    s.onclick = (ev) => { ev.stopPropagation(); $("#msg-input").value += e; $("#msg-input").focus(); };
    panel.appendChild(s);
  });
  $("#emoji-btn").onclick = (e) => { e.stopPropagation(); panel.classList.toggle("hidden"); };

  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== $("#emoji-btn")) panel.classList.add("hidden");
    if (!e.target.closest("#msg-menu") && !e.target.closest(".bubble")) hideMsgMenu();
  });

  ["login-ib", "reg-ib", "new-ib"].forEach((id) => {
    const el = $("#" + id);
    if (el) el.addEventListener("input", () => { el.value = el.value.replace(/\D/g, "").slice(0, 9); });
  });
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    me = await loadMe(user);
    if (!me) { showAuth(); return; }
    showApp();
    listenConversations();
  } else {
    me = null;
    if (unsubChats) unsubChats();
    if (unsubMessages) unsubMessages();
    conversations = {};
    currentChatId = null;
    isInChatView = false;
    showAuth();
  }
});

wire();
