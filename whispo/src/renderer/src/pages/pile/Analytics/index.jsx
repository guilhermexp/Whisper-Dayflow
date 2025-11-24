import styles from './Analytics.module.scss';
import { GaugeIcon, CrossIcon, ClockIcon } from 'renderer/icons';
import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { tipcClient } from 'renderer/lib/tipc-client';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

export default function Analytics() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [mainTab, setMainTab] = useState('analytics');

  // Handle URL params for opening dialog
  useEffect(() => {
    const dialog = searchParams.get('dialog');
    const tab = searchParams.get('tab');

    if (dialog === 'analytics') {
      setOpen(true);
      if (tab === 'history' || tab === 'analytics') {
        setMainTab(tab);
      }
      // Clear the URL params after opening
      searchParams.delete('dialog');
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <div className={styles.iconHolder}>
          <GaugeIcon className={styles.analyticsIcon} />
        </div>
      </Dialog.Trigger>
      <Dialog.Portal container={document.getElementById('dialog')}>
        <Dialog.Overlay className={styles.DialogOverlay} />
        <Dialog.Content className={styles.DialogContent} aria-describedby={undefined}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.wrapper}>
              <Dialog.Title className={styles.DialogTitle}>
                <span>{t('analytics.title')}</span>
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className={styles.close} aria-label="Close">
                  <CrossIcon style={{ height: 14, width: 14 }} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Main Content */}
          <div className={styles.mainContent}>
            <Tabs.Root value={mainTab} onValueChange={setMainTab}>
              <Tabs.List className={styles.TabsList}>
                <Tabs.Trigger
                  value="analytics"
                  className={styles.TabTrigger}
                >
                  <GaugeIcon style={{ height: '16px', width: '16px' }} />
                  {t('analytics.title')}
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="history"
                  className={styles.TabTrigger}
                >
                  <ClockIcon style={{ height: '16px', width: '16px' }} />
                  {t('navigation.history')}
                </Tabs.Trigger>
              </Tabs.List>

              {/* Analytics Tab */}
              <Tabs.Content value="analytics">
                <div className={styles.Container}>
                  {/* Stats Cards */}
                  <div className={styles.Grid3}>
                    <div className={styles.Card}>
                      <div className={styles.StatValue}>
                        {historyData.length.toLocaleString()}
                      </div>
                      <div className={styles.StatLabel}>
                        {t('dashboard.totalRecordings')}
                      </div>
                    </div>
                    <div className={styles.Card}>
                      <div className={styles.StatValue}>
                        {formatBytes(totalSize)}
                      </div>
                      <div className={styles.StatLabel}>
                        {t('analytics.storageUsed')}
                      </div>
                    </div>
                    <div className={styles.Card}>
                      <div className={styles.StatValue}>
                        {formatDurationLong(totalDuration)}
                      </div>
                      <div className={styles.StatLabel}>
                        {t('dashboard.totalDuration')}
                      </div>
                    </div>
                  </div>

                  {/* Delete All */}
                  <div className={`${styles.Card} ${styles.AlignLeft}`}>
                    <div className={styles.SectionHeader}>
                      <div>
                        <div className={styles.SectionTitle}>{t('analytics.recordingHistory')}</div>
                        <div className={styles.SectionSubLabel}>
                          {t('analytics.recordingsStoredLocally', { count: historyData.length })}
                        </div>
                      </div>
                      <button
                        className={styles.DeleteBtn}
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
                    <div className={`${styles.Card} ${styles.AlignLeft}`}>
                      <div className={styles.SectionTitle}>
                        {t('analytics.sttModelPerformance')}
                      </div>
                      <div className={styles.TableContainer}>
                        <table className={styles.Table}>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>{t('analytics.model')}</th>
                              <th>{t('analytics.uses')}</th>
                              <th>{t('analytics.avg')}</th>
                              <th>{t('analytics.success')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analytics.sttModelRanking.slice(0, 5).map((model, index) => (
                              <tr key={model.modelId}>
                                <td>{index + 1}</td>
                                <td style={{ color: 'var(--primary)' }}>
                                  {model.modelName}
                                  {index === 0 && ' \u{1F451}'}
                                </td>
                                <td>{model.count}</td>
                                <td>
                                  {formatProcessing(model.averageLatencyMs)}
                                </td>
                                <td>
                                  <span
                                    className={styles.SuccessRate}
                                    style={{
                                      background: model.successRate >= 0.95 ? 'rgba(34, 197, 94, 0.2)' : model.successRate >= 0.8 ? 'rgba(234, 179, 8, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                      color: model.successRate >= 0.95 ? '#22c55e' : model.successRate >= 0.8 ? '#eab308' : '#ef4444',
                                    }}
                                  >
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
                    <div className={`${styles.Card} ${styles.AlignLeft}`}>
                      <div className={styles.SectionTitle}>
                        {t('analytics.productivityMetrics')}
                      </div>
                      <div className={styles.Grid2}>
                        <div style={{ padding: '8px', textAlign: 'center' }}>
                          <div className={styles.StatValue} style={{ fontSize: '16px' }}>
                            {analytics.productivity.wordsPerMinute.average?.toFixed(0) || '--'}
                          </div>
                          <div className={styles.StatLabel}>
                            {t('dashboard.avgWpm')}
                          </div>
                        </div>
                        <div style={{ padding: '8px', textAlign: 'center' }}>
                          <div className={styles.StatValue} style={{ fontSize: '16px' }}>
                            {formatProcessing(analytics.productivity.processingTimeMs.average)}
                          </div>
                          <div className={styles.StatLabel}>
                            {t('analytics.avgProcessing')}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(!analytics || ((!analytics.sttModelRanking || analytics.sttModelRanking.length === 0) && (!analytics.enhancementModelRanking || analytics.enhancementModelRanking.length === 0))) && (
                    <div className={styles.EmptyState}>
                      {t('analytics.noAnalyticsData')}
                    </div>
                  )}
                </div>
              </Tabs.Content>

              {/* History Tab */}
              <Tabs.Content value="history">
                <div className={styles.HistoryList}>
                  {historyData.length === 0 ? (
                    <div className={styles.EmptyState}>
                      {t('analytics.noRecordingsYet')}
                    </div>
                  ) : (
                    historyData.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((item, index) => (
                      <div
                        key={`${item.id}-${index}`}
                        className={styles.HistoryItem}
                      >
                        <div className={styles.HistoryHeader}>
                          <div className={styles.HistoryDate}>
                            {formatDate(item.createdAt)}
                          </div>
                          <div className={styles.HistoryActions}>
                            <span className={styles.HistoryDuration}>
                              {formatDuration(item.duration)}
                            </span>
                            <button
                              className={styles.DeleteIconBtn}
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
                        <div className={styles.HistoryTranscript}>
                          {item.transcript || t('analytics.noTranscription')}
                        </div>
                        <div className={styles.HistoryMeta}>
                          {item.providerId && (
                            <span className={styles.MetaItem}>
                              {t('analytics.stt')}: {item.providerId}
                            </span>
                          )}
                          {(item.confidenceScore != null || item.accuracyScore != null) && (
                            <span className={styles.MetaItem}>
                              {t('analytics.confidence')}: {formatConfidence(item.confidenceScore ?? item.accuracyScore)}
                            </span>
                          )}
                          {item.fileSize && (
                            <span className={styles.MetaItem}>
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
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
