// ---------- Elements ----------
const authScreen = document.getElementById("auth-screen");
const chatScreen = document.getElementById("chat-screen");
const authForm = document.getElementById("auth-form");
const authName = document.getElementById("auth-name");
const authPassword = document.getElementById("auth-password");
const authSubmit = document.getElementById("auth-submit");
const authToggle = document.getElementById("auth-toggle");
const authError = document.getElementById("auth-error");
const messageList = document.getElementById("message-list");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("message-input");
const attachButton = document.getElementById("attach-button");
const attachInput = document.getElementById("attach-input");
const signOutBtn = document.getElementById("sign-out");
const memberCount = document.getElementById("member-count");
const jumpBottom = document.getElementById("jump-bottom");
const jumpBottomCount = document.getElementById("jump-bottom-count");
const typingIndicator = document.getElementById("typing-indicator");
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");

let isSignUpMode = false;
let currentUser = null;
let profileCache = {}; // id -> {display_name}
let lastRenderedSenderId = null;
let lastRenderedDay = null;
let lastRowElement = null;
let unseenWhileScrolledUp = 0;
let typingTimers = {}; // user_id -> timeout handle
let typingChannel = null;

// ---------- Theme toggle ----------
const SUN_ICON = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>';
const MOON_ICON = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeIcon.innerHTML = theme === "light" ? MOON_ICON : SUN_ICON;
  themeToggle.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#ECE5DD" : "#0E1116");
  try {
    localStorage.setItem("circle-theme", theme);
  } catch (e) {}
}

applyTheme(document.documentElement.getAttribute("data-theme") || "dark");

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  applyTheme(current === "light" ? "dark" : "light");
});

// ---------- Auth mode toggle ----------
authToggle.addEventListener("click", () => {
  isSignUpMode = !isSignUpMode;
  authSubmit.textContent = isSignUpMode ? "Sign up" : "Sign in";
  authToggle.textContent = isSignUpMode
    ? "Already have an account? Sign in"
    : "Need an account? Sign up";
  authError.textContent = "";
});

// Supabase's auth system needs an email-shaped string, but the user only
// ever sees and types a username. We turn it into a fake internal address
// behind the scenes so no real email is ever sent.
function usernameToFakeEmail(username) {
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return `${clean}@users.circle-app.local`;
}

// Same rules as the notes website
function validateUsername(username) {
  if (username.length < 5 || username.length > 10) {
    return "Username must be 5–10 characters.";
  }
  return null;
}

function validatePassword(password) {
  if (password.length < 8 || password.length > 20) {
    return "Password must be 8–20 characters.";
  }
  if (!/[A-Z]/.test(password)) return "Password needs an uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password needs a lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password needs a number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password needs a special character.";
  return null;
}

// ---------- Auth submit ----------
authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.textContent = "";

  const username = authName.value.trim();
  const password = authPassword.value;

  if (isSignUpMode) {
    const usernameError = validateUsername(username);
    if (usernameError) {
      authError.style.color = "#C4574B";
      authError.textContent = usernameError;
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      authError.style.color = "#C4574B";
      authError.textContent = passwordError;
      return;
    }
  }

  authSubmit.disabled = true;
  const fakeEmail = usernameToFakeEmail(username);

  try {
    if (isSignUpMode) {
      const { error } = await supabaseClient.auth.signUp({
        email: fakeEmail,
        password,
        options: { data: { display_name: username } },
      });
      if (error) throw error;
      // No email confirmation needed since there's no real inbox —
      // as long as "Confirm email" is off in Supabase, this logs in right away.
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email: fakeEmail, password });
      if (error) throw error;
    }
  } catch (err) {
    authError.style.color = "#C4574B";
    authError.textContent = err.message.includes("already registered")
      ? "That username is taken."
      : err.message;
  } finally {
    authSubmit.disabled = false;
  }
});

signOutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
});

// ---------- Session handling ----------
supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    currentUser = session.user;
    enterChat();
  } else {
    currentUser = null;
    authScreen.classList.remove("hidden");
    chatScreen.classList.add("hidden");
  }
});

async function enterChat() {
  authScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  await loadProfiles();
  await loadMessages();
  subscribeRealtime();
  subscribeTyping();
}

// ---------- Profiles ----------
async function loadProfiles() {
  const { data, error } = await supabaseClient.from("profiles").select("id, display_name");
  if (error) return console.error(error);
  profileCache = Object.fromEntries(data.map((p) => [p.id, p.display_name]));
  memberCount.textContent = `${data.length} member${data.length === 1 ? "" : "s"}`;
}

// ---------- Load message history ----------
async function loadMessages() {
  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return console.error(error);
  messageList.innerHTML = "";
  lastRenderedSenderId = null;
  lastRenderedDay = null;
  lastRowElement = null;
  data.forEach(renderMessage);
  scrollToBottom();
}

// ---------- Realtime subscription ----------

// If a message comes in from a sender we don't have cached (e.g. they
// signed up after we already loaded the profile list), fetch just that
// one profile instead of showing "Someone" forever.
async function ensureProfileCached(id) {
  if (profileCache[id]) return profileCache[id];
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, display_name")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  profileCache[id] = data.display_name;
  return data.display_name;
}

function subscribeRealtime() {
  supabaseClient
    .channel("public:messages")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      async (payload) => {
        if (!profileCache[payload.new.sender_id]) {
          await ensureProfileCached(payload.new.sender_id);
        }
        const wasNearBottom = isNearBottom();
        renderMessage(payload.new);
        if (wasNearBottom) {
          scrollToBottom();
        } else if (payload.new.sender_id !== currentUser?.id) {
          unseenWhileScrolledUp++;
          updateJumpBottom();
        }
        // Someone's message arrived, so they're done typing
        clearTyping(payload.new.sender_id);
      }
    )
    .subscribe();
}

// ---------- Typing indicator (Realtime broadcast, no DB writes) ----------
function subscribeTyping() {
  typingChannel = supabaseClient.channel("typing", {
    config: { broadcast: { self: false } },
  });

  typingChannel
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload.user_id === currentUser?.id) return;
      showTyping(payload.user_id, payload.name);
    })
    .subscribe();

  let lastTypingSent = 0;
  messageInput.addEventListener("input", () => {
    if (!messageInput.value.trim()) return;
    const now = Date.now();
    if (now - lastTypingSent < 2000) return;
    lastTypingSent = now;
    typingChannel.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: currentUser.id, name: profileCache[currentUser.id] || "Someone" },
    });
  });
}

const activeTypers = {}; // user_id -> name

function showTyping(userId, name) {
  activeTypers[userId] = name;
  clearTimeout(typingTimers[userId]);
  typingTimers[userId] = setTimeout(() => clearTyping(userId), 3000);
  renderTypingIndicator();
}

function clearTyping(userId) {
  delete activeTypers[userId];
  clearTimeout(typingTimers[userId]);
  renderTypingIndicator();
}

function renderTypingIndicator() {
  const names = Object.values(activeTypers);
  if (names.length === 0) {
    typingIndicator.classList.add("hidden");
    typingIndicator.textContent = "";
    return;
  }
  const text =
    names.length === 1
      ? `${names[0]} is typing…`
      : names.length === 2
      ? `${names[0]} and ${names[1]} are typing…`
      : `${names.length} people are typing…`;
  typingIndicator.textContent = text;
  typingIndicator.classList.remove("hidden");
}

// ---------- Day dividers ----------
function dayLabel(date) {
  const now = new Date();
  const d = new Date(date);
  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(d, now)) return "Today";
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

// ---------- Render a message bubble ----------
function renderMessage(msg) {
  const mine = msg.sender_id === currentUser?.id;
  const msgDay = new Date(msg.created_at).toDateString();

  if (msgDay !== lastRenderedDay) {
    const divider = document.createElement("div");
    divider.className = "day-divider";
    divider.textContent = dayLabel(msg.created_at);
    messageList.appendChild(divider);
    lastRenderedDay = msgDay;
    lastRenderedSenderId = null; // force a fresh group after a day divider
  }

  const isGrouped = lastRenderedSenderId === msg.sender_id;

  // The previous row (if same sender) is no longer the last in its group
  if (isGrouped && lastRowElement) {
    lastRowElement.classList.remove("group-last");
  }

  const row = document.createElement("div");
  row.className = `msg-row ${mine ? "mine" : "theirs"} group-last ${isGrouped ? "grouped" : "group-start"}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (!mine && !isGrouped) {
    const nameEl = document.createElement("span");
    nameEl.className = "sender-name";
    nameEl.textContent = profileCache[msg.sender_id] || "Someone";
    bubble.appendChild(nameEl);
  }

  if (msg.media_path) {
    const img = document.createElement("img");
    img.className = "media";
    img.src = supabaseClient.storage.from("chat-media").getPublicUrl(msg.media_path).data.publicUrl;
    bubble.appendChild(img);
  }

  if (msg.body) {
    const bodyEl = document.createElement("span");
    bodyEl.textContent = msg.body;
    bubble.appendChild(bodyEl);
  }

  const meta = document.createElement("span");
  meta.className = "meta";
  const timeText = document.createElement("span");
  timeText.textContent = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  meta.appendChild(timeText);
  if (mine) {
    const tick = document.createElement("span");
    tick.className = "tick";
    tick.textContent = "✓";
    meta.appendChild(tick);
  }
  bubble.appendChild(meta);

  row.appendChild(bubble);
  messageList.appendChild(row);

  lastRenderedSenderId = msg.sender_id;
  lastRowElement = row;
}

function isNearBottom() {
  return messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 80;
}

function scrollToBottom() {
  messageList.scrollTop = messageList.scrollHeight;
  unseenWhileScrolledUp = 0;
  updateJumpBottom();
}

function updateJumpBottom() {
  if (unseenWhileScrolledUp > 0) {
    jumpBottomCount.textContent = unseenWhileScrolledUp;
    jumpBottom.classList.remove("hidden");
  } else {
    jumpBottom.classList.add("hidden");
  }
}

messageList.addEventListener("scroll", () => {
  if (isNearBottom() && unseenWhileScrolledUp > 0) {
    unseenWhileScrolledUp = 0;
    updateJumpBottom();
  }
});

jumpBottom.addEventListener("click", () => {
  messageList.scrollTo({ top: messageList.scrollHeight, behavior: "smooth" });
  unseenWhileScrolledUp = 0;
  updateJumpBottom();
});

// ---------- Sending ----------
composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  messageInput.value = "";

  const { error } = await supabaseClient
    .from("messages")
    .insert({ sender_id: currentUser.id, body: text });
  if (error) console.error(error);
});

// ---------- Media attach ----------
attachButton.addEventListener("click", () => attachInput.click());

attachInput.addEventListener("change", async () => {
  const file = attachInput.files[0];
  attachInput.value = "";
  if (!file) return;

  if (file.size > 8 * 1024 * 1024) {
    alert("Please choose a file under 8MB.");
    return;
  }

  const path = `${currentUser.id}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabaseClient.storage
    .from("chat-media")
    .upload(path, file);
  if (uploadError) return console.error(uploadError);

  const { error } = await supabaseClient
    .from("messages")
    .insert({ sender_id: currentUser.id, media_path: path, media_type: file.type });
  if (error) console.error(error);
});

// ---------- Service worker + push notifications ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      // Only ask for push once the user is actually signed in and in the chat
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (session?.user) subscribeToPush(registration, session.user.id);
      });
    } catch (err) {
      console.error(err);
    }
  });
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function subscribeToPush(registration, userId) {
  if (Notification.permission === "denied") return;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  const { error } = await supabaseClient.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) console.error(error);
}

// ---------- Keep layout height accurate when the mobile keyboard opens/closes ----------
function setAppHeight() {
  const vv = window.visualViewport;
  const height = vv ? vv.height : window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${height}px`);

  // Safety net for browsers that scroll instead of resizing (e.g. iOS Safari):
  // pin the whole screen to the visual viewport's offset so nothing drifts.
  const screen = document.querySelector(".screen:not(.hidden)");
  if (screen && vv) {
    screen.style.transform = vv.offsetTop ? `translateY(${vv.offsetTop}px)` : "";
  }

  // Keep the composer in view when the keyboard is open
  if (document.activeElement === messageInput) {
    scrollToBottom();
  }
}
setAppHeight();
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", setAppHeight);
  window.visualViewport.addEventListener("scroll", setAppHeight);
} else {
  window.addEventListener("resize", setAppHeight);
}
