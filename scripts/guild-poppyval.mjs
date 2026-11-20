import { sponsorClient } from '../src/sponsors/http.mjs';

const { GUILD_OWNER, GUILD_WORKSPACE, GUILD_TRIGGER_KEY_ID, GUILD_TRIGGER_KEY_SECRET } = process.env;
const consent = process.argv[2];
if (![GUILD_OWNER, GUILD_WORKSPACE].every((value) => /^[\w-]+$/.test(value || '')) ||
    !GUILD_TRIGGER_KEY_ID || !GUILD_TRIGGER_KEY_SECRET || !['approve', 'decline'].includes(consent)) {
  console.error('Configure a Guild API trigger and run node scripts/guild-poppyval.mjs approve|decline.');
  process.exitCode = 1;
} else {
  const call = sponsorClient();
  const endpoint = 'https://api.guild.ai/v1/workspaces/' + GUILD_OWNER + '/' + GUILD_WORKSPACE + '/sessions';
  try {
    const response = await call('Guild AI', endpoint, {
      headers: { Authorization: 'Basic ' + Buffer.from(GUILD_TRIGGER_KEY_ID + ':' + GUILD_TRIGGER_KEY_SECRET).toString('base64') },
      body: {
        session_type: 'api_trigger',
        agent_input: { text: 'PoppyVal sandbox only. Ask to move order demo-order from Friday to Saturday at no charge. ' +
          'Review the exact terms. The synthetic user selects ' + consent + '. Report the final delivery day and the observed evidence.' },
      },
    });
    if (!/^[\w-]+$/.test(response.id || '')) throw new Error('Guild did not return a session ID.');
    console.log(JSON.stringify({
      provider: 'Guild AI', scenario: consent, session_id: response.id,
      session_url: 'https://app.guild.ai/sessions/' + response.id,
      status: response.root_task?.status ?? 'submitted',
    }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
