import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  deleteUser,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  limit,
  arrayUnion,
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

const EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","🥰","😅","😉","😎","🤔","😴","🙌","👍","👎",
  "❤️","🔥","✨","🎉","🙏","✅","❌","👋","💪","🤝","💯","🌟","💕","😭","😤","😡",
  "😱","🤩","😇","🤗","🫡","🫠","🤡","👻","💀","👀","💬","📱","⏰","💡","🚀","⭐"
];

let me = null;
let conversations = {};
let currentChatId = null;
let unsubMessages = null;
let unsubChats = null;
let isInChatView = false;

function normalizeIB(v) {
  return String(v || "")
    .trim()
    .replace(/\D/g, ""); // أرقام فقط
}

function isValidIB(ib) {
  return /^\d{9}$/.test(ib);
}

function ibToEmail(ib) {
  const clean = normalizeIB(ib);
  return `${clean}@ibchat.app`;
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
    .replaceAll(">", "&gt;");
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

function chatIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

function showAuth() {
  $("#auth-screen").classList.remove("hidden");
  $("#app").classList.add("hidden");
  isInChatView = false;
}

function showApp() {
  $("#auth-screen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  updateMeUI();
}

function updateMeUI() {
  if (!me) return;
  $("#me-name").textContent = me.name;
  $("#me-ib").textContent = me.ib;
  const av = $("#me-av");
  if (me.photoURL) {
    av.innerHTML = `<img src="${escapeHtml(me.photoURL)}" alt="">`;
  } else {
    av.textContent = initial(me.name);
    av.style.background = "";
  }
}

async function register(name, ibRaw, pass) {
  const ib = normalizeIB(ibRaw);
  name = name.trim();
  if (name.length < 2) return toast("الاسم قصير");
  if (!isValidIB(ib)) return toast("الـ IB لازم يكون 9 أرقام بالظبط");
  if (pass.length < 6) return toast("كلمة السر ٦ حروف على الأقل");

  const ibRef = doc(db, "ibs", ib);
  const ibSnap = await getDoc(ibRef);
  if (ibSnap.exists()) return toast("الـ IB ده متاخد");

  try {
    const email = ibToEmail(ib);
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const uid = cred.user.uid;
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", uid), {
      ib,
      name,
      photoURL: "",
      bio: "",
      links: [],
      createdAt: serverTimestamp(),
    });
    await setDoc(ibRef, { uid, name });
    toast("تم إنشاء الحساب");
  } catch (e) {
    console.error(e);
    if (e.code === "auth/email-already-in-use") toast("الـ IB ده متاخد");
    else if (e.code === "auth/weak-password") toast("كلمة السر ضعيفة");
    else toast("حصل خطأ في التسجيل");
  }
}

async function login(ibRaw, pass) {
  const ib = normalizeIB(ibRaw);
  if (!isValidIB(ib)) return toast("الـ IB لازم يكون 9 أرقام");
  if (!pass) return toast("املأ البيانات");
  try {
    await signInWithEmailAndPassword(auth, ibToEmail(ib), pass);
  } catch (e) {
    console.error(e);
    if (
      e.code === "auth/user-not-found" ||
      e.code === "auth/wrong-password" ||
      e.code === "auth/invalid-credential"
    ) {
      toast("IB أو كلمة السر غلط");
    } else toast("حصل خطأ في الدخول");
  }
}

async function loadMe(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) {
    await signOut(auth);
    toast("الحساب مش مكتمل، سجّل من جديد");
    return null;
  }
  const data = snap.data();
  return {
    uid: user.uid,
    ib: data.ib,
    name: data.name,
    photoURL: data.photoURL || "",
    bio: data.bio || "",
    links: data.links || [],
  };
}

function listenConversations() {
  if (unsubChats) unsubChats();
  const q = query(
    collection(db, "conversations"),
    where("participants", "array-contains", me.uid)
  );
  unsubChats = onSnapshot(
    q,
    (snap) => {
      const map = {};
      for (const d of snap.docs) {
        const data = d.data();
        const isGroup = !!data.isGroup;
        let otherUid = null;
        let otherName = data.groupName || "مجموعة";
        let otherIb = "";
        let otherPhoto = "";

        if (!isGroup) {
          otherUid = data.participants.find((x) => x !== me.uid);
          otherName = data.names?.[otherUid] || "مستخدم";
          otherIb = data.ibs?.[otherUid] || "—";
          otherPhoto = data.photos?.[otherUid] || "";
        }

        map[d.id] = {
          id: d.id,
          ...data,
          isGroup,
          otherUid,
          otherName,
          otherIb,
          otherPhoto,
        };
      }
      conversations = map;
      renderChatList();
      // لو فتح محادثة، حدث الاسم في الهيدر
      if (currentChatId && conversations[currentChatId]) {
        const c = conversations[currentChatId];
        $("#peer-name").textContent = c.otherName;
        $("#peer-sub").textContent = c.isGroup
          ? `${c.participants?.length || 0} أعضاء`
          : c.otherIb;
        setAvatar($("#peer-av"), c.otherName, c.otherPhoto, c.otherIb || c.id);
      }
    },
    (err) => {
      console.error(err);
      toast("مشكلة في تحميل المحادثات");
    }
  );
}

function setAvatar(el, name, photoURL, seed) {
  if (photoURL) {
    el.innerHTML = `<img src="${escapeHtml(photoURL)}" alt="">`;
    el.style.background = "transparent";
  } else {
    el.innerHTML = "";
    el.textContent = initial(name);
    el.style.background = hashColor(seed || name);
  }
}

function renderChatList() {
  const q = ($("#search").value || "").trim().toLowerCase();
  const list = Object.values(conversations).sort((a, b) => {
    const ta = a.updatedAt?.toMillis?.() || 0;
    const tb = b.updatedAt?.toMillis?.() || 0;
    return tb - ta;
  });

  const box = $("#chat-list");
  box.innerHTML = "";
  list
    .filter((c) => {
      const hay = (c.otherName + " " + (c.otherIb || "") + " " + (c.groupName || "")).toLowerCase();
      return !q || hay.includes(q);
    })
    .forEach((c) => {
      const el = document.createElement("div");
      el.className = "chat-item" + (currentChatId === c.id ? " active" : "");
      const avStyle = c.otherPhoto ? "" : `style="background:${hashColor(c.otherIb || c.id)}"`;
      const avContent = c.otherPhoto
        ? `<img src="${escapeHtml(c.otherPhoto)}" alt="">`
        : initial(c.otherName);
      el.innerHTML = `
        <div class="avatar" ${avStyle}>${avContent}</div>
        <div class="item-body">
          <div class="item-top">
            <div class="item-name">${c.isGroup ? '<span class="group-badge">مجموعة</span>' : ""}${escapeHtml(c.otherName)}</div>
            <div class="item-time">${c.updatedAt ? fmtTime(c.updatedAt) : ""}</div>
          </div>
          <div class="item-bottom">
            <div class="item-preview">${escapeHtml(c.lastMessage || "ابدأ المحادثة")}</div>
          </div>
          ${c.isGroup ? "" : `<div class="ib-tag">${escapeHtml(c.otherIb)}</div>`}
        </div>`;
      el.onclick = () => openChat(c.id);
      box.appendChild(el);
    });

  if (!list.length) {
    box.innerHTML =
      '<div style="padding:20px;color:#8696a0;text-align:center;font-size:14px">مفيش محادثات لسه.<br>اضغط ✎ وابدأ بـ IB حد تعرفه<br>أو 👥 لعمل مجموعة</div>';
  }
}

function openChat(chatId) {
  currentChatId = chatId;
  isInChatView = true;
  const c = conversations[chatId];
  if (!c) return;

  // history عشان زر الرجوع في المتصفح يرجع جوه الموقع
  history.pushState({ chat: chatId }, "", "#chat");

  $("#empty-state").classList.add("hidden");
  $("#conversation").classList.remove("hidden");
  $("#peer-name").textContent = c.otherName;
  $("#peer-sub").textContent = c.isGroup
    ? `${c.participants?.length || 0} أعضاء`
    : c.otherIb;
  setAvatar($("#peer-av"), c.otherName, c.otherPhoto, c.otherIb || c.id);

  if (window.innerWidth <= 860) $("#app .sidebar").classList.add("mobile-hide");
  renderChatList();
  listenMessages(chatId);
  $("#msg-input").focus();
}

function goBackToList() {
  isInChatView = false;
  currentChatId = null;
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
      await updateDoc(doc(db, "conversations", currentChatId, "messages", msgId), {
        pinned: !isPinned,
      });
      toast(isPinned ? "تم إلغاء التثبيت" : "تم تثبيت الرسالة");
    } catch (err) {
      console.error(err);
      toast("فشل التثبيت");
    }
  };
  menu.appendChild(pinBtn);

  if (isMine) {
    const delBtn = document.createElement("button");
    delBtn.textContent = "مسح";
    delBtn.className = "danger";
    delBtn.onclick = async (ev) => {
      ev.stopPropagation();
      hideMsgMenu();
      if (!confirm("متأكد إنك عايز تمسح الرسالة؟")) return;
      try {
        await deleteDoc(doc(db, "conversations", currentChatId, "messages", msgId));
        toast("تم مسح الرسالة");
      } catch (err) {
        console.error(err);
        toast("فشل المسح");
      }
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
    } catch (e) {
      console.warn("seen update failed", e);
    }
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
      if (ap !== bp) return bp - ap;
      return 0;
    });

    // علّم الرسائل الواردة كـ seen
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

      const seenHtml = mine
        ? `<span class="seen-dot ${isSeen ? "seen" : ""}" title="${isSeen ? "اتشافت" : "اتبعتت"}"></span>`
        : "";

      b.innerHTML = `${m.pinned ? '<span class="pin-icon">📌</span>' : ""}${escapeHtml(m.text)}<div class="meta"><span>${fmtTime(m.createdAt)}</span>${seenHtml}</div>`;

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
      text,
      senderId: me.uid,
      createdAt: serverTimestamp(),
      seenBy: [],
    });
    await updateDoc(doc(db, "conversations", currentChatId), {
      lastMessage: text,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error(e);
    toast("فشل إرسال الرسالة");
  }
}

async function startChatByIB(raw) {
  const ib = normalizeIB(raw);
  if (!isValidIB(ib)) return toast("الـ IB لازم يكون 9 أرقام");
  if (ib === me.ib) return toast("ده الـ IB بتاعك أنت");

  const ibSnap = await getDoc(doc(db, "ibs", ib));
  if (!ibSnap.exists()) {
    toast("مفيش مستخدم بالـ IB ده. خلّيه يسجّل الأول");
    return;
  }
  const other = ibSnap.data();
  const id = chatIdFor(me.uid, other.uid);

  const existing = await getDoc(doc(db, "conversations", id));
  if (!existing.exists()) {
    // جلب صورة الطرف التاني إن وجدت
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
      lastMessage: "",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      isGroup: false,
    });
  }

  $("#new-modal").classList.add("hidden");
  $("#new-ib").value = "";
  setTimeout(() => openChat(id), 300);
}

async function createGroup() {
  const name = ($("#group-name").value || "").trim();
  const rawMembers = ($("#group-members").value || "").trim();
  if (name.length < 2) return toast("اسم المجموعة قصير");
  if (!rawMembers) return toast("حط على الأقل IB واحد");

  const ibs = rawMembers
    .split(/[\s,،]+/)
    .map(normalizeIB)
    .filter(isValidIB)
    .filter((ib) => ib !== me.ib);

  if (!ibs.length) return toast("مفيش IB صحيح");

  const memberUids = [me.uid];
  const names = { [me.uid]: me.name };
  const ibsMap = { [me.uid]: me.ib };
  const photos = { [me.uid]: me.photoURL || "" };

  for (const ib of ibs) {
    const ibSnap = await getDoc(doc(db, "ibs", ib));
    if (!ibSnap.exists()) {
      toast(`مفيش مستخدم بالـ IB: ${ib}`);
      return;
    }
    const data = ibSnap.data();
    if (memberUids.includes(data.uid)) continue;
    memberUids.push(data.uid);
    names[data.uid] = data.name;
    ibsMap[data.uid] = ib;
    try {
      const uSnap = await getDoc(doc(db, "users", data.uid));
      photos[data.uid] = uSnap.exists() ? (uSnap.data().photoURL || "") : "";
    } catch (_) {
      photos[data.uid] = "";
    }
  }

  if (memberUids.length < 2) return toast("لازم عضو واحد على الأقل غيرك");

  try {
    const ref = await addDoc(collection(db, "conversations"), {
      participants: memberUids,
      names,
      ibs: ibsMap,
      photos,
      groupName: name,
      isGroup: true,
      lastMessage: "",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      createdBy: me.uid,
    });
    $("#group-modal").classList.add("hidden");
    $("#group-name").value = "";
    $("#group-members").value = "";
    toast("تم إنشاء المجموعة");
    setTimeout(() => openChat(ref.id), 300);
  } catch (e) {
    console.error(e);
    toast("فشل إنشاء المجموعة");
  }
}

function openProfile() {
  if (!me) return;
  $("#profile-name").value = me.name || "";
  $("#profile-photo").value = me.photoURL || "";
  $("#profile-bio").value = me.bio || "";
  $("#profile-links").value = (me.links || []).join("\n");
  const av = $("#profile-av");
  if (me.photoURL) {
    av.innerHTML = `<img src="${escapeHtml(me.photoURL)}" alt="">`;
  } else {
    av.innerHTML = "";
    av.textContent = initial(me.name);
  }
  $("#profile-modal").classList.remove("hidden");
}

async function saveProfile() {
  const name = ($("#profile-name").value || "").trim();
  const photoURL = ($("#profile-photo").value || "").trim();
  const bio = ($("#profile-bio").value || "").trim();
  const links = ($("#profile-links").value || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  if (name.length < 2) return toast("الاسم قصير");

  try {
    await updateDoc(doc(db, "users", me.uid), {
      name,
      photoURL,
      bio,
      links,
    });
    // تحديث الاسم في جدول الـ ibs
    await updateDoc(doc(db, "ibs", me.ib), { name });

    me.name = name;
    me.photoURL = photoURL;
    me.bio = bio;
    me.links = links;
    updateMeUI();
    $("#profile-modal").classList.add("hidden");
    toast("تم حفظ البروفايل");
  } catch (e) {
    console.error(e);
    toast("فشل حفظ البروفايل");
  }
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

  $("#login-form").onsubmit = (e) => {
    e.preventDefault();
    login($("#login-ib").value, $("#login-pass").value);
  };
  $("#register-form").onsubmit = (e) => {
    e.preventDefault();
    register($("#reg-name").value, $("#reg-ib").value, $("#reg-pass").value);
  };

  $("#search").oninput = renderChatList;
  $("#send-btn").onclick = sendMessage;
  $("#msg-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  $("#btn-new").onclick = () => $("#new-modal").classList.remove("hidden");
  $("#cancel-new").onclick = () => $("#new-modal").classList.add("hidden");
  $("#start-new").onclick = () => startChatByIB($("#new-ib").value);
  $("#new-ib").addEventListener("keydown", (e) => {
    if (e.key === "Enter") startChatByIB($("#new-ib").value);
  });

  // مجموعات
  $("#btn-group").onclick = () => $("#group-modal").classList.remove("hidden");
  $("#cancel-group").onclick = () => $("#group-modal").classList.add("hidden");
  $("#start-group").onclick = createGroup;

  // بروفايل
  $("#me-chip").onclick = openProfile;
  $("#cancel-profile").onclick = () => $("#profile-modal").classList.add("hidden");
  $("#save-profile").onclick = saveProfile;

  $("#btn-more").onclick = (e) => {
    e.stopPropagation();
    $("#more-menu").classList.toggle("hidden");
  };
  document.addEventListener("click", () => $("#more-menu").classList.add("hidden"));

  $("#copy-ib").onclick = () => {
    navigator.clipboard.writeText(me.ib);
    toast("اتنسخ: " + me.ib);
  };
  $("#logout").onclick = () => signOut(auth);

  $("#delete-account").onclick = async () => {
    if (!confirm("هتمسح الحساب نهائيًا ومش هتقدر ترجعه. متأكد؟")) return;
    if (!confirm("تأكيد أخير: مسح الحساب وكل البيانات؟")) return;
    try {
      const user = auth.currentUser;
      if (!user) return;
      await deleteDoc(doc(db, "ibs", me.ib));
      await deleteDoc(doc(db, "users", me.uid));
      try {
        await deleteUser(user);
      } catch (err) {
        console.warn(err);
        await signOut(auth);
      }
      toast("تم مسح الحساب");
    } catch (e) {
      console.error(e);
      toast("فشل مسح الحساب");
    }
  };

  $("#back-btn").onclick = goBackToList;

  // زر الرجوع في المتصفح يرجع جوه الموقع
  window.addEventListener("popstate", (e) => {
    if (isInChatView) {
      goBackToList();
    }
  });

  const panel = $("#emoji-panel");
  panel.innerHTML = "";
  EMOJIS.forEach((e) => {
    const s = document.createElement("span");
    s.textContent = e;
    s.onclick = (ev) => {
      ev.stopPropagation();
      $("#msg-input").value += e;
      $("#msg-input").focus();
    };
    panel.appendChild(s);
  });
  $("#emoji-btn").onclick = (e) => {
    e.stopPropagation();
    panel.classList.toggle("hidden");
  };

  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== $("#emoji-btn")) {
      panel.classList.add("hidden");
    }
    if (!e.target.closest("#msg-menu") && !e.target.closest(".bubble")) {
      hideMsgMenu();
    }
  });

  // منع إدخال غير أرقام في حقول الـ IB
  ["login-ib", "reg-ib", "new-ib"].forEach((id) => {
    const el = $("#" + id);
    if (el) {
      el.addEventListener("input", () => {
        el.value = el.value.replace(/\D/g, "").slice(0, 9);
      });
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    me = await loadMe(user);
    if (!me) {
      showAuth();
      return;
    }
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
