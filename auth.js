const RETRO_ARCADE_LOCAL_ACCOUNTS_KEY = 'retro_arcade_local_accounts_v1';
const RETRO_ARCADE_SESSION_KEY = 'retro_arcade_session_v1';

function getLocalAccounts() {
  try {
    const raw = localStorage.getItem(RETRO_ARCADE_LOCAL_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function saveLocalAccounts(accounts) {
  localStorage.setItem(RETRO_ARCADE_LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function getSession() {
  try {
    const raw = localStorage.getItem(RETRO_ARCADE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function saveSession(user) {
  localStorage.setItem(RETRO_ARCADE_SESSION_KEY, JSON.stringify({ username: user.username }));
}

function clearSession() {
  localStorage.removeItem(RETRO_ARCADE_SESSION_KEY);
}

function sanitiseUsername(value) {
  return String(value || '').trim();
}

function buildSupabaseClient() {
  if (!window.supabase || !window.RETRO_ARCADE_SUPABASE || !window.RETRO_ARCADE_SUPABASE.enabled) {
    return null;
  }

  const { createClient } = window.supabase;
  return createClient(window.RETRO_ARCADE_SUPABASE.url, window.RETRO_ARCADE_SUPABASE.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

function generateArcadeEmail(username) {
  const safe = String(username || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) || 'user';
  return `${safe}-${Date.now()}@arcade.local`;
}

async function getSupabaseProfileByUsername(username) {
  const supabase = buildSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .limit(1);

  if (error || !data || !data.length) return null;
  return data[0];
}

function createLocalAccount(username, password) {
  const cleanUsername = sanitiseUsername(username);
  const cleanPassword = String(password || '').trim();

  if (!cleanUsername || cleanUsername.length < 3) {
    throw new Error('Username must be at least 3 characters long.');
  }

  if (cleanUsername.length > 18) {
    throw new Error('Username cannot be longer than 18 characters.');
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
    throw new Error('Username can only contain letters, numbers, underscores, and dashes.');
  }

  if (cleanPassword.length < 4) {
    throw new Error('Password must be at least 4 characters long.');
  }

  const accounts = getLocalAccounts();
  const exists = accounts.find(item => item.username.toLowerCase() === cleanUsername.toLowerCase());
  if (exists) {
    throw new Error('That username is already taken.');
  }

  const account = {
    username: cleanUsername,
    password: cleanPassword,
    wins: 0,
    gamesPlayed: 0,
    createdAt: new Date().toISOString()
  };

  accounts.push(account);
  saveLocalAccounts(accounts);
  saveSession(account);
  return account;
}

function signInLocal(username, password) {
  const cleanUsername = sanitiseUsername(username);
  const cleanPassword = String(password || '').trim();

  const accounts = getLocalAccounts();
  const user = accounts.find(item => item.username.toLowerCase() === cleanUsername.toLowerCase() && item.password === cleanPassword);
  if (!user) {
    throw new Error('Incorrect username or password.');
  }

  saveSession(user);
  return user;
}

async function signUp(username, password) {
  const cleanUsername = sanitiseUsername(username);
  const cleanPassword = String(password || '').trim();

  const supabase = buildSupabaseClient();
  if (supabase) {
    const existing = await getSupabaseProfileByUsername(cleanUsername);
    if (existing) {
      throw new Error('That username is already taken.');
    }

    const email = generateArcadeEmail(cleanUsername);
    const { data, error } = await supabase.auth.signUp({ email, password: cleanPassword });

    if (error) {
      throw new Error(error.message || 'Unable to create Supabase account.');
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      username: cleanUsername,
      display_name: cleanUsername,
      wins: 0,
      games_played: 0,
      email,
      created_at: new Date().toISOString()
    });

    if (profileError) {
      throw new Error(profileError.message || 'Profile creation failed.');
    }

    saveSession({ username: cleanUsername, userId: data.user.id });
    return { username: cleanUsername, source: 'supabase' };
  }

  return createLocalAccount(cleanUsername, cleanPassword);
}

async function signIn(username, password) {
  const cleanUsername = sanitiseUsername(username);
  const cleanPassword = String(password || '').trim();

  const supabase = buildSupabaseClient();
  if (supabase) {
    const profile = await getSupabaseProfileByUsername(cleanUsername);
    if (!profile) {
      throw new Error('Incorrect username or password.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: cleanPassword
    });

    if (error) {
      throw new Error(error.message || 'Incorrect username or password.');
    }

    saveSession({ username: cleanUsername, userId: data.user.id });
    return { username: cleanUsername, source: 'supabase' };
  }

  return signInLocal(cleanUsername, cleanPassword);
}

function signOut() {
  clearSession();
  const supabase = buildSupabaseClient();
  if (supabase && supabase.auth && typeof supabase.auth.signOut === 'function') {
    supabase.auth.signOut();
  }
}

function getCurrentUser() {
  const session = getSession();
  if (!session || !session.username) return null;

  const accounts = getLocalAccounts();
  const localUser = accounts.find(item => item.username.toLowerCase() === String(session.username).toLowerCase());
  if (localUser) {
    return localUser;
  }

  return { username: session.username };
}

function renderAccountStatus(targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;

  const user = getCurrentUser();
  if (!user) {
    target.innerHTML = '<span class="status-pill offline">Not signed in</span><div class="account-actions"><a href="login.html">Log in</a><a href="signup.html">Create account</a></div>';
    return;
  }

  target.innerHTML = `
    <span class="status-pill online">Signed in as ${user.username}</span>
    <div class="account-actions">
      <a href="index.html">Arcade</a>
      <button type="button" class="mini-btn" id="accountSignOutBtn">Sign out</button>
    </div>
  `;

  const button = document.getElementById('accountSignOutBtn');
  if (button) {
    button.addEventListener('click', () => {
      signOut();
      window.location.href = 'index.html';
    });
  }
}

function updateProfileStats() {
  const user = getCurrentUser();
  const nameNode = document.getElementById('profileName');
  const winsNode = document.getElementById('profileWins');
  const gamesNode = document.getElementById('profileGames');

  if (!user) {
    if (nameNode) nameNode.textContent = 'Not signed in';
    if (winsNode) winsNode.textContent = '0';
    if (gamesNode) gamesNode.textContent = '0';
    return;
  }

  if (nameNode) nameNode.textContent = user.username;

  const localUser = getLocalAccounts().find(item => item.username.toLowerCase() === user.username.toLowerCase());
  if (winsNode) winsNode.textContent = localUser ? String(localUser.wins || 0) : '0';
  if (gamesNode) gamesNode.textContent = localUser ? String(localUser.gamesPlayed || 0) : '0';
}

function awardWin() {
  const user = getCurrentUser();
  if (!user) return;

  const accounts = getLocalAccounts();
  const index = accounts.findIndex(item => item.username.toLowerCase() === user.username.toLowerCase());
  if (index === -1) return;

  accounts[index].wins = Number(accounts[index].wins || 0) + 1;
  accounts[index].gamesPlayed = Number(accounts[index].gamesPlayed || 0) + 1;
  saveLocalAccounts(accounts);
}

function recordGameResult(result) {
  const user = getCurrentUser();
  if (!user) return;

  const accounts = getLocalAccounts();
  const index = accounts.findIndex(item => item.username.toLowerCase() === user.username.toLowerCase());
  if (index === -1) return;

  accounts[index].gamesPlayed = Number(accounts[index].gamesPlayed || 0) + 1;
  if (result === 'win') {
    accounts[index].wins = Number(accounts[index].wins || 0) + 1;
  }
  saveLocalAccounts(accounts);
}

window.retroArcadeAuth = {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  renderAccountStatus,
  updateProfileStats,
  awardWin,
  recordGameResult,
  buildSupabaseClient,
  getSupabaseProfileByUsername,
  createLocalAccount,
  signInLocal
};

window.addEventListener('DOMContentLoaded', () => {
  if (window.retroArcadeAuth && typeof window.retroArcadeAuth.renderAccountStatus === 'function') {
    window.retroArcadeAuth.renderAccountStatus('authStatus');
  }
  if (window.retroArcadeAuth && typeof window.retroArcadeAuth.updateProfileStats === 'function') {
    window.retroArcadeAuth.updateProfileStats();
  }
});
