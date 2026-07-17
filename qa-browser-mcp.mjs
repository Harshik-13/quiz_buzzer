import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const BASE = 'http://localhost:3000';
const MCP_URL = 'http://localhost:3100/sse';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const transport = new SSEClientTransport(new URL(MCP_URL));
  const client = new Client({
    name: 'qa-test',
    version: '1.0.0',
  });

  console.log('Connecting to Playwright MCP server...');
  await client.connect(transport);
  console.log('Connected!\n');

  // List available tools
  const tools = await client.listTools();
  console.log('Available tools:', tools.tools.map(t => t.name).join(', '));
  console.log();

  async function call(tool, args = {}) {
    console.log(`  Calling: ${tool}(${JSON.stringify(args)})`);
    const result = await client.callTool({ name: tool, arguments: args });
    const text = result.content?.map(c => c.text).join('\n') || '';
    console.log(`  Response: ${text.substring(0, 500)}`);
    return result;
  }

  // 1. HOME PAGE - navigate
  console.log('\n=== 1. HOME PAGE ===');
  await call('browser_navigate', { url: BASE });

  // 2. PARTICIPANT JOIN
  console.log('\n=== 2. PARTICIPANT JOIN ===');
  await call('browser_navigate', { url: BASE + '/participant' });
  await sleep(1000);

  // Type name
  await call('browser_type', { selector: '#name', text: 'Alice' });
  await sleep(500);

  // Click Join
  await call('browser_click', { selector: 'button:has-text("Join")' });
  await sleep(2000);

  // Take snapshot to verify
  const snap = await call('browser_snapshot');

  // 3. ORGANIZER - new tab
  console.log('\n=== 3. ORGANIZER ===');
  await call('browser_navigate', { url: BASE + '/organizer' });
  await sleep(1000);

  // Type password
  await call('browser_type', { selector: 'input[type="password"]', text: '8_HOUR' });
  await sleep(300);

  // Click Authenticate
  const authBtn = await call('browser_click', { selector: 'button:has-text("Authenticate")' });
  await sleep(1500);

  // 4. QUIZ LIFECYCLE
  console.log('\n=== 4. QUESTION LIFECYCLE ===');

  // START
  await call('browser_click', { selector: 'button:has-text("Start")' });
  await sleep(1000);

  // Switch back to participant tab
  // Actually we're on the organizer tab. Let me use a fresh page approach instead.

  // For now, snapshot the organizer state
  await call('browser_snapshot');

  console.log('\n=== DONE ===');
  await client.close();
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
