// ---------- Elements ----------
const authScreen = document.getElementById("auth-screen");
const chatScreen = document.getElementById("chat-screen");
const authForm = document.getElementById("auth-form");
const authFullname = document.getElementById("auth-fullname");
const authName = document.getElementById("auth-name");
const authPassword = document.getElementById("auth-password");
const passwordToggle = document.getElementById("password-toggle");
const passwordToggleIcon = document.getElementById("password-toggle-icon");
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
const replyPreview = document.getElementById("reply-preview");
const replyPreviewName = document.getElementById("reply-preview-name");
const replyPreviewText = document.getElementById("reply-preview-text");
const replyPreviewCancel = document.getElementById("reply-preview-cancel");

let isSignUpMode = false;
let currentUser = null;
let profileCache = {}; // id -> {display_name}
let messageCache = {}; // id -> full message row, so replies can show a quote
let messageRowById = {}; // id -> rendered DOM row, so we can scroll to it
let replyingTo = null; // the message object currently being replied to
let lastRenderedSenderId = null;
let lastRenderedDay = null;
let lastRowElement = null;
let unseenWhileScrolledUp = 0;
let typingTimers = {}; // user_id -> timeout handle
let typingChannel = null;
let pendingRestoreMessageId = null;
let pendingRestoreScrollTop = null;

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
function resetAuthFields() {
  authFullname.value = "";
  authName.value = "";
  authPassword.value = "";
  authError.textContent = "";
  authPassword.type = "password";
  passwordToggle.setAttribute("aria-label", "Show password");
  passwordToggle.setAttribute("aria-pressed", "false");
  passwordToggleIcon.innerHTML = `
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  `;
}

authToggle.addEventListener("click", () => {
  isSignUpMode = !isSignUpMode;
  authSubmit.textContent = isSignUpMode ? "Sign up" : "Sign in";
  authToggle.textContent = isSignUpMode
    ? "Already have an account? Sign in"
    : "Need an account? Sign up";

  // Switching auth modes always starts with a completely fresh form.
  resetAuthFields();

  // Name is only collected (and required) when signing up — the login
  // dialog only ever asks for username + password.
  authFullname.classList.toggle("hidden", !isSignUpMode);
  authFullname.required = isSignUpMode;
});

passwordToggle.addEventListener("click", () => {
  const showing = authPassword.type === "text";
  authPassword.type = showing ? "password" : "text";
  passwordToggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  passwordToggle.setAttribute("aria-pressed", String(!showing));
  passwordToggleIcon.innerHTML = showing
    ? `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle>`
    : `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle><path d="M4 4l16 16"></path>`;
});

// Supabase's auth system needs an email-shaped string, but the user only
// ever sees and types a username. We turn it into a fake internal address
// behind the scenes so no real email is ever sent.
function usernameToFakeEmail(username) {
  const clean = username.trim();
  return `${clean}@users.circle-app.local`;
}

function validateName(name) {
  if (!name.trim()) return "Name is required.";
  if (name.length > 20) return "Name must be 20 characters or fewer.";
  return null;
}

// Same rules as the notes website
function validateUsername(username) {
  if (username.length < 5 || username.length > 10) {
    return "Username must be 5–10 characters.";
  }
  if (!/^[a-z0-9_.]+$/.test(username)) {
    return "Username can contain only lowercase letters, numbers, underscores, and dots.";
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

  const fullName = authFullname.value;
  const username = authName.value.trim();
  const password = authPassword.value;

  if (isSignUpMode) {
    const nameError = validateName(fullName);
    if (nameError) {
      authError.style.color = "#C4574B";
      authError.textContent = nameError;
      return;
    }
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
        // display_name drives what shows on message bubbles / typing indicator —
        // that should be the person's name, not their (login-only) username.
        options: { data: { display_name: fullName } },
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
  await unsubscribeFromPush();
  await supabaseClient.auth.signOut();
});

// Stop this browser from receiving push notifications once the user logs out.
// Without this, the push_subscriptions row (and the browser's own subscription)
// stays active forever, so the server keeps sending notifications even though
// nobody's logged in on this device anymore.
async function unsubscribeFromPush() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await supabaseClient.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch (err) {
    console.error(err);
  }
}

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
  messageRowById = {}; // old rows are gone, forget where they were
  data.forEach(renderMessage);

  // Normally open the chat at the newest message. If the user just opened a
  // file from an older message, restore that exact message instead.
  const returnState = getReturnState();
  pendingRestoreMessageId = returnState.id;
  pendingRestoreScrollTop = returnState.scrollTop;
  if (!restoreReturnMessagePosition()) {
    scrollToBottom();
  }
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

// Scrolls to and briefly highlights a message that's already on screen
// (used when tapping a quoted reply).
function scrollToMessage(id, behavior = "smooth") {
  const row = messageRowById[id];
  if (!row) return false;
  row.scrollIntoView({ behavior, block: "center" });
  row.classList.add("highlight-flash");
  setTimeout(() => row.classList.remove("highlight-flash"), 1200);
  return true;
}

function getReturnState() {
  try {
    const id = sessionStorage.getItem("circle-return-message-id");
    const top = sessionStorage.getItem("circle-return-scroll-top");
    return {
      id: id || null,
      scrollTop: top === null ? null : Number(top),
    };
  } catch (e) {
    return { id: null, scrollTop: null };
  }
}

function clearReturnState() {
  try {
    sessionStorage.removeItem("circle-return-message-id");
    sessionStorage.removeItem("circle-return-scroll-top");
  } catch (e) {}
}

function restoreReturnMessagePosition() {
  const state = getReturnState();
  const id = pendingRestoreMessageId || state.id;
  const savedTop = pendingRestoreScrollTop ?? state.scrollTop;
  if (!id || !messageRowById[id]) return false;

  // Restore the exact scroll position first. This keeps the clicked file
  // message in roughly the same place even if the browser changed the
  // scroll position while switching tabs.
  if (Number.isFinite(savedTop)) {
    messageList.scrollTop = Math.max(0, Math.min(savedTop, messageList.scrollHeight));
  }

  const row = messageRowById[id];
  const rect = row.getBoundingClientRect();
  const listRect = messageList.getBoundingClientRect();
  const isVisible = rect.bottom > listRect.top && rect.top < listRect.bottom;

  // If the exact position is no longer valid after layout changes, center
  // the original message rather than jumping to the latest message.
  if (!isVisible) scrollToMessage(id, "auto");

  pendingRestoreMessageId = null;
  pendingRestoreScrollTop = null;
  clearReturnState();
  return true;
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

  messageCache[msg.id] = msg; // so any later reply to this message can quote it

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
  row.dataset.msgId = msg.id;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (!mine && !isGrouped) {
    const nameEl = document.createElement("span");
    nameEl.className = "sender-name";
    nameEl.textContent = profileCache[msg.sender_id] || "Someone";
    bubble.appendChild(nameEl);
  }

  // Quoted preview when this message is a reply to an earlier one
  if (msg.reply_to) {
    const quoted = document.createElement("div");
    quoted.className = "quoted-msg";
    const original = messageCache[msg.reply_to];
    if (original) {
      const qName = document.createElement("span");
      qName.className = "quoted-name";
      qName.textContent = original.sender_id === currentUser?.id ? "You" : profileCache[original.sender_id] || "Someone";
      const qBody = document.createElement("span");
      qBody.className = "quoted-body";
      qBody.textContent = original.body ? truncate(original.body, 80) : original.media_path ? "📷 Photo" : "";
      quoted.appendChild(qName);
      quoted.appendChild(qBody);
    } else {
      quoted.textContent = "Original message";
    }
    quoted.addEventListener("click", () => scrollToMessage(msg.reply_to));
    bubble.appendChild(quoted);
  }

  if (msg.media_path) {
    const mediaUrl = supabaseClient.storage.from("chat-media").getPublicUrl(msg.media_path).data.publicUrl;
    const img = document.createElement("img");
    img.className = "media";
    img.src = mediaUrl;
    img.addEventListener("click", () => {
      // Remember exactly which message opened the external file. When the user
      // returns to this chat, restore the viewport to this message instead of
      // jumping to the newest message.
      try {
        sessionStorage.setItem("circle-return-message-id", String(msg.id));
        sessionStorage.setItem("circle-return-scroll-top", String(messageList.scrollTop));
      } catch (e) {}
      window.open(mediaUrl, "_blank", "noopener,noreferrer");
    });
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

  const replyBtn = document.createElement("button");
  replyBtn.type = "button";
  replyBtn.className = "reply-trigger";
  replyBtn.setAttribute("aria-label", "Reply to this message");
  replyBtn.textContent = "↩";
  replyBtn.addEventListener("click", () => {
    // Restart the animation even on rapid re-clicks: removing the class,
    // forcing reflow, then re-adding it makes the browser treat it as a
    // fresh animation instead of a no-op (class already present).
    row.classList.remove("reply-bounce");
    void row.offsetWidth;
    row.classList.add("reply-bounce");
    startReply(msg);
  });
  row.addEventListener("animationend", (e) => {
    if (e.animationName === "reply-bounce") row.classList.remove("reply-bounce");
  });

  // Icon always follows the bubble so a left-swipe drags the bubble away
  // from it, not over it — avoids overlap on both mine and theirs rows.
  row.appendChild(bubble);
  row.appendChild(replyBtn);
  messageList.appendChild(row);
  attachSwipeToReply(row, bubble, replyBtn, msg, mine);

  lastRenderedSenderId = msg.sender_id;
  lastRowElement = row;
  messageRowById[msg.id] = row;
}

// ---------- Swipe-to-reply (mobile) ----------
// Left-swiping a message bubble slides it left and fades in the reply
// icon in the space that opens up; releasing past the threshold triggers
// the reply. On desktop the icon is revealed on hover instead (see
// .msg-row:hover in style.css).
//
// "mine" bubbles sit last in the row (anchored to the right edge), so
// growing the icon's width already reflows the bubble left on its own —
// no transform needed there. "theirs" bubbles sit first (anchored to the
// left edge), so the reflow alone doesn't move them; those get an
// explicit transform so they visibly slide too.
function attachSwipeToReply(row, bubble, replyBtn, msg, mine) {
  const THRESHOLD = 56; // px of drag needed to trigger reply on release
  const MAX_REVEAL = 40; // cap on how far the bubble slides / how wide the icon opens
  const SLOP = 8; // px of movement before we decide horizontal vs vertical

  let startX = 0;
  let startY = 0;
  let dragging = false; // touch is active on this row
  let swiping = false; // we've committed to a horizontal swipe
  let dragDistance = 0; // uncapped left-drag distance, used for the threshold check

  row.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dragging = true;
    swiping = false;
    dragDistance = 0;
    bubble.style.transition = "none";
    replyBtn.style.transition = "none";
  }, { passive: true });

  row.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (!swiping) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        // Vertical scroll — let the page handle it, not us.
        dragging = false;
        return;
      }
      swiping = true;
    }

    // Only left swipes reveal the icon. Its width growing opens real
    // layout space right behind the bubble, so the two can never overlap.
    // "mine" bubbles reflow left on their own as that space opens up;
    // "theirs" bubbles need an explicit slide since they're anchored left.
    dragDistance = dx < 0 ? -dx : 0;
    const reveal = Math.min(dragDistance, MAX_REVEAL);
    if (!mine) {
      bubble.style.transform = `translateX(${-reveal}px)`;
      // The trigger sits right after the bubble in the DOM/flex flow, so its
      // un-transformed position stays anchored where the bubble *used* to be
      // even as the bubble itself slides left. Give it the same transform so
      // it rides along with the bubble instead of just widening in place.
      replyBtn.style.transform = `translateX(${-reveal}px)`;
    }
    replyBtn.style.width = reveal + "px";
    replyBtn.style.padding = (reveal * 0.15).toFixed(1) + "px"; // scales to 6px at MAX_REVEAL, same as the hover state
    replyBtn.style.opacity = Math.min(1, dragDistance / THRESHOLD).toFixed(2);
    e.preventDefault();
  }, { passive: false });

  function endSwipe() {
    if (!dragging) return;
    dragging = false;
    replyBtn.style.transition = "width 0.18s ease, padding 0.18s ease, opacity 0.15s ease";
    replyBtn.style.width = "0px";
    replyBtn.style.padding = "0px";
    replyBtn.style.opacity = "0";
    if (!mine) {
      bubble.style.transition = "transform 0.18s ease";
      bubble.style.transform = "translateX(0)";
      replyBtn.style.transition += ", transform 0.18s ease";
      replyBtn.style.transform = "translateX(0)";
    }
    if (swiping && dragDistance >= THRESHOLD) {
      startReply(msg);
    }
    swiping = false;
  }

  row.addEventListener("touchend", endSwipe);
  row.addEventListener("touchcancel", endSwipe);
}

// ---------- Reply-to ----------
function startReply(msg) {
  replyingTo = msg;
  replyPreviewName.textContent = msg.sender_id === currentUser?.id ? "You" : profileCache[msg.sender_id] || "Someone";
  replyPreviewText.textContent = msg.body ? truncate(msg.body, 80) : msg.media_path ? "📷 Photo" : "";
  replyPreview.classList.remove("hidden");
  messageInput.focus();
}

function cancelReply() {
  replyingTo = null;
  replyPreview.classList.add("hidden");
}

replyPreviewCancel.addEventListener("click", cancelReply);

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


// Returning from an opened file should preserve the same message position,
// including on browsers that restore the page without a full reload.
function scheduleReturnRestore() {
  const state = getReturnState();
  if (!state.id) return;
  pendingRestoreMessageId = state.id;
  pendingRestoreScrollTop = state.scrollTop;

  requestAnimationFrame(() => {
    restoreReturnMessagePosition();
    // Media/layout can change the scroll height a moment later, so restore
    // again after the browser has completed the next layout pass.
    setTimeout(restoreReturnMessagePosition, 120);
    setTimeout(restoreReturnMessagePosition, 400);
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleReturnRestore();
});

window.addEventListener("pageshow", scheduleReturnRestore);

// ---------- Sending ----------
composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  messageInput.value = "";

  const { error } = await supabaseClient
    .from("messages")
    .insert({ sender_id: currentUser.id, body: text, reply_to: replyingTo?.id || null });
  if (error) console.error(error);
  cancelReply();
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
    .insert({ sender_id: currentUser.id, media_path: path, media_type: file.type, reply_to: replyingTo?.id || null });
  if (error) console.error(error);
  cancelReply();
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
