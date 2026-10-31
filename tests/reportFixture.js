export function pythonReport() {
  const stamp = '2026-10-23T20:00:00+00:00'
  return { schema_version: 'market-intelligence-v1', report_id: 'synthetic-test', report_date: '2026-10-26', generated_at: '2026-10-25T12:00:00+00:00', observation_cutoff: stamp,
    market_regime: { label: 'MIXED' }, daily_features: { QQQ: { symbol: 'QQQ', source_timestamp: stamp, close: 100, daily_trend: 'MIXED', weekly_trend: 'MIXED', previous_day: {}, previous_week: {}, support_resistance: [99, 101] } }, intraday_features: {}, intraday_playbook: [], swing_playbook: [], options_intelligence: [], options_flow_intelligence: [], data_quality: { warnings: ['Missing test baseline'] }, data_errors: [] }
}
