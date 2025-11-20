import styles from './Analytics.module.scss';
import { GaugeIcon, CrossIcon, ClockIcon } from 'renderer/icons';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { tipcClient } from 'renderer/lib/tipc-client';
import { useTranslation } from 'react-i18next';

export default function Analytics() {
  const { t } = useTranslation();
  const [mainTab, setMainTab] = useState('analytics');

  // Analytics queries
  const historyQuery = useQuery({
    queryKey: ['recording-history'],
    queryFn: async () => tipcClient.getRecordingHistory(),
  });

  const analyticsQuery = useQuery({
    queryKey: ['recording-analytics'],
    queryFn: async () => tipcClient.getRecordingAnalytics(),
  });

  const deleteRecordingHistoryMutation = useMutation({
    mutationFn: tipcClient.deleteRecordingHistory,
    onSuccess() {
      historyQuery.refetch();
      analyticsQuery.refetch();
    },
  });

  const deleteRecordingMutation = useMutation({
    mutationFn: (id) => tipcClient.deleteRecording({ id }),
    onSuccess() {
      historyQuery.refetch();
      analyticsQuery.refetch();
    },
  });

  // Computed analytics data
  const historyData = historyQuery.data || [];
  const totalSize = historyData.reduce((acc, item) => acc + (item.fileSize || 0), 0);
  const totalDuration = historyData.reduce((acc, item) => acc + (item.duration || 0), 0);
  const analytics = analyticsQuery.data;

  // Helper functions for formatting
  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let value = bytes;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDuration = (ms) => {
    if (!ms) return '0s';
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}m ${remaining}s`;
  };

  const formatDurationLong = (ms) => {
    if (!ms) return '0m';
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return `${hours}h ${remaining}m`;
  };

  const formatProcessing = (value) => {
    if (value == null) return '--';
    if (value < 1000) return `${value.toFixed(0)}ms`;
    return `${(value / 1000).toFixed(2)}s`;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatConfidence = (score) => {
    if (typeof score !== 'number') return '--';
    return `${Math.round(score * 100)}%`;
  };

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <div className={styles.iconHolder}>
          <GaugeIcon className={styles.analyticsIcon} />
        </div>
      </Dialog.Trigger>
      <Dialog.Portal container={document.getElementById('dialog')}>
        <Dialog.Overlay className={styles.DialogOverlay} />
        <Dialog.Content className={styles.DialogContent} aria-describedby={undefined}>
          <Dialog.Title className={styles.DialogTitle}>{t('analytics.title')}</Dialog.Title>

          {/* Tabs */}
          <Tabs.Root value={mainTab} onValueChange={setMainTab} style={{ marginTop: '16px' }}>
            <Tabs.List style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <Tabs.Trigger
                value="analytics"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  background: mainTab === 'analytics' ? 'var(--active)' : 'var(--bg-tertiary)',
                  color: mainTab === 'analytics' ? 'var(--active-text)' : 'var(--secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                }}
              >
                <GaugeIcon style={{ height: '16px', width: '16px' }} />
                {t('analytics.title')}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="history"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  background: mainTab === 'history' ? 'var(--active)' : 'var(--bg-tertiary)',
                  color: mainTab === 'history' ? 'var(--active-text)' : 'var(--secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                }}
              >
                <ClockIcon style={{ height: '16px', width: '16px' }} />
                {t('navigation.history')}
              </Tabs.Trigger>
            </Tabs.List>

            {/* Analytics Tab */}
            <Tabs.Content value="analytics">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Stats Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--primary)' }}>
                      {historyData.length.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '4px' }}>
                      {t('dashboard.totalRecordings')}
                    </div>
                  </div>
                  <div style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--primary)' }}>
                      {formatBytes(totalSize)}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '4px' }}>
                      {t('analytics.storageUsed')}
                    </div>
                  </div>
                  <div style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--primary)' }}>
                      {formatDurationLong(totalDuration)}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '4px' }}>
                      {t('dashboard.totalDuration')}
                    </div>
                  </div>
                </div>

                {/* Delete All */}
                <div style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--primary)' }}>{t('analytics.recordingHistory')}</div>
                      <div style={{ fontSize: '11px', color: 'var(--secondary)', marginTop: '2px' }}>
                        {t('analytics.recordingsStoredLocally', { count: historyData.length })}
                      </div>
                    </div>
                    <button
                      style={{
                        padding: '6px 12px',
                        fontSize: '11px',
                        background: 'var(--error, #ef4444)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: historyData.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: historyData.length === 0 ? 0.5 : 1,
                      }}
                      disabled={historyData.length === 0}
                      onClick={() => {
                        if (window.confirm(t('analytics.deleteAllConfirm'))) {
                          deleteRecordingHistoryMutation.mutate();
                        }
                      }}
                    >
                      {t('analytics.deleteAll')}
                    </button>
                  </div>
                </div>

                {/* STT Model Performance */}
                {analytics && analytics.sttModelRanking && analytics.sttModelRanking.length > 0 && (
                  <div style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--primary)', marginBottom: '10px' }}>
                      {t('analytics.sttModelPerformance')}
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--secondary)' }}>
                            <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '500' }}>#</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '500' }}>{t('analytics.model')}</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '500' }}>{t('analytics.uses')}</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '500' }}>{t('analytics.avg')}</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '500' }}>{t('analytics.success')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.sttModelRanking.slice(0, 5).map((model, index) => (
                            <tr key={model.modelId} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '6px 8px', color: 'var(--secondary)' }}>{index + 1}</td>
                              <td style={{ padding: '6px 8px', color: 'var(--primary)' }}>
                                {model.modelName}
                                {index === 0 && ' \u{1F451}'}
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--secondary)' }}>{model.count}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--secondary)' }}>
                                {formatProcessing(model.averageLatencyMs)}
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                <span style={{
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  background: model.successRate >= 0.95 ? 'rgba(34, 197, 94, 0.2)' : model.successRate >= 0.8 ? 'rgba(234, 179, 8, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                  color: model.successRate >= 0.95 ? '#22c55e' : model.successRate >= 0.8 ? '#eab308' : '#ef4444',
                                }}>
                                  {(model.successRate * 100).toFixed(0)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Productivity Metrics */}
                {analytics && analytics.productivity && (
                  <div style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--primary)', marginBottom: '10px' }}>
                      {t('analytics.productivityMetrics')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                      <div style={{ padding: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--primary)' }}>
                          {analytics.productivity.wordsPerMinute.average?.toFixed(0) || '--'}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '2px' }}>
                          {t('dashboard.avgWpm')}
                        </div>
                      </div>
                      <div style={{ padding: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--primary)' }}>
                          {formatProcessing(analytics.productivity.processingTimeMs.average)}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--secondary)', marginTop: '2px' }}>
                          {t('analytics.avgProcessing')}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {(!analytics || ((!analytics.sttModelRanking || analytics.sttModelRanking.length === 0) && (!analytics.enhancementModelRanking || analytics.enhancementModelRanking.length === 0))) && (
                  <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: 'var(--secondary)',
                    fontSize: '12px',
                  }}>
                    {t('analytics.noAnalyticsData')}
                  </div>
                )}
              </div>
            </Tabs.Content>

            {/* History Tab */}
            <Tabs.Content value="history">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '60vh', overflowY: 'auto' }}>
                {historyData.length === 0 ? (
                  <div style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'var(--secondary)',
                    fontSize: '12px',
                  }}>
                    {t('analytics.noRecordingsYet')}
                  </div>
                ) : (
                  historyData.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((item, index) => (
                    <div
                      key={`${item.id}-${index}`}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--secondary)' }}>
                          {formatDate(item.createdAt)}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: 'var(--secondary)' }}>
                            {formatDuration(item.duration)}
                          </span>
                          <button
                            style={{
                              padding: '2px 6px',
                              fontSize: '10px',
                              background: 'transparent',
                              color: 'var(--error, #ef4444)',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                            onClick={() => {
                              if (window.confirm(t('history.deleteConfirm'))) {
                                deleteRecordingMutation.mutate(item.id);
                              }
                            }}
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--primary)', lineHeight: '1.4', marginBottom: '8px' }}>
                        {item.transcript || t('analytics.noTranscription')}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {item.providerId && (
                          <span style={{ fontSize: '10px', color: 'var(--secondary)' }}>
                            {t('analytics.stt')}: {item.providerId}
                          </span>
                        )}
                        {(item.confidenceScore != null || item.accuracyScore != null) && (
                          <span style={{ fontSize: '10px', color: 'var(--secondary)' }}>
                            {t('analytics.confidence')}: {formatConfidence(item.confidenceScore ?? item.accuracyScore)}
                          </span>
                        )}
                        {item.fileSize && (
                          <span style={{ fontSize: '10px', color: 'var(--secondary)' }}>
                            {formatBytes(item.fileSize)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Tabs.Content>
          </Tabs.Root>

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
