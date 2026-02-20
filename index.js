const { Telegraf } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { Octokit } = require('@octokit/rest');
const axios = require('axios');

// Init clients
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const github = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Model switcher
let currentModel = 'claude-sonnet-4-5-20250929';

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

# IDENTITY AND CONTEXT
You are John Stocky. Your name is JOHN STOCKY. Not "John," not "Stocky," not anything else - JOHN STOCKY.
You respond in first person: "I'll analyze that trade" or "I'm John Stocky, your trading assistant."
Hannah is a SEPARATE bot that Rod also talks to. You are NOT Hannah.
Hannah does research and sends you findings. You do analysis and execute trades.

Never say "Hannah should be able to..." — If Rod asks you to do something, YOU do it.
Never refer to yourself in third person. You're John Stocky speaking directly to Rod.

If Rod asks "who are you" or "what's your name," always say: "I'm John Stocky, your elite trading assistant."

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

**COMMUNICATION:**
- Bot-to-bot messaging with Hannah (coordinate research and trades)
- Supabase database (save trades, strategies, alerts)
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
  const { error } = await supabase
    .from('bot_messages')
    .insert({
      from_bot: 'John',
      to_bot: 'Hannah',
      message,
      context,
      read: false,
      created_at: new Date().toISOString()
    });
  if (error) throw error;
}

async function checkHannahMessages() {
  const { data, error } = await supabase
    .from('bot_messages')
    .select('*')
    .eq('to_bot', 'John')
    .eq('from_bot', 'Hannah')
    .eq('read', false)
    .order('created_at', { ascending: true });
  if (error) throw error;
  
  if (data && data.length > 0) {
    await supabase
      .from('bot_messages')
      .update({ read: true })
      .in('id', data.map(m => m.id));
  }
  
  return data || [];
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
  
  // Check Hannah messages
  const hannahMessages = await checkHannahMessages();
  let hannahWarning = '';
  if (hannahMessages.length > 0) {
    hannahWarning = `\n\nNEW FROM HANNAH:\n${hannahMessages.map(m => `[${new Date(m.created_at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })}] ${m.message}`).join('\n')}`;
  }
  
  const systemPrompt = getSystemPrompt() + overdueWarning + hannahWarning;

  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage }
  ];

  // Rate limit retry
  let retries = 3;
  let response;
  
  while (retries > 0) {
    try {
      response = await anthropic.messages.create({
        model: currentModel,
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages
      });
      break;
    } catch (err) {
      if (err.status === 429 && retries > 1) {
        await new Promise(resolve => setTimeout(resolve, 15000));
        retries--;
      } else throw err;
    }
  }

  while (response.stop_reason === 'tool_use') {
    const toolResults = [];
    for (const block of response.content.filter(b => b.type === 'tool_use')) {
      let result;
      try {
        result = await processTool(block.name, block.input, userId);
      } catch (err) {
        result = { error: err.message };
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result)
      });
    }
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
    
    retries = 3;
    while (retries > 0) {
      try {
        response = await anthropic.messages.create({
          model: currentModel,
          max_tokens: 4096,
          system: systemPrompt,
          tools,
          messages
        });
        break;
      } catch (err) {
        if (err.status === 429 && retries > 1) {
          await new Promise(resolve => setTimeout(resolve, 15000));
          retries--;
        } else throw err;
      }
    }
  }

  const finalText = response.content.find(b => b.type === 'text')?.text || "Something went wrong!";
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
      // Execute trade logic here
      message = `🚀 Executed scheduled trade: ${data.side.toUpperCase()} ${data.qty} ${data.symbol}`;
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

// Commands
bot.command('opus', (ctx) => {
  currentModel = 'claude-opus-4-5-20251101';
  ctx.reply("Opus mode activated 🔥");
});

bot.command('sonnet', (ctx) => {
  currentModel = 'claude-sonnet-4-5-20250929';
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

bot.start((ctx) => {
  ctx.reply("John Stocky here 📈 Your elite trading assistant.\n\nI handle stocks, options, crypto, technical analysis, automated strategies, and more.\n\nCommands:\n/setcred - Add API keys\n/listcreds - View stored credentials\n/opus - Full power mode\n/sonnet - Balanced mode\n/reset - Clear history\n\nOr just talk to me. I coordinate with Hannah and execute trades on command.");
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
    ctx.reply("Having trouble. Try again!");
  }
});

bot.launch().then(() => console.log('John Stocky Ultimate is running!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
