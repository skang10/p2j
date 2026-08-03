function makeManyGoals() {
  const active = [
    {
      id: 'many-daily', type: 'daily', title: 'Daily planning and focused execution across every project',
      subs: [
        { id: 'many-daily-plan', title: 'Write a realistic plan for the most important work today' },
        { id: 'many-daily-focus', title: 'Complete one uninterrupted deep-work session' },
      ],
    },
    {
      id: 'many-count-one', type: 'count', target: 30, title: 'Technical practice',
      subs: [
        { id: 'many-arrays', title: 'Arrays and strings' },
        { id: 'many-databases', title: 'Database design and query optimization' },
      ],
    },
    {
      id: 'many-list', type: 'list', title: 'Topics to finish before the next review cycle',
      subs: [
        { id: 'many-observability', title: 'Observability, tracing, metrics, and production diagnostics' },
        { id: 'many-capacity', title: 'Capacity planning under unpredictable traffic patterns' },
        { id: 'many-reliability', title: 'Reliability patterns for distributed systems' },
      ],
    },
    {
      id: 'many-count-two', type: 'count', target: 20, title: 'Conversations and follow-ups',
      subs: [
        { id: 'many-outreach', title: 'Outreach' },
        { id: 'many-followup', title: 'Follow-up' },
      ],
    },
    {
      id: 'many-daily-two', type: 'daily', title: 'Health routine',
      subs: [
        { id: 'many-walk', title: 'Walk' },
        { id: 'many-sleep', title: 'Sleep review' },
      ],
    },
  ];

  const archived = Array.from({ length: 100 }, (_, i) => {
    const n = i + 1;
    return {
      id: `many-archive-${n}`,
      type: n % 3 === 0 ? 'count' : n % 3 === 1 ? 'daily' : 'list',
      ...(n % 3 === 0 ? { target: 10 + (n % 5) } : {}),
      title: n % 10 === 0
        ? `Archived goal ${n} with a deliberately long title for layout stress testing`
        : `Archived goal ${n}`,
      archived: true,
      subs: [
        { id: `many-archive-${n}-a`, title: `Primary record ${n}` },
        { id: `many-archive-${n}-b`, title: `Secondary record ${n}` },
      ],
    };
  });

  const logs = {
    '2026-08-04': {
      'many-daily-plan': 1,
      'many-arrays': 2,
      'many-databases': 1,
      'many-observability': 1,
      'many-outreach': 1,
      'many-walk': 1,
    },
  };
  archived.forEach((goal, i) => {
    const monthIndex = i % 12;
    const year = monthIndex < 4 ? 2025 : 2026;
    const month = monthIndex < 4 ? monthIndex + 9 : monthIndex - 3;
    const day = (i % 28) + 1;
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    logs[key] ||= {};
    logs[key][goal.subs[0].id] = (i % 4) + 1;
  });

  return { _mockScenario: 'many-goals-and-large-archive', goals: [...active, ...archived], logs };
}

module.exports = makeManyGoals;

if (require.main === module) process.stdout.write(`${JSON.stringify(makeManyGoals(), null, 2)}\n`);
