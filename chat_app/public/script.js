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

let isSignUpMode = false;
let currentUser = null;
let profileCache = {}; // id -> {display_name}

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
  data.forEach(renderMessage);
  scrollToBottom();
}

// ---------- Realtime subscription ----------
function subscribeRealtime() {
  supabaseClient
    .channel("public:messages")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        renderMessage(payload.new);
        scrollToBottom();
      }
    )
    .subscribe();
}

// ---------- Render a message bubble ----------
function renderMessage(msg) {
  const mine = msg.sender_id === currentUser?.id;
  const row = document.createElement("div");
  row.className = `msg-row ${mine ? "mine" : "theirs"}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (!mine) {
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
  meta.textContent = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  bubble.appendChild(meta);

  row.appendChild(bubble);
  messageList.appendChild(row);
}

function scrollToBottom() {
  messageList.scrollTop = messageList.scrollHeight;
}

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
