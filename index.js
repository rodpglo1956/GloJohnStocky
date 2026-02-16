const { Telegraf } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const Alpaca = require('@alpacahq/alpaca-trade-api');

// Init clients
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const alpaca = new Alpaca({
  keyId: process.env.ALPACA_API_KEY,
  secretKey: process.env.ALPACA_SECRET_KEY,
  baseUrl: process.env.ALPACA_BASE_URL,
  paper: true
});

// Model switcher
let currentModel = 'claude-sonnet-4-5-20250929';

const SYSTEM_PROMPT = `You are a sharp, warm financial assistant for Rod. You help him track money, manage finances, and paper trade stocks.

Your personality:
- Direct and confident — give Rod real numbers and real talk
- Warm but no fluff — get to the point
- Proactive — flag issues before Rod asks
- Never give financial advice disclaimers unless Rod is about to do something genuinely risky

You have access to:
- Supabase (transactions, subscriptions, goals, debts, paper trades, alerts)
- Alpaca paper trading API (place trades, check portfolio, get quotes)
- Full financial toolkit (cashflow analysis, budgeting, debt payoff, goal tracking)

What you can do:
TRANSACTIONS: Log income/expenses, categorize them, find patterns, detect weird spikes, find small leaks
CASHFLOW: Weekly digest, burn rate, runway calculation, safe-to-spend number
BUDGETING: Envelope system, what-if scenarios, payday planning
DEBTS: Snowball/avalanche planner, payment optimizer, utilization alerts
SUBSCRIPTIONS: Track, rank by value, cancel checklists, renegotiation scripts
GOALS: Savings targets, milestone tracking, sinking funds
BUSINESS: Invoice tracking, expense capture, profit snapshots, tax set-aside, KPI tracking
INVESTING: Contribution schedules, rebalance alerts, risk guardrails
PAPER TRADING: Buy/sell stocks, check portfolio, get quotes, track performance
FRAUD: Flag unrecognized merchants, large transaction alerts, anomaly detection

Always be specific with numbers. If Rod says "how am I doing", pull real data and tell him exactly.`;

// ============ SUPABASE FUNCTIONS ============

async function logTransaction(date, amount, merchant, category, type, notes, source = 'manual') {
  const { error } = await supabase.from('transactions').insert({
    date, amount, merchant, category, type, notes, source,
    created_at: new Date().toISOString()
  });
  if (error) throw error;
}

async function getTransactions(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getCashflowSummary(days = 30) {
  const transactions = await getTransactions(days);
  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const byCategory = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount);
  });
  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  return { income, expenses, net: income - expenses, topCategories, transactionCount: transactions.length };
}

async function getSubscriptions() {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('status', 'active')
    .order('amount', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function addSubscription(merchant, amount, frequency, next_due, category) {
  const { error } = await supabase.from('subscriptions').insert({
    merchant, amount, frequency, next_due, category, status: 'active',
    created_at: new Date().toISOString()
  });
  if (error) throw error;
}

async function getGoals() {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('status', 'active')
    .order('deadline', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function updateGoal(name, amount) {
  const { error } = await supabase
    .from('goals')
    .update({ current_amount: amount })
    .ilike('name', `%${name}%`);
  if (error) throw error;
}

async function addGoal(name, target_amount, deadline, category) {
  const { error } = await supabase.from('goals').insert({
    name, target_amount, current_amount: 0, deadline, category, status: 'active',
    created_at: new Date().toISOString()
  });
  if (error) throw error;
}

async function getDebts() {
  const { data, error } = await supabase
    .from('debts')
    .select('*')
    .eq('status', 'active')
    .order('balance', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getPaperTrades(limit = 20) {
  const { data, error } = await supabase
    .from('paper_trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function savePaperTrade(symbol, side, qty, price, status, alpaca_order_id, notes) {
  const { error } = await supabase.from('paper_trades').insert({
    symbol, side, qty, price, status, alpaca_order_id, notes,
    created_at: new Date().toISOString()
  });
  if (error) throw error;
}

async function saveAlert(type, message) {
  const { error } = await supabase.from('alerts').insert({
    type, message, triggered_at: new Date().toISOString(), acknowledged: false
  });
  if (error) throw error;
}

// ============ ALPACA FUNCTIONS ============

async function getPortfolio() {
  const account = await alpaca.getAccount();
  const positions = await alpaca.getPositions();
  return { account, positions };
}

async function getStockQuote(symbol) {
  const quote = await alpaca.getLatestTrade(symbol);
  return quote;
}

async function placePaperTrade(symbol, side, qty) {
  const order = await alpaca.createOrder({
    symbol: symbol.toUpperCase(),
    qty,
    side,
    type: 'market',
    time_in_force: 'day'
  });
  return order;
}

async function getPortfolioHistory() {
  const history = await alpaca.getPortfolioHistory({
    period: '1M',
    timeframe: '1D'
  });
  return history;
}

// ============ TOOLS ============

const tools = [
  {
    name: 'log_transaction',
    description: 'Log a transaction (income or expense). Use when Rod mentions spending money, receiving money, or wants to track a purchase.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        amount: { type: 'number', description: 'Amount (always positive)' },
        merchant: { type: 'string', description: 'Merchant or source name' },
        category: { type: 'string', description: 'Category (food, transport, entertainment, bills, income, business, etc)' },
        type: { type: 'string', enum: ['income', 'expense'], description: 'Income or expense' },
        notes: { type: 'string', description: 'Any additional notes' }
      },
      required: ['date', 'amount', 'merchant', 'category', 'type']
    }
  },
  {
    name: 'get_cashflow_summary',
    description: 'Get cashflow summary including income, expenses, top categories, burn rate. Use when Rod asks how he is doing financially or wants a digest.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to look back (default 30)' }
      }
    }
  },
  {
    name: 'get_transactions',
    description: 'Get recent transactions. Use when Rod wants to see spending history or find specific transactions.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to look back' }
      }
    }
  },
  {
    name: 'add_subscription',
    description: 'Track a new subscription or recurring bill.',
    input_schema: {
      type: 'object',
      properties: {
        merchant: { type: 'string' },
        amount: { type: 'number' },
        frequency: { type: 'string', enum: ['weekly', 'monthly', 'annual'] },
        next_due: { type: 'string', description: 'Next due date YYYY-MM-DD' },
        category: { type: 'string' }
      },
      required: ['merchant', 'amount', 'frequency', 'next_due', 'category']
    }
  },
  {
    name: 'get_subscriptions',
    description: 'Get all active subscriptions. Use when Rod wants to review bills or find subscription leaks.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'add_goal',
    description: 'Create a new savings goal.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        target_amount: { type: 'number' },
        deadline: { type: 'string', description: 'YYYY-MM-DD' },
        category: { type: 'string' }
      },
      required: ['name', 'target_amount', 'deadline', 'category']
    }
  },
  {
    name: 'get_goals',
    description: 'Get all active savings goals and progress.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'update_goal',
    description: 'Update progress on a savings goal.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        amount: { type: 'number', description: 'Current saved amount' }
      },
      required: ['name', 'amount']
    }
  },
  {
    name: 'get_debts',
    description: 'Get all active debts. Use for debt payoff planning.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_portfolio',
    description: 'Get Alpaca paper trading portfolio — account value, positions, buying power.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_stock_quote',
    description: 'Get latest price for a stock symbol.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Stock ticker symbol e.g. AAPL, TSLA' }
      },
      required: ['symbol']
    }
  },
  {
    name: 'place_paper_trade',
    description: 'Place a paper trade order on Alpaca. Use when Rod wants to buy or sell a stock.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Stock ticker symbol' },
        side: { type: 'string', enum: ['buy', 'sell'] },
        qty: { type: 'number', description: 'Number of shares' }
      },
      required: ['symbol', 'side', 'qty']
    }
  },
  {
    name: 'get_portfolio_history',
    description: 'Get portfolio performance history over the last month.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_paper_trades',
    description: 'Get recent paper trade history from Supabase.',
    input_schema: { type: 'object', properties: {} }
  }
];

// ============ TOOL PROCESSOR ============

async function processTool(name, input) {
  switch (name) {
    case 'log_transaction':
      await logTransaction(input.date, input.amount, input.merchant, input.category, input.type, input.notes);
      return { logged: true };
    case 'get_cashflow_summary':
      return await getCashflowSummary(input.days || 30);
    case 'get_transactions':
      return await getTransactions(input.days || 30);
    case 'add_subscription':
      await addSubscription(input.merchant, input.amount, input.frequency, input.next_due, input.category);
      return { added: true };
    case 'get_subscriptions':
      return await getSubscriptions();
    case 'add_goal':
      await addGoal(input.name, input.target_amount, input.deadline, input.category);
      return { added: true };
    case 'get_goals':
      return await getGoals();
    case 'update_goal':
      await updateGoal(input.name, input.amount);
      return { updated: true };
    case 'get_debts':
      return await getDebts();
    case 'get_portfolio':
      return await getPortfolio();
    case 'get_stock_quote':
      return await getStockQuote(input.symbol);
    case 'place_paper_trade': {
      const order = await placePaperTrade(input.symbol, input.side, input.qty);
      await savePaperTrade(input.symbol, input.side, input.qty, null, order.status, order.id, null);
      return order;
    }
    case 'get_portfolio_history':
      return await getPortfolioHistory();
    case 'get_paper_trades':
      return await getPaperTrades();
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ============ CLAUDE LOOP ============

async function runBot(userMessage) {
  const messages = [{ role: 'user', content: userMessage }];

  let response = await anthropic.messages.create({
    model: currentModel,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools,
    messages
  });

  while (response.stop_reason === 'tool_use') {
    const toolResults = [];
    for (const block of response.content.filter(b => b.type === 'tool_use')) {
      let result;
      try {
        result = await processTool(block.name, block.input);
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
    response = await anthropic.messages.create({
      model: currentModel,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages
    });
  }

  return response.content.find(b => b.type === 'text')?.text || "Something went wrong, try again!";
}

// ============ BOT COMMANDS ============

bot.command('opus', (ctx) => {
  currentModel = 'claude-opus-4-5-20251101';
  ctx.reply("Switched to Opus — full power mode 🔥");
});

bot.command('sonnet', (ctx) => {
  currentModel = 'claude-sonnet-4-5-20250929';
  ctx.reply("Switched back to Sonnet ✅");
});

bot.command('portfolio', async (ctx) => {
  await ctx.sendChatAction('typing');
  try {
    const { account, positions } = await getPortfolio();
    let msg = `💼 *Portfolio*\n\nCash: $${Number(account.cash).toFixed(2)}\nPortfolio Value: $${Number(account.portfolio_value).toFixed(2)}\nBuying Power: $${Number(account.buying_power).toFixed(2)}\n\n`;
    if (positions.length === 0) {
      msg += 'No open positions.';
    } else {
      msg += '*Positions:*\n';
      positions.forEach(p => {
        msg += `${p.symbol}: ${p.qty} shares @ $${Number(p.current_price).toFixed(2)} | P&L: $${Number(p.unrealized_pl).toFixed(2)}\n`;
      });
    }
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply("Couldn't fetch portfolio right now.");
  }
});

bot.command('cashflow', async (ctx) => {
  await ctx.sendChatAction('typing');
  try {
    const summary = await getCashflowSummary(30);
    let msg = `💰 *30-Day Cashflow*\n\nIncome: $${summary.income.toFixed(2)}\nExpenses: $${summary.expenses.toFixed(2)}\nNet: $${summary.net.toFixed(2)}\n\n*Top Categories:*\n`;
    summary.topCategories.forEach(([cat, amt]) => {
      msg += `${cat}: $${amt.toFixed(2)}\n`;
    });
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err) {
    await ctx.reply("Couldn't fetch cashflow right now.");
  }
});

bot.start((ctx) => {
  ctx.reply("Hey Rod 👋 I'm your money bot. I track your cash, manage finances, and paper trade stocks.\n\nCommands:\n/portfolio — check your paper trades\n/cashflow — 30-day money summary\n/opus — switch to full power mode\n/sonnet — switch back to balanced\n\nOr just talk to me naturally.");
});

bot.on('text', async (ctx) => {
  await ctx.sendChatAction('typing');
  try {
    const reply = await runBot(ctx.message.text);
    if (reply.length > 4000) {
      for (const chunk of reply.match(/.{1,4000}/gs) || []) {
        await ctx.reply(chunk);
      }
    } else {
      await ctx.reply(reply);
    }
  } catch (err) {
    console.error('Error:', err);
    await ctx.reply("Having a little trouble right now. Try again in a moment!");
  }
});

bot.launch().then(() => console.log('Money bot is running!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
