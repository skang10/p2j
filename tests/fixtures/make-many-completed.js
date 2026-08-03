function items(prefix, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    title: `${prefix === 'completed-archived' ? 'Archived' : 'Active'} completed item ${i + 1}`,
  }));
}

function makeManyCompleted() {
  const activeSubs = items('completed-active', 60);
  const archivedSubs = items('completed-archived', 40);
  const logs = {
    '2026-08-01': {},
    '2026-08-02': {},
    '2026-08-03': {},
    '2026-08-04': {},
  };

  activeSubs.forEach((sub, i) => { logs[i < 30 ? '2026-08-01' : '2026-08-02'][sub.id] = 1; });
  archivedSubs.forEach((sub, i) => { logs[i < 20 ? '2026-08-03' : '2026-08-04'][sub.id] = 1; });

  return {
    _mockScenario: 'many-completed-items',
    goals: [
      { id: 'completed-active-goal', type: 'list', title: 'Active completed work', subs: activeSubs },
      { id: 'completed-archived-goal', type: 'list', title: 'Archived completed work', archived: true, subs: archivedSubs },
    ],
    logs,
  };
}

module.exports = makeManyCompleted;

if (require.main === module) process.stdout.write(`${JSON.stringify(makeManyCompleted(), null, 2)}\n`);
