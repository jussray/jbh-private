import {createXEngagementAdapter} from './x-engagement-adapter.js';

const topic = process.argv.slice(2).join(' ').trim();
const adapter = await createXEngagementAdapter();
const result = await adapter.getTopicEngagement(topic);

process.stdout.write(`${JSON.stringify(result)}\n`);
