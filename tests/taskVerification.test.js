
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  verifyTaskSubmission,
  verifyPartnerEvent,
  isPartnerEventAlreadyConsumed,
  buildVerificationDecision
} = require('../src/services/taskVerification');

test('une preuve client non vérifiée reste en REVIEW', () => {
  const result = verifyTaskSubmission({
    evidence: { screenshot: 'preuve.png' },
    task: { id: 'task-1' },
    completion: { task_id: 'task-1' }
  });

  assert.equal(result.status, 'REVIEW');
  assert.equal(result.reason, 'UNVERIFIED_CLIENT_EVIDENCE');
});

test('une tâche différente est rejetée', () => {
  const result = verifyTaskSubmission({
    evidence: { screenshot: 'preuve.png' },
    task: { id: 'task-1' },
    completion: { task_id: 'task-2' }
  });

  assert.equal(result.status, 'REJECTED');
  assert.equal(result.reason, 'TASK_MISMATCH');
});

test('un événement partenaire valide est vérifié', () => {
  const result = verifyPartnerEvent({
    event: {
      external_event_id: 'event-1',
      partner_id: 'partner-1',
      event_type: 'TASK_COMPLETED',
      user_id: 'user-1',
      external_user_id: 'external-user-1',
      task_id: 'partner-task-1'
    },
    task: {
      id: 'internal-task-1',
      partner_id: 'partner-1',
      partner_task_id: 'partner-task-1'
    },
    completion: {
      task_id: 'internal-task-1',
      user_id: 'user-1'
    },
    expectedUserId: 'user-1',
    expectedExternalUserId: 'external-user-1'
  });

  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.reason, 'PARTNER_EVENT_ACCEPTED');
});

test('un utilisateur différent est rejeté', () => {
  const result = verifyPartnerEvent({
    event: {
      external_event_id: 'event-2',
      partner_id: 'partner-1',
      event_type: 'TASK_COMPLETED',
      user_id: 'user-2',
      external_user_id: 'external-user-1'
    },
    task: { id: 'task-1', partner_id: 'partner-1' },
    completion: { task_id: 'task-1', user_id: 'user-1' },
    expectedUserId: 'user-1',
    expectedExternalUserId: 'external-user-1'
  });

  assert.equal(result.status, 'REJECTED');
  assert.equal(result.reason, 'USER_MISMATCH');
});

test('un événement partenaire déjà consommé est détecté', () => {
  assert.equal(
    isPartnerEventAlreadyConsumed('event-1', new Set(['event-1'])),
    true
  );
});

test('un événement déjà consommé ne peut pas être validé', () => {
  const result = buildVerificationDecision({
    submissionResult: { status: 'PENDING', confidence: 50 },
    partnerResult: { status: 'VERIFIED', reason: 'PARTNER_EVENT_ACCEPTED' },
    eventAlreadyConsumed: true
  });

  assert.equal(result.status, 'REJECTED');
  assert.equal(result.reason, 'PARTNER_EVENT_ALREADY_CONSUMED');
});
  
