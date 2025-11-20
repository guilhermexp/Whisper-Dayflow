import styles from './Dashboard.module.scss';
import { CardIcon, CrossIcon, RefreshIcon } from 'renderer/icons';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { tipcClient } from 'renderer/lib/tipc-client';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const PIE_COLORS = ['#3b82f6', '#0ea5e9', '#14b8a6', '#f59e0b', '#64748b'];

export default function Dashboard() {
  const { t } = useTranslation();
  const analyticsQuery = useQuery({
    queryKey: ['recording-analytics'],
    queryFn: async () => tipcClient.getRecordingAnalytics(),
  });

  const [autoJournalWindow, setAutoJournalWindow] = useState(60);
  const autoJournalQuery = useQuery({
    queryKey: ['auto-journal-summary', autoJournalWindow],
    enabled: false, // manual trigger
    queryFn: async () =>
      tipcClient.generateAutoJournalSummary({ windowMinutes: autoJournalWindow }),
  });

  const data = analyticsQuery.data;

  const timelineData = useMemo(() => {
    if (!data || !data.timeline) return [];
    return data.timeline.map((entry) => ({
      ...entry,
      label: dayjs(entry.date).format('MMM D'),
      durationMinutes: Number((entry.durationMs / 60000).toFixed(2)),
    }));
  }, [data]);

  const providerData = data?.providerBreakdown || [];

  // Helper functions
  const formatDurationLong = (ms) => {
    if (!ms) return '0m';
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return `${hours}h ${remaining}m`;
  };

  const formatNumber = (value, precision = 0) => {
    if (value == null) return '--';
    return Number(value).toFixed(precision);
  };

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <div className={styles.iconHolder}>
          <CardIcon className={styles.dashboardIcon} />
        </div>
      </Dialog.Trigger>
      <Dialog.Portal container={document.getElementById('dialog')}>
        <Dialog.Overlay className={styles.DialogOverlay} />
        <Dialog.Content className={styles.DialogContent} aria-describedby={undefined}>
          <Dialog.Title className={styles.DialogTitle}>
            <span>{t('dashboard.title')}</span>
            <button
              onClick={() => analyticsQuery.refetch()}
              disabled={analyticsQuery.isRefetching}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: analyticsQuery.isRefetching ? 'not-allowed' : 'pointer',
                padding: '4px',
                marginLeft: '8px',
                opacity: analyticsQuery.isRefetching ? 0.5 : 1,
              }}
            >
              <RefreshIcon style={{ height: '14px', width: '14px', color: 'var(--secondary)' }} />
            </button>
          </Dialog.Title>

          {!data ? (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--secondary)',
              fontSize: '12px',
            }}>
              {analyticsQuery.isLoading ? t('dashboard.loadingAnalytics') : t('dashboard.noAnalytics')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Stats Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <div style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--primary)' }}>
                    {data.totals?.recordings?.toLocaleString() || 0}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '4px' }}>
                    {t('dashboard.totalRecordings')}
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--secondary)', marginTop: '2px' }}>
                    {t('dashboard.avgSession', { duration: formatDurationLong(data.totals?.averageSessionMs) })}
                  </div>
                </div>
                <div style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--primary)' }}>
                    {formatDurationLong(data.totals?.durationMs)}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '4px' }}>
                    {t('dashboard.totalDuration')}
                  </div>
                </div>
                <div style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--primary)' }}>
                    {data.totals?.averageAccuracy == null
                      ? '--'
                      : `${Math.round(data.totals.averageAccuracy * 100)}%`}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '4px' }}>
                    {t('dashboard.avgAccuracy')}
                  </div>
                </div>
                <div style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--primary)' }}>
                    {formatNumber(data.totals?.averageWpm)}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '4px' }}>
                    {t('dashboard.avgWpm')}
                  </div>
                </div>
              </div>

              {/* Timeline Chart */}
              {timelineData.length > 0 && (
                <div style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--primary)', marginBottom: '10px' }}>
                    {t('dashboard.timeline')}
                  </div>
                  <div style={{ height: '160px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timelineData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          tick={{ fontSize: 10, fill: 'var(--secondary)' }}
                        />
                        <YAxis
                          tickLine={false}
                          tick={{ fontSize: 10, fill: 'var(--secondary)' }}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            fontSize: '11px',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={false}
                          name="Recordings"
                        />
                        <Line
                          type="monotone"
                          dataKey="durationMinutes"
                          stroke="#0ea5e9"
                          strokeWidth={2}
                          dot={false}
                          name="Duration (min)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Auto Journal (manual preview) */}
              <div
                style={{
                  background: 'transparent',
                  border: '1px dashed var(--border)',
                  borderRadius: '12px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: '500',
                        color: 'var(--primary)',
                      }}
                    >
                      Auto Journal (beta)
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--secondary)',
                        marginTop: '2px',
                      }}
                    >
                      Generate a summary of what you&apos;ve been doing based on recent recordings.
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <select
                      value={autoJournalWindow}
                      onChange={(e) => setAutoJournalWindow(Number(e.target.value) || 60)}
                      style={{
                        fontSize: '11px',
                        padding: '4px 6px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--primary)',
                      }}
                    >
                      <option value={30}>Last 30 min</option>
                      <option value={60}>Last 60 min</option>
                      <option value={120}>Last 2 hours</option>
                    </select>
                    <button
                      onClick={() => autoJournalQuery.refetch()}
                      disabled={autoJournalQuery.isFetching}
                      style={{
                        padding: '6px 10px',
                        fontSize: '11px',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: autoJournalQuery.isFetching ? 'not-allowed' : 'pointer',
                        background: 'var(--active)',
                        color: 'var(--active-text)',
                        opacity: autoJournalQuery.isFetching ? 0.7 : 1,
                      }}
                    >
                      {autoJournalQuery.isFetching ? 'Generating...' : 'Generate now'}
                    </button>
                  </div>
                </div>

                {autoJournalQuery.data && (
                  <div
                    style={{
                      marginTop: '6px',
                      padding: '8px',
                      borderRadius: '8px',
                      background: 'var(--bg-tertiary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      maxHeight: '180px',
                      overflow: 'auto',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--primary)',
                        fontWeight: 500,
                      }}
                    >
                      Summary
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--secondary)',
                      }}
                    >
                      {autoJournalQuery.data.summary}
                    </div>

                    {autoJournalQuery.data.activities?.length > 0 && (
                      <>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--primary)',
                            fontWeight: 500,
                            marginTop: '4px',
                          }}
                        >
                          Activities
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          {autoJournalQuery.data.activities.map((act, idx) => (
                            <div
                              key={`${act.startTs}-${act.endTs}-${idx}`}
                              style={{
                                borderRadius: '6px',
                                border: '1px solid var(--border)',
                                padding: '6px 8px',
                                fontSize: '11px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '6px',
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: 500,
                                    color: 'var(--primary)',
                                  }}
                                >
                                  {act.title}
                                </span>
                                <span
                                  style={{
                                    fontSize: '10px',
                                    color: 'var(--secondary)',
                                  }}
                                >
                                  {dayjs(act.startTs).format('HH:mm')}–{dayjs(act.endTs).format('HH:mm')}
                                </span>
                              </div>
                              {act.category && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    color: 'var(--secondary)',
                                  }}
                                >
                                  {act.category}
                                </span>
                              )}
                              <span
                                style={{
                                  fontSize: '10px',
                                  color: 'var(--secondary)',
                                }}
                              >
                                {act.summary}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {autoJournalQuery.isError && (
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--error, #ff6b6b)',
                    }}
                  >
                    Failed to generate auto journal. Check console for details.
                  </div>
                )}
              </div>

              {/* Provider Breakdown */}
              {providerData.length > 0 && (
                <div style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--primary)', marginBottom: '10px' }}>
                    {t('dashboard.providerBreakdown')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ height: '120px', width: '120px', flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={providerData}
                            dataKey="count"
                            nameKey="providerId"
                            innerRadius={30}
                            outerRadius={55}
                            paddingAngle={2}
                          >
                            {providerData.map((_, index) => (
                              <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            contentStyle={{
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              fontSize: '11px',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {providerData.map((entry, index) => (
                        <div
                          key={entry.providerId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '11px',
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              height: '8px',
                              width: '8px',
                              borderRadius: '50%',
                              backgroundColor: PIE_COLORS[index % PIE_COLORS.length],
                            }}
                          />
                          <span style={{ color: 'var(--primary)', fontWeight: '500' }}>
                            {entry.providerId}
                          </span>
                          <span style={{ color: 'var(--secondary)', marginLeft: 'auto' }}>
                            {entry.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <Dialog.Close asChild>
            <button className={styles.IconButton} aria-label="Close">
              <CrossIcon />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
