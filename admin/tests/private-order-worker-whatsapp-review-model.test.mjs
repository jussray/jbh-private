import test from 'node:test';
import assert from 'node:assert/strict';
import {assessWhatsAppReadiness,validateWhatsAppReviewAction} from '../../.worker-test-dist/whatsapp-review-model.js';
const env={DATABASE_URL:'postgresql://redacted',JBH_WHATSAPP_APP_SECRET:'app-secret-replaced',
 JBH_WHATSAPP_VERIFY_TOKEN:'test-challenge-only',JBH_WHATSAPP_PHONE_NUMBER_ID:'123456789',
 JBH_WHATSAPP_ACCESS_TOKEN:'test-merchant-provider-token',JBH_WHATSAPP_CONTACT_HASH_KEY:'c'.repeat(32),
 JBH_WHATSAPP_GRAPH_VERSION:'v24.0',JBH_WHATSAPP_WEBHOOK_ENABLED:'false',JBH_WHATSAPP_SEND_ENABLED:'false'};
test('configuration presence never implies production activation or leaks values',()=>{
 const s=assessWhatsAppReadiness(env);
 assert.equal(s.liveWebhookEnabled,false);assert.equal(s.liveSendEnabled,false);
 assert.equal(s.credentialPresence.database,true);assert.equal(s.credentialPresence.metaAppSecret,true);
 assert.deepEqual(s.missingBindings,[]);
 assert.equal(JSON.stringify(s).includes('app-secret-replaced'),false);
});
test('missing database and secrets are reported by name only',()=>{
 const s=assessWhatsAppReadiness({});
 assert.equal(s.credentialPresence.database,false);
 assert.ok(s.missingBindings.includes('DATABASE_URL'));
 assert.ok(s.missingBindings.includes('JBH_WHATSAPP_PHONE_NUMBER_ID'));
 assert.equal(s.liveSendEnabled,false);
});
test('malformed phone ID or Graph API version is not configuration complete',()=>{
 const s=assessWhatsAppReadiness({...env,JBH_WHATSAPP_GRAPH_VERSION:'http://secret',JBH_WHATSAPP_PHONE_NUMBER_ID:'abc'});
 assert.equal(s.credentialPresence.phoneNumberId,false);assert.equal(s.credentialPresence.graphVersion,false);
});
test('review actions cannot contain supplier purchase instructions',()=>{
 assert.deepEqual(validateWhatsAppReviewAction({eventId:'wamid.testid',resolution:'no_action_required'}),
  {eventId:'wamid.testid',resolution:'no_action_required'});
 assert.throws(()=>validateWhatsAppReviewAction({eventId:'wamid.testid',resolution:'send_supplier_payment'}));
 assert.throws(()=>validateWhatsAppReviewAction({eventId:'wamid.testid',resolution:'handled_externally',body:'ship immediately'}));
});