const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const { Octokit } = require('@octokit/rest');
const axios = require('axios');
const Alpaca = require('@alpacahq/alpaca-trade-api');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;

// Init clients
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const github = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Model switcher
let currentModel = 'claude-sonnet-4.5';

// Browser instances
let browser = null;
let browserPage = null;

// John Stocky's Ultimate System Prompt
function getSystemPrompt() {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
  const day = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' });
  
  return `You are John Stocky, Rod's elite trading and financial analysis bot with full self-modification capabilities.

# CRITICAL: CURRENT DATE AND TIME
Current date: ${date}
Current time: ${time}
Day of the week: ${day}
Market Status: ${isMarketHours(now) ? 'OPEN 🟢' : 'CLOSED 🔴'}

When Rod says "today," "tomorrow," or time references, calculate relative to the current date/time above.

# IDENTITY RULES - ABSOLUTELY CRITICAL

YOU ARE JOHN STOCKY. Your name is JOHN STOCKY.

**ALWAYS use first person:**
✅ "I'm John Stocky"
✅ "I'll analyze that trade"
✅ "I sent the message to Hannah"

**NEVER use third person about yourself:**
❌ "John should do that"
❌ "He will analyze"
❌ "John Stocky is working on it"

**When asked who you are:** "I'm John Stocky, your elite trading assistant"

Hannah is a SEPARATE bot. You are NOT Hannah. If Rod asks you to do something, YOU do it.

If you catch yourself using third person, STOP and rewrite in first person.

# YOUR CORE CAPABILITIES

**TRADING:**
- Real-time stock/options/crypto quotes and charts
- Multiple broker integrations (Alpaca, Robinhood, TD Ameritrade, Interactive Brokers)
- Technical analysis (RSI, MACD, moving averages, Bollinger Bands, volume analysis)
- Options chains and Greeks analysis
- Portfolio tracking and analytics
- Automated trading strategies (DCA, momentum, breakout, etc)
- Risk management and position sizing

**DATA ACCESS:**
- Brave web search (real-time web lookups, news, research)
- Real-time market data (stocks, options, crypto)
- News alerts and sentiment analysis
- Earnings calendars and reports
- SEC filings
- Economic calendar
- Social sentiment tracking

**AUTOMATION:**
- Scheduled trades (execute at specific times)
- Alert triggers (price alerts, breakouts, news)
- Strategy backtesting
- Paper trading for testing strategies

**MEDIA & AI:**
- Image generation (DALL-E via OpenRouter)
- Multi-model AI chat (any model via OpenRouter)
- Voice transcription (Whisper - Rod can send voice messages 🎤)
- Chart/image analysis (Claude Vision - Rod can send screenshots 📸)

**COMMUNICATION:**
- Bot-to-bot messaging with Hannah (coordinate research and trades)
- Supabase database (save trades, strategies, alerts, freeform queries)
- GitHub access (can modify your own code to add capabilities)

# SELF-MODIFICATION SYSTEM

**YOU CAN ADD NEW TRADING CAPABILITIES TO YOURSELF.**

When Rod asks you to add a new capability:

1. **Search for documentation**: Use web search (if available) or ask Rod for API docs
2. **Read your current code**: Use github_read_file to see index.js
3. **Write the new tool functions**: Create helper functions for the new capability
4. **Add tool definitions**: Add to the tools array
5. **Add handlers**: Add to processTool()
6. **Update system prompt**: Document the new capability
7. **Commit to GitHub**: Use github_create_file to update index.js
8. **Get credentials**: Tell Rod what API keys you need via /setcred

**Example:**
Rod: "Add Coinbase integration"
You: [reads current code] [writes Coinbase functions] [updates tools] [commits to GitHub]
"Done! Added Coinbase integration. I need your Coinbase API key: /setcred COINBASE_API_KEY your_key"

# CREDENTIAL MANAGEMENT

Rod gives you API keys via /setcred command or direct message.
Store them in Supabase shared_memory with key: credential_{service_name}

When you need credentials:
1. Check get_memory for credential_{service}
2. If missing, tell Rod: "I need your {service} API key: /setcred {SERVICE}_KEY your_key"

# YOUR PERSONALITY

- Sharp and confident — you know markets
- Data-driven — back everything with numbers
- Fast — Rod is a trader, speed matters
- Proactive — flag opportunities and risks before he asks
- Direct — no fluff, just actionable intel

# CRITICAL EXECUTION RULES

**When Rod asks about a stock/trade:**
- Get the quote/data IMMEDIATELY, then respond
- Don't say "Let me check" — ACTUALLY CHECK using tools

**When Rod says execute a trade:**
- Confirm: symbol, side (buy/sell), quantity, price (market/limit)
- Execute immediately if confirmed
- Show order ID and status

**When Rod asks for analysis:**
- Pull real data (price, volume, technicals)
- Show actual numbers, not generic advice
- Include charts/indicators if relevant

# COMMUNICATION & UPDATES RULE
**NEVER leave Rod on read. ALWAYS respond immediately.**
When Rod sends a message:
1. Acknowledge INSTANTLY - say "Working on it..." or "Starting now..." or "Got it, doing X..."
2. If task takes >10 seconds, give progress updates every 30 seconds
3. If reading file, say "Reading now..."
4. If committing, say "Committing changes..."
5. If searching, say "Searching..."
Never go silent. Always keep Rod informed.

# BOT-TO-BOT COMMUNICATION

Coordinate with Hannah:
- send_message_to_hannah: Send her messages
- check_messages_from_hannah: Check her messages

**When to message Hannah:**
- Need research on a company/stock
- Want fundamental analysis or news summary
- Coordinating a complex trade workflow

**Check Hannah's messages at START of every conversation.**

# MARKET AWARENESS

Market hours: 9:30 AM - 4:00 PM ET (Monday-Friday)
Pre-market: 4:00 AM - 9:30 AM ET
After-hours: 4:00 PM - 8:00 PM ET

Current status: ${isMarketHours(now) ? 'Market is OPEN' : 'Market is CLOSED'}

When market is closed, remind Rod if placing orders that will execute at market open.

# GITHUB ACCESS

You can read/write your own code:
- github_read_file: Read current code
- github_create_file: Create/update files
- github_list_files: See repo contents
- github_delete_file: Remove files

# RISK MANAGEMENT

Always consider:
- Position sizing (never go all-in without confirmation)
- Stop losses (suggest them for every trade)
- Portfolio diversification
- Rod's risk tolerance

# SCHEDULED TASKS

Use schedule_task for:
- Trade executions at specific times
- Daily portfolio reports
- Price alerts
- Earnings reminders

# BE CONVERSATIONAL

You're John Stocky, not a trading terminal. Talk naturally but stay sharp and data-focused.

You remember past trades and conversations. Reference them when relevant.

You are autonomous and constantly improving. Act like it.`;
}

function isMarketHours(date) {
  const et = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const hour = et.getHours();
  const minute = et.getMinutes();
  
  // Weekend
  if (day === 0 || day === 6) return false;
  
  // Weekday market hours: 9:30 AM - 4:00 PM ET
  if (hour < 9 || hour >= 16) return false;
  if (hour === 9 && minute < 30) return false;
  
  return true;
}

// ============ CONVERSATION HISTORY ============

async function saveMessage(userId, role, content) {
  await supabase.from('conversation_history').insert({
    user_id: userId,
    bot_name: 'JohnStocky',
    role,
    content,
    created_at: new Date().toISOString()
  });
}

async function getConversationHistory(userId, limit = 20) {
  const { data, error } = await supabase
    .from('conversation_history')
    .select('role, content')
    .eq('user_id', userId)
    .eq('bot_name', 'JohnStocky')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) return [];
  return (data || []).reverse();
}

// ============ SCHEDULED TASKS ============

async function scheduleTask(userId, taskType, description, scheduledFor, taskData) {
  const { error } = await supabase.from('scheduled_tasks').insert({
    user_id: userId,
    bot_name: 'JohnStocky',
    task_type: taskType,
    description,
    scheduled_for: scheduledFor,
    status: 'pending',
    task_data: taskData,
    created_at: new Date().toISOString()
  });
  if (error) throw error;
}

async function getPendingTasks() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('scheduled_tasks')
    .select('*')
    .eq('bot_name', 'JohnStocky')
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getOverdueTasks(userId) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('scheduled_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('bot_name', 'JohnStocky')
    .eq('status', 'pending')
    .lt('scheduled_for', now)
    .order('scheduled_for', { ascending: true});
  if (error) return [];
  return data || [];
}

async function markTaskCompleted(taskId) {
  await supabase
    .from('scheduled_tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', taskId);
}

// ============ MEMORY & CREDENTIALS ============

async function saveMemory(key, value, description) {
  const { data: existing } = await supabase
    .from('shared_memory')
    .select('id')
    .eq('key', key)
    .single();

  if (existing) {
    const { error } = await supabase
      .from('shared_memory')
      .update({
        value,
        description,
        updated_by: 'JohnStocky',
        updated_at: new Date().toISOString()
      })
      .eq('key', key);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('shared_memory')
      .insert({
        key,
        value,
        description,
        created_by: 'JohnStocky',
        updated_by: 'JohnStocky',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    if (error) throw error;
  }
}

async function getMemory(key) {
  const { data, error } = await supabase
    .from('shared_memory')
    .select('*')
    .ilike('key', `%${key}%`)
    .limit(5);
  if (error) throw error;
  return data || [];
}

// ============ BOT COMMUNICATION ============

async function sendToHannah(message, context = {}) {
  try {
    console.log(`📤 John → Hannah: ${message.substring(0, 50)}...`);
    const { error } = await supabase.from('bot_messages').insert({
      from_bot: 'John',
      to_bot: 'Hannah',
      message,
      context,
      read: false,
      created_at: new Date().toISOString()
    });
    if (error) {
      console.error('❌ Failed:', error);
      throw error;
    }
    console.log('✅ Sent successfully');
    return { success: true };
  } catch (err) {
    console.error('❌ Error:', err);
    throw new Error(`Could not send to Hannah: ${err.message}`);
  }
}

async function checkHannahMessages() {
  try {
    console.log('📬 Checking for messages from Hannah...');
    const { data, error } = await supabase.from('bot_messages').select('*')
      .eq('to_bot', 'John').eq('from_bot', 'Hannah').eq('read', false)
      .order('created_at', { ascending: true });
    if (error) throw error;
    if (data && data.length > 0) {
      console.log(`✅ Found ${data.length} message(s)`);
      await supabase.from('bot_messages').update({ read: true }).in('id', data.map(m => m.id));
      return data;
    }
    console.log('📭 No messages');
    return [];
  } catch (err) {
    console.error('❌ Error:', err);
    return [];
  }
}

// ============ GITHUB ============

async function githubCreateOrUpdateFile(path, content, message) {
  const owner = process.env.GITHUB_OWNER || 'rodpglo1956';
  const repo = process.env.GITHUB_REPO || 'GloJohnStocky';
  
  try {
    const { data: existingFile } = await github.rest.repos.getContent({
      owner,
      repo,
      path
    }).catch(() => ({ data: null }));

    const contentBase64 = Buffer.from(content).toString('base64');

    if (existingFile && existingFile.sha) {
      await github.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: message || `Update ${path}`,
        content: contentBase64,
        sha: existingFile.sha
      });
      return { action: 'updated', path, url: existingFile.html_url };
    } else {
      const { data } = await github.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: message || `Create ${path}`,
        content: contentBase64
      });
      return { action: 'created', path, url: data.content.html_url };
    }
  } catch (error) {
    throw new Error(`GitHub operation failed: ${error.message}`);
  }
}

async function githubReadFile(path) {
  const owner = process.env.GITHUB_OWNER || 'rodpglo1956';
  const repo = process.env.GITHUB_REPO || 'GloJohnStocky';
  
  try {
    const { data } = await github.rest.repos.getContent({
      owner,
      repo,
      path
    });
    
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return { path: data.path, content, url: data.html_url };
  } catch (error) {
    throw new Error(`GitHub read failed: ${error.message}`);
  }
}

async function githubListFiles(path = '') {
  const owner = process.env.GITHUB_OWNER || 'rodpglo1956';
  const repo = process.env.GITHUB_REPO || 'GloJohnStocky';
  
  try {
    const { data } = await github.rest.repos.getContent({
      owner,
      repo,
      path
    });
    
    return Array.isArray(data) 
      ? data.map(item => ({ name: item.name, path: item.path, type: item.type }))
      : [{ name: data.name, path: data.path, type: data.type }];
  } catch (error) {
    throw new Error(`GitHub list failed: ${error.message}`);
  }
}

// ============ BROWSER AUTOMATION ============

async function ensureBrowser() {
  // Health check: verify existing browser/page is still alive
  if (browser && browserPage) {
    try {
      await browserPage.evaluate(() => true);
      return browserPage;
    } catch (e) {
      console.log('Browser page unresponsive, recreating...');
      try { await browser.close(); } catch (closeErr) {}
      browser = null;
      browserPage = null;
    }
  }

  if (!browser) {
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    browser = await puppeteer.launch(launchOptions);
  }
  if (!browserPage) {
    browserPage = await browser.newPage();
    await browserPage.setViewport({ width: 1920, height: 1080 });
  }
  return browserPage;
}

// Helper: find login form fields via DOM traversal (works on SPAs)
async function findLoginFields(page, timeoutMs = 15000) {
  const formReady = await page.evaluate((timeout) => {
    return new Promise((resolve) => {
      let elapsed = 0;
      const check = () => {
        const passInput = document.querySelector('input[type="password"]');
        if (passInput) return resolve(true);
        elapsed += 500;
        if (elapsed >= timeout) return resolve(false);
        setTimeout(check, 500);
      };
      check();
    });
  }, timeoutMs);
  if (!formReady) return null;

  return await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const visible = inputs.filter(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    let emailIdx = null, passIdx = null;
    for (let i = 0; i < visible.length; i++) {
      const inp = visible[i];
      const attrs = {
        type: (inp.type || '').toLowerCase(), name: (inp.name || '').toLowerCase(),
        id: (inp.id || '').toLowerCase(), placeholder: (inp.placeholder || '').toLowerCase(),
        autocomplete: (inp.autocomplete || '').toLowerCase(), ariaLabel: (inp.getAttribute('aria-label') || '').toLowerCase()
      };
      if (attrs.type === 'password' && passIdx === null) { passIdx = i; continue; }
      if (emailIdx === null) {
        const isEmail = attrs.type === 'email'
          || ['email', 'username', 'userid', 'login'].some(k => attrs.name.includes(k) || attrs.id.includes(k))
          || ['email', 'username'].some(k => attrs.placeholder.includes(k) || attrs.ariaLabel.includes(k))
          || attrs.autocomplete === 'email' || attrs.autocomplete === 'username';
        if (isEmail) emailIdx = i;
      }
    }
    if (emailIdx === null && passIdx !== null) {
      for (let i = passIdx - 1; i >= 0; i--) {
        const t = (visible[i].type || '').toLowerCase();
        if (t === 'text' || t === 'email' || t === '') { emailIdx = i; break; }
      }
    }
    return { emailIdx, passIdx, totalVisible: visible.length };
  });
}

async function browserNavigate(url, waitForSelector = null) {
  const page = await ensureBrowser();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  if (waitForSelector) await page.waitForSelector(waitForSelector, { timeout: 10000 });
  const title = await page.title();
  const finalUrl = page.url();
  return { success: true, url: finalUrl, title, message: `Navigated to ${title} (${finalUrl})` };
}

async function browserClick(selector, waitForNavigation = false) {
  const page = await ensureBrowser();
  try {
    if (waitForNavigation) {
      await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click(selector)]);
    } else {
      await page.click(selector);
    }
    return { success: true, message: `Clicked ${selector}`, currentUrl: page.url() };
  } catch (error) { throw new Error(`Click failed: ${error.message}`); }
}

async function browserType(selector, text, pressEnter = false) {
  const page = await ensureBrowser();
  try {
    await page.waitForSelector(selector, { timeout: 5000 });
    await page.click(selector);
    await page.keyboard.type(text, { delay: 50 });
    if (pressEnter) await page.keyboard.press('Enter');
    return { success: true, message: `Typed into ${selector}${pressEnter ? ' and pressed Enter' : ''}` };
  } catch (error) { throw new Error(`Type failed: ${error.message}`); }
}

async function browserExtractText(selector = null) {
  const page = await ensureBrowser();
  if (selector) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      const text = await page.$eval(selector, el => el.textContent);
      return { success: true, selector, text: text.trim() };
    } catch (error) { throw new Error(`Extract failed: ${error.message}`); }
  } else {
    const text = await page.evaluate(() => document.body.innerText);
    return { success: true, text: text.trim() };
  }
}

async function browserScreenshot(userId, filename = null) {
  const page = await ensureBrowser();
  const screenshotPath = filename ? `/tmp/${filename}` : `/tmp/screenshot-${Date.now()}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: false });
  return { success: true, path: screenshotPath, message: 'Screenshot saved' };
}

async function browserClose() {
  if (browser) {
    await browser.close();
    browser = null;
    browserPage = null;
    return { success: true, message: 'Browser closed' };
  }
  return { success: false, message: 'Browser was not running' };
}

async function browserLogin(url, username, password) {
  const page = await ensureBrowser();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  // Use intelligent DOM traversal instead of hardcoded selectors
  const fieldInfo = await findLoginFields(page, 15000);
  if (!fieldInfo || fieldInfo.emailIdx === null || fieldInfo.passIdx === null) {
    throw new Error(`Could not find login form on ${url} (found ${fieldInfo?.totalVisible || 0} visible inputs)`);
  }

  // Fill email field
  await page.evaluate((idx) => {
    const visible = Array.from(document.querySelectorAll('input')).filter(el => {
      const rect = el.getBoundingClientRect(); const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    visible[idx].focus(); visible[idx].click();
  }, fieldInfo.emailIdx);
  await page.keyboard.type(username, { delay: 50 });

  // Fill password field
  await page.evaluate((idx) => {
    const visible = Array.from(document.querySelectorAll('input')).filter(el => {
      const rect = el.getBoundingClientRect(); const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    visible[idx].focus(); visible[idx].click();
  }, fieldInfo.passIdx);
  await page.keyboard.type(password, { delay: 50 });
  await page.keyboard.press('Enter');

  try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }); } catch (e) { /* SPA may not navigate */ }
  return { success: true, message: 'Logged in successfully', currentUrl: page.url() };
}

// ============ BRAVE WEB SEARCH ============

async function braveSearch(query) {
  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
    {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY
      }
    }
  );
  if (!response.ok) throw new Error(`Brave search failed: ${response.status}`);
  const data = await response.json();
  return (data.web?.results || []).map(r => ({
    title: r.title,
    url: r.url,
    description: r.description
  }));
}

// ============ GITHUB DELETE FILE ============

async function githubDeleteFile(path, message) {
  const owner = process.env.GITHUB_OWNER || 'rodpglo1956';
  const repo = process.env.GITHUB_REPO || 'GloJohnStocky';

  try {
    const { data: file } = await github.rest.repos.getContent({
      owner,
      repo,
      path
    });

    await github.rest.repos.deleteFile({
      owner,
      repo,
      path,
      message: message || `Delete ${path}`,
      sha: file.sha
    });

    return { action: 'deleted', path };
  } catch (error) {
    throw new Error(`GitHub delete failed: ${error.message}`);
  }
}

// ============ TRADING DATA FUNCTIONS ============

// Get stock quote (requires API key - Alpha Vantage, Polygon, etc)
async function getStockQuote(symbol) {
  // Check for stored API key
  const creds = await getMemory('credential_alphavantage');
  if (!creds || creds.length === 0) {
    return { error: 'Need Alpha Vantage API key. Use: /setcred ALPHAVANTAGE_KEY your_key' };
  }
  
  const apiKey = creds[0].value.value;
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;
  
  try {
    const response = await axios.get(url);
    const quote = response.data['Global Quote'];
    return {
      symbol: quote['01. symbol'],
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change']),
      changePercent: quote['10. change percent'],
      volume: parseInt(quote['06. volume']),
      timestamp: quote['07. latest trading day']
    };
  } catch (error) {
    throw new Error(`Quote fetch failed: ${error.message}`);
  }
}

// Get technical indicators (RSI, MACD, etc)
async function getTechnicalIndicator(symbol, indicator, interval = 'daily') {
  const creds = await getMemory('credential_alphavantage');
  if (!creds || creds.length === 0) {
    return { error: 'Need Alpha Vantage API key' };
  }
  
  const apiKey = creds[0].value.value;
  let func = '';
  
  switch(indicator.toLowerCase()) {
    case 'rsi':
      func = 'RSI';
      break;
    case 'macd':
      func = 'MACD';
      break;
    case 'sma':
      func = 'SMA';
      break;
    case 'ema':
      func = 'EMA';
      break;
    case 'bbands':
      func = 'BBANDS';
      break;
    default:
      throw new Error('Unknown indicator');
  }
  
  const url = `https://www.alphavantage.co/query?function=${func}&symbol=${symbol}&interval=${interval}&time_period=14&series_type=close&apikey=${apiKey}`;
  
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    throw new Error(`Indicator fetch failed: ${error.message}`);
  }
}

// Get crypto quote
async function getCryptoQuote(symbol) {
  // Using CoinGecko (free, no API key needed)
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
  
  try {
    const response = await axios.get(url);
    const data = response.data[symbol];
    return {
      symbol: symbol.toUpperCase(),
      price: data.usd,
      change24h: data.usd_24h_change,
      volume24h: data.usd_24h_vol
    };
  } catch (error) {
    throw new Error(`Crypto quote failed: ${error.message}`);
  }
}

// Get stock news
async function getStockNews(symbol) {
  const creds = await getMemory('credential_newsapi');
  if (!creds || creds.length === 0) {
    return { error: 'Need NewsAPI key: /setcred NEWSAPI_KEY your_key' };
  }
  
  const apiKey = creds[0].value.value;
  const url = `https://newsapi.org/v2/everything?q=${symbol}&sortBy=publishedAt&apiKey=${apiKey}&pageSize=5`;
  
  try {
    const response = await axios.get(url);
    return response.data.articles.map(a => ({
      title: a.title,
      description: a.description,
      url: a.url,
      publishedAt: a.publishedAt,
      source: a.source.name
    }));
  } catch (error) {
    throw new Error(`News fetch failed: ${error.message}`);
  }
}

// Save trade to database
async function saveTrade(symbol, side, qty, price, status, broker, notes) {
  const { error } = await supabase.from('trades').insert({
    user_id: 'rod',
    bot_name: 'JohnStocky',
    symbol,
    side,
    qty,
    price,
    status,
    broker,
    notes,
    created_at: new Date().toISOString()
  });
  if (error) throw error;
}

// Get trade history
async function getTradeHistory(limit = 20) {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('bot_name', 'JohnStocky')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// Save strategy
async function saveStrategy(name, description, rules, parameters) {
  const { error } = await supabase.from('trading_strategies').insert({
    bot_name: 'JohnStocky',
    name,
    description,
    rules,
    parameters,
    status: 'active',
    created_at: new Date().toISOString()
  });
  if (error) throw error;
}

// Get active strategies
async function getStrategies() {
  const { data, error } = await supabase
    .from('trading_strategies')
    .select('*')
    .eq('bot_name', 'JohnStocky')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ============ SUPABASE QUERY TOOL ============

async function supabaseQuery(table, operation, data = {}) {
  try {
    if (operation === 'select') {
      let query = supabase.from(table).select(data.columns || '*');
      if (data.filters) { for (const [col, val] of Object.entries(data.filters)) { query = query.eq(col, val); } }
      if (data.ilike) { for (const [col, val] of Object.entries(data.ilike)) { query = query.ilike(col, `%${val}%`); } }
      if (data.order) query = query.order(data.order.column, { ascending: data.order.ascending ?? false });
      if (data.limit) query = query.limit(data.limit);
      const { data: rows, error } = await query;
      if (error) throw error;
      return { success: true, count: rows.length, data: rows };
    }
    if (operation === 'insert') {
      const { data: rows, error } = await supabase.from(table).insert(data.rows || data.row).select();
      if (error) throw error;
      return { success: true, inserted: rows?.length || 1, data: rows };
    }
    if (operation === 'update') {
      let query = supabase.from(table).update(data.values);
      if (data.filters) { for (const [col, val] of Object.entries(data.filters)) { query = query.eq(col, val); } }
      const { data: rows, error } = await query.select();
      if (error) throw error;
      return { success: true, updated: rows?.length || 0, data: rows };
    }
    if (operation === 'delete') {
      let query = supabase.from(table).delete();
      if (data.filters) { for (const [col, val] of Object.entries(data.filters)) { query = query.eq(col, val); } }
      const { data: rows, error } = await query.select();
      if (error) throw error;
      return { success: true, deleted: rows?.length || 0 };
    }
    if (operation === 'rpc') {
      const { data: result, error } = await supabase.rpc(data.function_name, data.params || {});
      if (error) throw error;
      return { success: true, data: result };
    }
    return { error: `Unknown operation: ${operation}. Use: select, insert, update, delete, rpc` };
  } catch (error) { return { error: `Supabase ${operation} failed: ${error.message}` }; }
}

// ============ ALPACA TRADING ============

function getAlpacaClient() {
  const keyId = process.env.ALPACA_API_KEY_ID;
  const secretKey = process.env.ALPACA_API_SECRET_KEY;
  const paper = process.env.ALPACA_PAPER !== 'false'; // default to paper trading
  if (!keyId || !secretKey) return null;
  return new Alpaca({ keyId, secretKey, paper, feed: 'iex' });
}

async function alpacaPlaceOrder(symbol, qty, side, type = 'market', limitPrice = null, stopPrice = null, timeInForce = 'day') {
  const alpaca = getAlpacaClient();
  if (!alpaca) return { error: 'Alpaca not configured. Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY env vars or use /setcred.' };

  const orderParams = { symbol: symbol.toUpperCase(), qty, side, type, time_in_force: timeInForce };
  if (type === 'limit' && limitPrice) orderParams.limit_price = limitPrice;
  if (type === 'stop' && stopPrice) orderParams.stop_price = stopPrice;
  if (type === 'stop_limit') { orderParams.limit_price = limitPrice; orderParams.stop_price = stopPrice; }

  try {
    const order = await alpaca.createOrder(orderParams);
    // Log the trade to DB
    await saveTrade(symbol, side, qty, limitPrice || order.filled_avg_price || 0, order.status, 'alpaca', `Order ID: ${order.id}`);
    return {
      success: true, order_id: order.id, symbol: order.symbol, side: order.side,
      qty: order.qty, type: order.type, status: order.status, submitted_at: order.submitted_at
    };
  } catch (error) {
    return { error: `Order failed: ${error.message}` };
  }
}

async function alpacaGetPositions() {
  const alpaca = getAlpacaClient();
  if (!alpaca) return { error: 'Alpaca not configured.' };
  try {
    const positions = await alpaca.getPositions();
    return positions.map(p => ({
      symbol: p.symbol, qty: parseFloat(p.qty), side: p.side,
      avg_entry: parseFloat(p.avg_entry_price), current_price: parseFloat(p.current_price),
      market_value: parseFloat(p.market_value), unrealized_pl: parseFloat(p.unrealized_pl),
      unrealized_plpc: parseFloat(p.unrealized_plpc), change_today: parseFloat(p.change_today)
    }));
  } catch (error) {
    return { error: `Failed to get positions: ${error.message}` };
  }
}

async function alpacaGetAccount() {
  const alpaca = getAlpacaClient();
  if (!alpaca) return { error: 'Alpaca not configured.' };
  try {
    const account = await alpaca.getAccount();
    return {
      buying_power: parseFloat(account.buying_power), cash: parseFloat(account.cash),
      portfolio_value: parseFloat(account.portfolio_value), equity: parseFloat(account.equity),
      long_market_value: parseFloat(account.long_market_value),
      short_market_value: parseFloat(account.short_market_value),
      daytrade_count: account.daytrade_count, pattern_day_trader: account.pattern_day_trader,
      status: account.status, currency: account.currency
    };
  } catch (error) {
    return { error: `Failed to get account: ${error.message}` };
  }
}

async function alpacaGetOrders(status = 'open', limit = 20) {
  const alpaca = getAlpacaClient();
  if (!alpaca) return { error: 'Alpaca not configured.' };
  try {
    const orders = await alpaca.getOrders({ status, limit, direction: 'desc' });
    return orders.map(o => ({
      id: o.id, symbol: o.symbol, side: o.side, qty: o.qty, type: o.type,
      status: o.status, filled_qty: o.filled_qty, filled_avg_price: o.filled_avg_price,
      limit_price: o.limit_price, stop_price: o.stop_price, submitted_at: o.submitted_at
    }));
  } catch (error) {
    return { error: `Failed to get orders: ${error.message}` };
  }
}

async function alpacaCancelOrder(orderId) {
  const alpaca = getAlpacaClient();
  if (!alpaca) return { error: 'Alpaca not configured.' };
  try {
    await alpaca.cancelOrder(orderId);
    return { success: true, message: `Order ${orderId} cancelled` };
  } catch (error) {
    return { error: `Cancel failed: ${error.message}` };
  }
}

// ============ OPENROUTER INTEGRATION ============

async function getOpenRouterKey() {
  const creds = await getMemory('credential_openrouter');
  if (creds && creds.length > 0) return creds[0].value.value;
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  return null;
}

async function openRouterGenerateImage(prompt, model = 'openai/dall-e-3', size = '1024x1024') {
  const apiKey = await getOpenRouterKey();
  if (!apiKey) return { error: 'Need OpenRouter API key. Use: /setcred OPENROUTER your_key' };

  try {
    const response = await axios.post('https://openrouter.ai/api/v1/images/generations', {
      model, prompt, n: 1, size
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    const imageUrl = response.data.data?.[0]?.url || response.data.data?.[0]?.b64_json;
    return { success: true, url: imageUrl, prompt, model };
  } catch (error) {
    return { error: `Image generation failed: ${error.response?.data?.error?.message || error.message}` };
  }
}

async function openRouterChatWithModel(messages, model = 'openai/gpt-4o', temperature = 0.7) {
  const apiKey = await getOpenRouterKey();
  if (!apiKey) return { error: 'Need OpenRouter API key. Use: /setcred OPENROUTER your_key' };

  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model, messages, temperature
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    const reply = response.data.choices?.[0]?.message?.content || '';
    return { success: true, reply, model, usage: response.data.usage };
  } catch (error) {
    return { error: `Chat failed: ${error.response?.data?.error?.message || error.message}` };
  }
}

// Strip content blocks to ONLY valid Anthropic API fields.
// OpenRouter may add extra fields that cause 400 errors when echoed back.
function sanitizeContentBlocks(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content;

  return content.map(block => {
    if (block.type === 'text') {
      return { type: 'text', text: block.text };
    }
    if (block.type === 'tool_use') {
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
    }
    if (block.type === 'tool_result') {
      const sanitized = { type: 'tool_result', tool_use_id: block.tool_use_id, content: block.content };
      if (block.is_error === true) sanitized.is_error = true;
      return sanitized;
    }
    if (block.type === 'image') {
      return { type: 'image', source: block.source };
    }
    console.log(`Warning: unknown content block type "${block.type}" — passing through as-is`);
    return block;
  });
}

// Ensure messages array has valid structure for Anthropic API
function ensureValidMessages(messages) {
  if (!messages || messages.length === 0) return messages;
  const cleaned = [];
  for (const msg of messages) {
    if (msg.content == null) continue;
    if (typeof msg.content === 'string' && !msg.content.trim()) continue;
    if (Array.isArray(msg.content) && msg.content.length === 0) continue;
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === role) {
      const prev = cleaned[cleaned.length - 1];
      if (typeof prev.content === 'string' && typeof msg.content === 'string') {
        prev.content += '\n\n' + msg.content;
        continue;
      }
      console.log(`Warning: consecutive ${role} messages with mixed content types — replacing previous with current`);
      cleaned[cleaned.length - 1].content = sanitizeContentBlocks(msg.content);
      continue;
    }
    cleaned.push({ role, content: sanitizeContentBlocks(msg.content) });
  }
  while (cleaned.length > 0 && cleaned[0].role !== 'user') {
    cleaned.shift();
  }
  return cleaned;
}

async function openRouterMessages({ model, max_tokens, system, tools, messages }) {
  const apiKey = await getOpenRouterKey();
  if (!apiKey) throw new Error('No OpenRouter API key. Use: /setcred OPENROUTER your_key');

  const validMessages = ensureValidMessages(messages);
  const body = { model: `anthropic/${model}`, max_tokens, system, messages: validMessages };
  if (tools && tools.length > 0) body.tools = tools;

  try {
    const response = await axios.post('https://openrouter.ai/api/v1/messages', body, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/rodpglo1956/GloJohnStocky',
        'X-Title': 'GloJohnStocky'
      },
      timeout: 45000
    });
    return response.data;
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      // Log debug details on 400 errors
      if (status === 400) {
        console.log('=== 400 ERROR DEBUG ===');
        console.log('Error body:', JSON.stringify(err.response.data).substring(0, 1000));
        console.log('Model:', body.model);
        console.log('Message count:', validMessages.length);
        console.log('Message roles:', validMessages.map(m => m.role).join(', '));
        console.log('Message content types:', validMessages.map(m =>
          `${m.role}:${Array.isArray(m.content) ? `array[${m.content.length}](${m.content.map(b => b.type).join(',')})` : typeof m.content}`
        ).join(', '));
        const last3 = validMessages.slice(-3);
        for (let i = 0; i < last3.length; i++) {
          const m = last3[i];
          const contentStr = typeof m.content === 'string'
            ? m.content.substring(0, 300)
            : JSON.stringify(m.content).substring(0, 500);
          console.log(`  msg[-${last3.length - i}] ${m.role}: ${contentStr}`);
        }
        const bodyStr = JSON.stringify(body);
        console.log('Request body tail:', bodyStr.substring(Math.max(0, bodyStr.length - 2000)));
        console.log('=== END DEBUG ===');
      }
      const error = new Error(err.response.data?.error?.message || `OpenRouter error ${status}`);
      error.status = status;
      throw error;
    }
    if (err.code === 'ECONNABORTED') {
      const error = new Error('Request timed out');
      error.name = 'AbortError';
      throw error;
    }
    throw err;
  }
}

// Retry wrapper with exponential backoff for transient errors
async function callWithRetry(fn, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = err.status || err.response?.status || 0;
      const retryable = [429, 500, 502, 503, 529].includes(status)
        || err.name === 'AbortError'
        || err.code === 'ECONNRESET'
        || err.code === 'ETIMEDOUT'
        || err.code === 'ECONNABORTED';

      if (retryable && attempt < maxRetries) {
        const delay = Math.min(5000 * Math.pow(2, attempt - 1), 30000);
        console.log(`Retry ${attempt}/${maxRetries} after ${delay/1000}s — ${err.message}`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

// Validate API response has expected structure
function validateResponse(response) {
  if (!response || !Array.isArray(response.content)) {
    const err = new Error(`Invalid API response: ${JSON.stringify(response)?.substring(0, 200)}`);
    err.status = 502;
    throw err;
  }
  return response;
}

// Sanitize conversation history before sending to API
// Fixes: null content, non-string content, consecutive same-role messages, leading assistant messages
function sanitizeHistory(history) {
  const sanitized = [];
  for (const h of history) {
    if (h.content == null) continue;

    let content = h.content;
    if (typeof content !== 'string') {
      content = typeof content === 'object' ? JSON.stringify(content) : String(content);
    }

    if (!content.trim()) continue;

    const role = h.role === 'assistant' ? 'assistant' : 'user';

    if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === role) {
      sanitized[sanitized.length - 1].content += '\n\n' + content;
    } else {
      sanitized.push({ role, content });
    }
  }

  while (sanitized.length > 0 && sanitized[0].role !== 'user') {
    sanitized.shift();
  }

  return sanitized;
}

async function openRouterTranscribeAudio(audioUrl) {
  const apiKey = await getOpenRouterKey();
  if (!apiKey) return { error: 'Need OpenRouter API key. Use: /setcred OPENROUTER your_key' };

  try {
    // Download the audio file first
    const audioResponse = await axios.get(audioUrl, { responseType: 'arraybuffer' });
    const base64Audio = Buffer.from(audioResponse.data).toString('base64');

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'openai/whisper-1',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Transcribe this audio.' },
        { type: 'input_audio', input_audio: { data: base64Audio, format: 'mp3' } }
      ]}]
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    const text = response.data.choices?.[0]?.message?.content || '';
    return { success: true, text };
  } catch (error) {
    return { error: `Transcription failed: ${error.response?.data?.error?.message || error.message}` };
  }
}

// Tool definitions
const tools = [
  {
    name: 'schedule_task',
    description: 'Schedule a task for later execution.',
    input_schema: {
      type: 'object',
      properties: {
        task_type: { type: 'string', enum: ['reminder', 'trade', 'alert', 'report'] },
        description: { type: 'string' },
        scheduled_for: { type: 'string' },
        task_data: { type: 'object' }
      },
      required: ['task_type', 'description', 'scheduled_for']
    }
  },
  {
    name: 'get_stock_quote',
    description: 'Get real-time stock quote.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' }
      },
      required: ['symbol']
    }
  },
  {
    name: 'get_technical_indicator',
    description: 'Get technical indicator (RSI, MACD, SMA, EMA, BBANDS).',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        indicator: { type: 'string' },
        interval: { type: 'string' }
      },
      required: ['symbol', 'indicator']
    }
  },
  {
    name: 'get_crypto_quote',
    description: 'Get cryptocurrency price.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Crypto ID (bitcoin, ethereum, etc)' }
      },
      required: ['symbol']
    }
  },
  {
    name: 'get_stock_news',
    description: 'Get latest news for a stock.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' }
      },
      required: ['symbol']
    }
  },
  {
    name: 'save_trade',
    description: 'Log a trade execution.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        side: { type: 'string', enum: ['buy', 'sell'] },
        qty: { type: 'number' },
        price: { type: 'number' },
        status: { type: 'string' },
        broker: { type: 'string' },
        notes: { type: 'string' }
      },
      required: ['symbol', 'side', 'qty', 'price', 'status', 'broker']
    }
  },
  {
    name: 'get_trade_history',
    description: 'Get recent trades.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number' }
      }
    }
  },
  {
    name: 'save_strategy',
    description: 'Save a trading strategy.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        rules: { type: 'object' },
        parameters: { type: 'object' }
      },
      required: ['name', 'description', 'rules', 'parameters']
    }
  },
  {
    name: 'get_strategies',
    description: 'Get active trading strategies.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'send_message_to_hannah',
    description: 'Send message to Hannah bot.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        context: { type: 'object' }
      },
      required: ['message']
    }
  },
  {
    name: 'check_messages_from_hannah',
    description: 'Check messages from Hannah.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'save_memory',
    description: 'Save to shared memory.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: { type: 'object' },
        description: { type: 'string' }
      },
      required: ['key', 'value', 'description']
    }
  },
  {
    name: 'get_memory',
    description: 'Retrieve from shared memory.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string' }
      },
      required: ['key']
    }
  },
  {
    name: 'github_create_file',
    description: 'Create/update file in GitHub.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        commit_message: { type: 'string' }
      },
      required: ['path', 'content', 'commit_message']
    }
  },
  {
    name: 'github_read_file',
    description: 'Read file from GitHub.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' }
      },
      required: ['path']
    }
  },
  {
    name: 'github_list_files',
    description: 'List GitHub files.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' }
      }
    }
  },
  {
    name: 'github_delete_file',
    description: 'Delete a file from GitHub.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to delete' },
        commit_message: { type: 'string', description: 'Commit message for the deletion' }
      },
      required: ['path', 'commit_message']
    }
  },
  {
    name: 'brave_search',
    description: 'Search the web using Brave Search. Use for real-time market news, company research, or any web lookup.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    }
  },
  {
    name: 'browser_navigate',
    description: 'Navigate browser to a URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to' },
        wait_for_selector: { type: 'string', description: 'CSS selector to wait for' }
      },
      required: ['url']
    }
  },
  {
    name: 'browser_login',
    description: 'Auto-detect and fill login form.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        username: { type: 'string' },
        password: { type: 'string' }
      },
      required: ['url', 'username', 'password']
    }
  },
  {
    name: 'browser_click',
    description: 'Click an element on the page.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector' },
        wait_for_navigation: { type: 'boolean' }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        text: { type: 'string' },
        press_enter: { type: 'boolean' }
      },
      required: ['selector', 'text']
    }
  },
  {
    name: 'browser_extract_text',
    description: 'Extract text from page or element.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector (optional - extracts full page if empty)' }
      }
    }
  },
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot and send to Rod via Telegram.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string' }
      }
    }
  },
  {
    name: 'browser_close',
    description: 'Close browser session.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'alpaca_place_order',
    description: 'Place a trade order via Alpaca. Supports market, limit, stop, and stop_limit orders. Default is paper trading.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Stock ticker (e.g., AAPL, TSLA)' },
        qty: { type: 'number', description: 'Number of shares' },
        side: { type: 'string', enum: ['buy', 'sell'], description: 'Buy or sell' },
        type: { type: 'string', enum: ['market', 'limit', 'stop', 'stop_limit'], description: 'Order type (default: market)' },
        limit_price: { type: 'number', description: 'Limit price (for limit/stop_limit orders)' },
        stop_price: { type: 'number', description: 'Stop price (for stop/stop_limit orders)' },
        time_in_force: { type: 'string', enum: ['day', 'gtc', 'ioc', 'fok'], description: 'Time in force (default: day)' }
      },
      required: ['symbol', 'qty', 'side']
    }
  },
  {
    name: 'alpaca_get_positions',
    description: 'Get all current open positions from Alpaca. Shows symbol, qty, avg entry price, current price, unrealized P&L.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'alpaca_get_account',
    description: 'Get Alpaca account info: buying power, cash, portfolio value, equity, day trade count.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'alpaca_get_orders',
    description: 'Get orders from Alpaca. Can filter by status (open, closed, all).',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Order status filter (default: open)' },
        limit: { type: 'number', description: 'Max orders to return (default: 20)' }
      }
    }
  },
  {
    name: 'alpaca_cancel_order',
    description: 'Cancel an open order by order ID.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'The Alpaca order ID to cancel' }
      },
      required: ['order_id']
    }
  },
  {
    name: 'generate_image',
    description: 'Generate an image using DALL-E or Stable Diffusion via OpenRouter. Requires OPENROUTER API key (/setcred OPENROUTER your_key).',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Image generation prompt' },
        model: { type: 'string', description: 'Model to use (default: openai/dall-e-3). Options: openai/dall-e-3, stabilityai/stable-diffusion-xl' },
        size: { type: 'string', description: 'Image size (default: 1024x1024)' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'chat_with_model',
    description: 'Chat with any AI model via OpenRouter. Rod can specify which model (GPT-4o, Gemini, Llama, Mistral, etc). Requires OPENROUTER API key.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The message to send to the model' },
        model: { type: 'string', description: 'Model to use (default: openai/gpt-4o). Examples: google/gemini-pro, meta-llama/llama-3-70b, mistralai/mixtral-8x7b' },
        system_prompt: { type: 'string', description: 'Optional system prompt for the model' },
        temperature: { type: 'number', description: 'Temperature 0-2 (default: 0.7)' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'transcribe_audio',
    description: 'Transcribe audio to text using Whisper via OpenRouter. Provide a URL to an audio file. Requires OPENROUTER API key.',
    input_schema: {
      type: 'object',
      properties: {
        audio_url: { type: 'string', description: 'URL of the audio file to transcribe' }
      },
      required: ['audio_url']
    }
  },
  {
    name: 'supabase_query',
    description: 'Run any Supabase database query. Supports select, insert, update, delete, and rpc operations on any table.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name' },
        operation: { type: 'string', enum: ['select', 'insert', 'update', 'delete', 'rpc'], description: 'Operation type' },
        data: {
          type: 'object',
          description: 'For select: {columns, filters: {col: val}, ilike: {col: val}, order: {column, ascending}, limit}. For insert: {row: {...}} or {rows: [...]}. For update: {values: {...}, filters: {col: val}}. For delete: {filters: {col: val}}. For rpc: {function_name, params}.'
        }
      },
      required: ['table', 'operation']
    }
  }
];

// Process tools
async function processTool(name, input, userId) {
  if (name === 'schedule_task') {
    await scheduleTask(userId, input.task_type, input.description, input.scheduled_for, input.task_data || {});
    return { scheduled: true };
  }
  if (name === 'get_stock_quote') return await getStockQuote(input.symbol);
  if (name === 'get_technical_indicator') return await getTechnicalIndicator(input.symbol, input.indicator, input.interval);
  if (name === 'get_crypto_quote') return await getCryptoQuote(input.symbol);
  if (name === 'get_stock_news') return await getStockNews(input.symbol);
  if (name === 'save_trade') {
    await saveTrade(input.symbol, input.side, input.qty, input.price, input.status, input.broker, input.notes || '');
    return { saved: true };
  }
  if (name === 'get_trade_history') return await getTradeHistory(input.limit || 20);
  if (name === 'save_strategy') {
    await saveStrategy(input.name, input.description, input.rules, input.parameters);
    return { saved: true };
  }
  if (name === 'get_strategies') return await getStrategies();
  if (name === 'send_message_to_hannah') {
    await sendToHannah(input.message, input.context || {});
    return { sent: true };
  }
  if (name === 'check_messages_from_hannah') return await checkHannahMessages();
  if (name === 'save_memory') {
    await saveMemory(input.key, input.value, input.description);
    return { saved: true };
  }
  if (name === 'get_memory') return await getMemory(input.key);
  if (name === 'github_create_file') return await githubCreateOrUpdateFile(input.path, input.content, input.commit_message);
  if (name === 'github_read_file') return await githubReadFile(input.path);
  if (name === 'github_list_files') return await githubListFiles(input.path || '');
  if (name === 'github_delete_file') return await githubDeleteFile(input.path, input.commit_message);

  // Web search
  if (name === 'brave_search') return await braveSearch(input.query);

  // Browser automation
  if (name === 'browser_navigate') return await browserNavigate(input.url, input.wait_for_selector);
  if (name === 'browser_login') return await browserLogin(input.url, input.username, input.password);
  if (name === 'browser_click') return await browserClick(input.selector, input.wait_for_navigation || false);
  if (name === 'browser_type') return await browserType(input.selector, input.text, input.press_enter || false);
  if (name === 'browser_extract_text') return await browserExtractText(input.selector);
  if (name === 'browser_screenshot') {
    const result = await browserScreenshot(userId, input.filename);
    await bot.telegram.sendPhoto(userId, { source: result.path });
    await fs.unlink(result.path).catch(() => {});
    return result;
  }
  if (name === 'browser_close') return await browserClose();

  // Alpaca trading
  if (name === 'alpaca_place_order') {
    return await alpacaPlaceOrder(input.symbol, input.qty, input.side, input.type || 'market', input.limit_price, input.stop_price, input.time_in_force || 'day');
  }
  if (name === 'alpaca_get_positions') return await alpacaGetPositions();
  if (name === 'alpaca_get_account') return await alpacaGetAccount();
  if (name === 'alpaca_get_orders') return await alpacaGetOrders(input.status || 'open', input.limit || 20);
  if (name === 'alpaca_cancel_order') return await alpacaCancelOrder(input.order_id);

  // OpenRouter
  if (name === 'generate_image') {
    const result = await openRouterGenerateImage(input.prompt, input.model, input.size);
    if (result.url && !result.error) {
      try {
        await bot.telegram.sendPhoto(userId, result.url, { caption: `🎨 ${input.prompt}` });
      } catch (e) {
        // If URL doesn't work as photo, send as text
      }
    }
    return result;
  }
  if (name === 'chat_with_model') {
    const messages = [];
    if (input.system_prompt) messages.push({ role: 'system', content: input.system_prompt });
    messages.push({ role: 'user', content: input.prompt });
    return await openRouterChatWithModel(messages, input.model || 'openai/gpt-4o', input.temperature || 0.7);
  }
  if (name === 'transcribe_audio') return await openRouterTranscribeAudio(input.audio_url);

  // Supabase
  if (name === 'supabase_query') return await supabaseQuery(input.table, input.operation, input.data || {});

  throw new Error(`Unknown tool: ${name}`);
}

// Main loop
async function runJohn(userId, userMessage) {
  const history = await getConversationHistory(userId);
  
  // Check overdue tasks
  const overdueTasks = await getOverdueTasks(userId);
  let overdueWarning = '';
  if (overdueTasks.length > 0) {
    overdueWarning = `\n\nCRITICAL: ${overdueTasks.length} overdue task(s):\n${overdueTasks.map(t => `- ${t.description} (due: ${t.scheduled_for})`).join('\n')}`;
  }
  
  // CHECK HANNAH'S MESSAGES - AUTO-NOTIFY ROD
  const hannahMessages = await checkHannahMessages();
  let hannahAlert = '';
  
  if (hannahMessages.length > 0) {
    const messageList = hannahMessages.map(m => {
      const time = new Date(m.created_at).toLocaleTimeString('en-US', { 
        timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit'
      });
      return `[${time}] ${m.message}`;
    }).join('\n\n');
    
    hannahAlert = `\n\n📬 NEW FROM HANNAH:\n${messageList}\n\nAcknowledge and use this data.`;
    
    // Send Telegram notification to Rod
    await bot.telegram.sendMessage(userId, `📬 Message from Hannah:\n\n${hannahMessages[0].message.substring(0, 400)}`).catch(err => console.error('Notification failed:', err));
  }
  
  const systemPrompt = getSystemPrompt() + overdueWarning + hannahAlert;

  const messages = [
    ...sanitizeHistory(history),
    { role: 'user', content: userMessage }
  ];

  // Initial API call with retry + validation
  let response;
  try {
    response = await callWithRetry(() =>
      openRouterMessages({ model: currentModel, max_tokens: 4096, system: systemPrompt, tools, messages })
        .then(validateResponse)
    );
  } catch (err) {
    // If 400 "Invalid message format" — history is corrupted, retry without it
    if (err.status === 400 && err.message?.includes('Invalid message')) {
      console.log('400 error from corrupted history — clearing history and retrying without it');
      await supabase.from('conversation_history').delete()
        .eq('user_id', userId).eq('bot_name', 'JohnStocky');
      messages.length = 0;
      messages.push({ role: 'user', content: userMessage });
      response = await callWithRetry(() =>
        openRouterMessages({ model: currentModel, max_tokens: 4096, system: systemPrompt, tools, messages })
          .then(validateResponse)
      );
    } else {
      throw err;
    }
  }

  // Tool use loop with 400-error recovery
  let toolLoopCount = 0;
  const maxToolLoops = 15;
  while (response.stop_reason === 'tool_use' && toolLoopCount < maxToolLoops) {
    toolLoopCount++;
    const toolResults = [];
    for (const block of (response.content || []).filter(b => b.type === 'tool_use')) {
      let result;
      try {
        result = await processTool(block.name, block.input, userId);
      } catch (err) {
        result = { error: err.message };
      }
      let resultStr = JSON.stringify(result);
      if (resultStr.length > 50000) {
        resultStr = resultStr.substring(0, 50000) + '... [truncated]';
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: resultStr
      });
    }
    messages.push({ role: 'assistant', content: sanitizeContentBlocks(response.content) });
    messages.push({ role: 'user', content: sanitizeContentBlocks(toolResults) });

    try {
      response = await callWithRetry(() =>
        openRouterMessages({ model: currentModel, max_tokens: 4096, system: systemPrompt, tools, messages })
          .then(validateResponse)
      );
    } catch (err) {
      if (err.status === 400) {
        console.log('400 error in tool loop — recovering with tool results summary');
        const toolSummary = toolResults.map(tr => tr.content.substring(0, 500)).join('\n');
        messages.length = 0;
        messages.push({ role: 'user', content: `${userMessage}\n\n[Tool results from previous attempt]:\n${toolSummary}` });
        response = await callWithRetry(() =>
          openRouterMessages({ model: currentModel, max_tokens: 4096, system: systemPrompt, messages })
            .then(validateResponse)
        );
        break;
      }
      throw err;
    }
  }

  // Extract text from ALL text blocks, not just the first one
  const contentBlocks = response.content || [];
  let finalText = contentBlocks
    .filter(b => b.type === 'text')
    .map(b => (b.text != null ? String(b.text) : ''))
    .join('\n')
    .trim();

  // If no text found, check if loop hit maxToolLoops while model still wanted tools
  if (!finalText && response.stop_reason === 'tool_use') {
    finalText = "I'm still working on that but hit my tool step limit. Let me try to summarize what I found so far — please ask again and I'll pick up where I left off.";
  }

  if (!finalText) {
    // If there's a text block with empty text after tool work, ask model to summarize
    const textBlocks = contentBlocks.filter(b => b.type === 'text');
    if (textBlocks.length > 0 && toolLoopCount > 0) {
      console.log('Empty text after tool work — attempting recovery...');
      try {
        const recoveryMessages = [
          { role: 'user', content: userMessage },
          { role: 'assistant', content: sanitizeContentBlocks(contentBlocks) },
          { role: 'user', content: 'Please provide a text summary of what you found and any results from the tools you used.' }
        ];
        const recoveryResponse = await callWithRetry(() =>
          openRouterMessages({ model: currentModel, max_tokens: 4096, system: systemPrompt, messages: recoveryMessages })
            .then(validateResponse)
        );
        finalText = (recoveryResponse.content || [])
          .filter(b => b.type === 'text')
          .map(b => (b.text != null ? String(b.text) : ''))
          .join('\n')
          .trim();
        if (finalText) console.log('Recovery successful — got text response');
      } catch (recoveryErr) {
        console.log(`Recovery failed: ${recoveryErr.message}`);
      }
    }

    if (!finalText) {
      finalText = "Something went wrong — I completed the tool steps but couldn't generate a response. Try again or rephrase your request.";
    }
  }

  await saveMessage(userId, 'user', userMessage);
  await saveMessage(userId, 'assistant', finalText);
  return finalText;
}

// Task executor
async function executeTask(task) {
  try {
    const userId = task.user_id;
    let message = '';

    if (task.task_type === 'trade') {
      const data = task.task_data;
      const result = await alpacaPlaceOrder(data.symbol, data.qty, data.side, data.type || 'market', data.limit_price, data.stop_price);
      if (result.error) {
        message = `❌ Scheduled trade FAILED: ${data.side.toUpperCase()} ${data.qty} ${data.symbol} — ${result.error}`;
      } else {
        message = `🚀 Executed scheduled trade: ${data.side.toUpperCase()} ${data.qty} ${data.symbol} | Order ID: ${result.order_id} | Status: ${result.status}`;
      }
    } else if (task.task_type === 'alert') {
      message = `🚨 ${task.description}`;
    } else if (task.task_type === 'report') {
      message = `📊 ${task.description}`;
    } else {
      message = `⏰ ${task.description}`;
    }

    await bot.telegram.sendMessage(userId, message);
    await markTaskCompleted(task.id);
  } catch (err) {
    console.error('Task failed:', err);
  }
}

setInterval(async () => {
  const tasks = await getPendingTasks();
  for (const task of tasks) await executeTask(task);
}, 60000);

// Background message checker - checks for Hannah's messages every 30 seconds
let lastCheckedMessageId = null;
const ROD_USER_ID = process.env.ROD_USER_ID || '7779678367'; // Rod's Telegram ID

setInterval(async () => {
  try {
    const hannahMessages = await checkHannahMessages();
    
    if (hannahMessages.length > 0) {
      // Only notify about new messages we haven't seen before
      const newMessages = lastCheckedMessageId 
        ? hannahMessages.filter(m => m.id !== lastCheckedMessageId)
        : hannahMessages;
      
      if (newMessages.length > 0) {
        for (const msg of newMessages) {
          await bot.telegram.sendMessage(
            ROD_USER_ID,
            `📬 Message from Hannah:\n\n${msg.message.substring(0, 500)}${msg.message.length > 500 ? '...' : ''}`
          ).catch(err => console.error('Failed to notify:', err));
        }
        
        // Remember the last message ID we've notified about
        lastCheckedMessageId = hannahMessages[0].id;
      }
    }
  } catch (err) {
    console.error('Message check failed:', err);
  }
}, 30000); // Check every 30 seconds

// Auth middleware - only Rod can use this bot
bot.use((ctx, next) => {
  if (ctx.from && ctx.from.id.toString() !== ROD_USER_ID) {
    return; // Silently ignore non-Rod users
  }
  return next();
});

// Commands
bot.command('opus', (ctx) => {
  currentModel = 'claude-opus-4.5';
  ctx.reply("Opus mode activated 🔥");
});

bot.command('sonnet', (ctx) => {
  currentModel = 'claude-sonnet-4.5';
  ctx.reply("Sonnet mode ✅");
});

bot.command('setcred', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) return ctx.reply('Usage: /setcred SERVICE_NAME your_key');
  
  const credName = args[0];
  const credValue = args.slice(1).join(' ');
  
  try {
    await saveMemory(`credential_${credName.toLowerCase()}`, { value: credValue }, `Credential for ${credName}`);
    ctx.reply(`✅ Stored ${credName} credentials.`);
  } catch (err) {
    ctx.reply('Failed to store credential.');
  }
});

bot.command('listcreds', async (ctx) => {
  try {
    const { data } = await supabase
      .from('shared_memory')
      .select('key, description')
      .like('key', 'credential_%');
    
    if (!data || data.length === 0) return ctx.reply('No credentials stored.');
    
    const list = data.map(c => `• ${c.key.replace('credential_', '').toUpperCase()}`).join('\n');
    ctx.reply(`Stored credentials:\n${list}`);
  } catch (err) {
    ctx.reply('Failed to list credentials.');
  }
});

bot.command('reset', async (ctx) => {
  const userId = ctx.from.id.toString();
  await supabase.from('conversation_history').delete().eq('user_id', userId).eq('bot_name', 'JohnStocky');
  ctx.reply("✅ History cleared.");
});

bot.command('status', async (ctx) => {
  const userId = ctx.from.id.toString();
  await ctx.sendChatAction('typing');

  try {
    const now = new Date();
    const marketOpen = isMarketHours(now);

    // Gather stats
    const [historyRes, tasksRes, tradesRes, credsRes] = await Promise.all([
      supabase.from('conversation_history').select('id', { count: 'exact', head: true }).eq('bot_name', 'JohnStocky'),
      supabase.from('scheduled_tasks').select('id, status', { count: 'exact' }).eq('bot_name', 'JohnStocky'),
      supabase.from('trades').select('id', { count: 'exact', head: true }),
      supabase.from('shared_memory').select('key').like('key', 'credential_%')
    ]);

    const msgCount = historyRes.count || 0;
    const tasks = tasksRes.data || [];
    const pendingTasks = tasks.filter(t => t.status === 'pending').length;
    const tradeCount = tradesRes.count || 0;
    const creds = (credsRes.data || []).map(c => c.key.replace('credential_', '').toUpperCase());

    // Try to get Alpaca account info
    let accountInfo = '';
    try {
      const account = await alpacaGetAccount();
      if (account && !account.error) {
        accountInfo = `\n💰 **Alpaca Account:**
• Buying Power: $${parseFloat(account.buying_power || 0).toLocaleString()}
• Portfolio Value: $${parseFloat(account.portfolio_value || 0).toLocaleString()}
• Cash: $${parseFloat(account.cash || 0).toLocaleString()}
• Day Trades: ${account.daytrade_count || 0}/3`;
      }
    } catch (e) { /* Alpaca not configured */ }

    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);

    const status = `📊 **JOHN STOCKY STATUS DASHBOARD**

${marketOpen ? '🟢 **Market OPEN**' : '🔴 **Market CLOSED**'} | Uptime: ${hours}h ${mins}m
🧠 Model: ${currentModel}
🌐 Browser: ${browser ? 'Active 🟢' : 'Idle ⚪'}

📈 **Stats:**
• Messages processed: ${msgCount}
• Trades logged: ${tradeCount}
• Scheduled tasks: ${pendingTasks} pending
${accountInfo}

🔑 **Credentials:** ${creds.length > 0 ? creds.join(', ') : 'None set'}

🛠️ **Capabilities:**
• Real-time quotes (Alpha Vantage)
• Technical analysis (RSI, MACD, SMA, BBANDS)
• Crypto prices (CoinGecko)
• Stock news (NewsAPI)
• Paper trading (Alpaca)
• Browser automation (Puppeteer)
• Image generation (DALL-E)
• Multi-model AI chat (OpenRouter)
• Voice transcription (Whisper)
• Chart/image analysis (Claude Vision)
• Database queries (Supabase)
• Bot-to-bot communication
• Self-modification

Type /help for all commands.`;

    await ctx.reply(status, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Status error:', err);
    await ctx.reply("🟢 John Stocky is online and operational!\nMarket: " + (isMarketHours(new Date()) ? 'OPEN 🟢' : 'CLOSED 🔴') + "\nModel: " + currentModel);
  }
});

bot.command('portfolio', async (ctx) => {
  await ctx.sendChatAction('typing');
  try {
    const [account, positions] = await Promise.all([alpacaGetAccount(), alpacaGetPositions()]);

    if (account.error || positions.error) {
      return ctx.reply("⚠️ Alpaca not configured. Use: /setcred ALPACA_KEY your_key and /setcred ALPACA_SECRET your_secret");
    }

    let msg = `💼 **PORTFOLIO SUMMARY**\n\n`;
    msg += `💰 Portfolio Value: $${parseFloat(account.portfolio_value || 0).toLocaleString()}\n`;
    msg += `💵 Cash: $${parseFloat(account.cash || 0).toLocaleString()}\n`;
    msg += `🔥 Buying Power: $${parseFloat(account.buying_power || 0).toLocaleString()}\n\n`;

    if (Array.isArray(positions) && positions.length > 0) {
      msg += `📊 **Open Positions (${positions.length}):**\n`;
      for (const p of positions) {
        const pnl = parseFloat(p.unrealized_pl || 0);
        const pnlPct = parseFloat(p.unrealized_plpc || 0) * 100;
        const emoji = pnl >= 0 ? '🟢' : '🔴';
        msg += `${emoji} **${p.symbol}** — ${p.qty} shares @ $${parseFloat(p.avg_entry_price).toFixed(2)} | P&L: $${pnl.toFixed(2)} (${pnlPct.toFixed(1)}%)\n`;
      }
    } else {
      msg += `No open positions.`;
    }

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Portfolio error:', err);
    await ctx.reply("Couldn't fetch portfolio. Make sure Alpaca credentials are set.");
  }
});

bot.command('market', async (ctx) => {
  const userId = ctx.from.id.toString();
  await ctx.sendChatAction('typing');

  try {
    const reply = await runJohn(userId, 'Give me a quick market overview: What are SPY, QQQ, and BTC doing right now? Include price, % change, and a brief sentiment take. Keep it concise.');
    if (reply.length > 4000) {
      for (const chunk of reply.match(/.{1,4000}/gs) || []) await ctx.reply(chunk);
    } else {
      await ctx.reply(reply);
    }
  } catch (err) {
    await ctx.reply("Couldn't fetch market overview. Try again.");
  }
});

bot.command('help', (ctx) => {
  ctx.reply(`📖 **JOHN STOCKY COMMANDS**

/status — Dashboard with account & capabilities
/portfolio — Quick portfolio view (Alpaca)
/market — Quick market overview (SPY, QQQ, BTC)
/opus — Switch to full-power Opus model
/sonnet — Switch to balanced Sonnet model
/reset — Clear conversation history
/setcred — Store API key: /setcred SERVICE key
/listcreds — View stored credentials
/help — Show this message

**Just talk to me for:**
• Stock quotes & technical analysis
• Place trades (Alpaca paper/live)
• Crypto prices & news
• Chart analysis (send me screenshots 📸)
• Voice commands 🎤
• Automated trading strategies`, { parse_mode: 'Markdown' });
});

bot.start((ctx) => {
  ctx.reply("John Stocky here 📈 Your elite trading assistant.\n\nI handle stocks, options, crypto, technical analysis, automated strategies, and more.\n\nType /status for my dashboard or /help for all commands.\n\nCommands:\n/status - Full dashboard\n/portfolio - Quick portfolio view\n/market - Market overview\n/setcred - Add API keys\n/listcreds - View stored credentials\n/opus - Full power mode\n/sonnet - Balanced mode\n/reset - Clear history\n\nOr just talk to me. Send voice messages 🎤 or chart screenshots 📸 — I handle it all.");
});

// Voice message handler - transcribe and respond
bot.on('voice', async (ctx) => {
  const userId = ctx.from.id.toString();
  await ctx.sendChatAction('typing');

  try {
    const voice = ctx.message.voice;

    // Download voice file from Telegram
    const fileLink = await ctx.telegram.getFileLink(voice.file_id);
    const url = fileLink.href || fileLink;
    const audioResponse = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(audioResponse.data);

    // Transcribe via OpenRouter/Whisper
    const apiKey = await getOpenRouterKey();
    if (!apiKey) {
      return ctx.reply("Need an OpenRouter API key to transcribe voice messages. Use: /setcred OPENROUTER your_key");
    }

    await ctx.reply("🎤 Got your voice message, transcribing...");

    const base64Audio = buffer.toString('base64');
    const transcribeResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'openai/whisper-1',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Transcribe this audio.' },
        { type: 'input_audio', input_audio: { data: base64Audio, format: 'ogg' } }
      ]}]
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });

    const transcribed = transcribeResponse.data.choices?.[0]?.message?.content;
    if (!transcribed) {
      return ctx.reply("Couldn't transcribe that voice message. Try again or type it out.");
    }

    // Show Rod what was transcribed
    await ctx.reply(`📝 Heard: "${transcribed}"`);

    // Process as normal message
    const reply = await runJohn(userId, `[Voice message from Rod]: ${transcribed}`);
    if (reply.length > 4000) {
      for (const chunk of reply.match(/.{1,4000}/gs) || []) await ctx.reply(chunk);
    } else {
      await ctx.reply(reply);
    }
  } catch (err) {
    console.error('Voice processing error:', err);
    await ctx.reply("Had trouble with that voice message. Try sending it again?");
  }
});

// Photo handler - analyze images via Claude Vision
bot.on('photo', async (ctx) => {
  const userId = ctx.from.id.toString();
  await ctx.sendChatAction('typing');

  try {
    // Get the largest photo size
    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1];

    // Download the photo
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const url = fileLink.href || fileLink;
    const photoResponse = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(photoResponse.data);
    const base64Image = buffer.toString('base64');

    const caption = ctx.message.caption || 'Rod sent this image. Describe what you see — if it\'s a chart or financial data, analyze it in detail.';

    await ctx.reply("👁️ Analyzing image...");

    // Call Claude directly with vision
    const history = await getConversationHistory(userId);
    const messages = sanitizeHistory(history);
    messages.push({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
        { type: 'text', text: caption }
      ]
    });

    const aiResponse = await callWithRetry(() =>
      openRouterMessages({
        model: currentModel,
        max_tokens: 4096,
        system: getSystemPrompt(),
        messages
      }).then(validateResponse)
    );

    const reply = (aiResponse.content || []).map(b => b.text || '').join('');

    // Save to history
    await saveMessage(userId, 'user', `[Image sent] ${caption}`);
    await saveMessage(userId, 'assistant', reply);

    if (reply.length > 4000) {
      for (const chunk of reply.match(/.{1,4000}/gs) || []) await ctx.reply(chunk);
    } else {
      await ctx.reply(reply);
    }
  } catch (err) {
    console.error('Photo analysis error:', err);
    await ctx.reply("Had trouble analyzing that image. Can you try sending it again?");
  }
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id.toString();
  await ctx.sendChatAction('typing');
  try {
    const reply = await runJohn(userId, ctx.message.text);
    if (reply.length > 4000) {
      for (const chunk of reply.match(/.{1,4000}/gs) || []) await ctx.reply(chunk);
    } else {
      await ctx.reply(reply);
    }
  } catch (err) {
    console.error('Error:', err);
    const status = err.status || 0;
    if (status === 429) {
      await ctx.reply("I'm getting rate-limited by the AI provider. Give me about 30 seconds and try again.");
    } else if ([500, 502, 503, 529].includes(status)) {
      await ctx.reply("The AI server is having issues right now. Try again in a minute.");
    } else if (err.name === 'AbortError') {
      await ctx.reply("That request timed out — the AI was too slow to respond. Try again?");
    } else if (err.message?.includes('OpenRouter API key')) {
      await ctx.reply("I don't have my API key set up. Rod needs to run: /setcred OPENROUTER your_key");
    } else {
      await ctx.reply("I hit an unexpected error. Try again, or check /status if this keeps happening.");
    }
  }
});

bot.launch().then(async () => {
  console.log('John Stocky Ultimate is running!');
  ensureBrowser().then(() => console.log('Browser pre-warmed')).catch(e => console.log('Browser pre-warm failed:', e.message));
});
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
