import { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatBytes, formatChapterNumber, formatRelativeTime } from '../api/parse';
import { Banner, Button, Card, Chip, EmptyState, ProgressBar, SectionTitle } from '../components/ui';
import * as storage from '../lib/storage';
import { Screen, useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import { colors, spacing, type } from '../theme';
import type { DownloadJob } from '../types';

const ACTIVE: DownloadJob['status'][] = ['downloading', 'queued', 'paused'];

export function QueueScreen() {
  const { jobs, logs, actions } = useApp();
  const nav = useNav();
  const [message, setMessage] = useState<string | null>(null);
  const [freeSpace, setFreeSpace] = useState<number | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Paths } = require('expo-file-system') as typeof import('expo-file-system');
      setFreeSpace(Paths.availableDiskSpace);
    } catch {
      setFreeSpace(null);
    }
  }, [jobs.length]);

  const active = useMemo(() => jobs.filter((job) => ACTIVE.includes(job.status)), [jobs]);
  const finished = useMemo(
    () =>
      jobs.filter((job) => !ACTIVE.includes(job.status)).sort((a, b) => b.updatedAt - a.updatedAt),
    [jobs],
  );

  const totalPages = active.reduce((sum, job) => sum + Math.max(1, job.pagesTotal), 0);
  const donePages = active.reduce((sum, job) => sum + job.pagesDone, 0);
  const activeBytes = active.reduce((sum, job) => sum + job.bytes, 0);

  const handleExport = async (job: DownloadJob) => {
    try {
      if (!job.outputPath) throw new Error('Nothing saved for this chapter yet');
      if (job.format === 'images') {
        const files = await storage.listDir(job.outputPath);
        const saved = await storage.saveImagesToGallery(files.map((file) => file.path));
        setMessage(`Saved ${saved} page${saved === 1 ? '' : 's'} to your photo library.`);
        return;
      }
      await storage.exportFile(job.outputPath, {
        dialogTitle: `${job.mangaTitle} — chapter ${formatChapterNumber(job.chapterNumber)}`,
      });
      if (Platform.OS === 'web') setMessage('Download started — check your browser downloads.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Screen
      title="Downloads"
      subtitle={
        active.length > 0
          ? `${active.length} active · ${donePages}/${totalPages} pages · ${formatBytes(activeBytes)}`
          : `${finished.length} finished`
      }
      onBack={nav.back}
      right={
        finished.length > 0 ? (
          <Button label="Clear" size="sm" onPress={actions.clearFinishedJobs} />
        ) : undefined
      }
    >
      <ScrollView contentContainerStyle={styles.content}>
        {message ? (
          <Banner tone="info" onDismiss={() => setMessage(null)}>
            {message}
          </Banner>
        ) : null}

        {active.length === 0 ? (
          <EmptyState
            title="Queue is empty"
            body="Pick chapters from any manga and they will download here — several at once, resumable if you close the app."
          />
        ) : (
          <>
            <Card>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryValue}>
                  {Math.round((donePages / Math.max(1, totalPages)) * 100)}%
                </Text>
                <Text style={styles.summaryLabel}>
                  {donePages} of {totalPages} pages across {active.length} chapter
                  {active.length === 1 ? '' : 's'}
                </Text>
              </View>
              <ProgressBar value={donePages} total={totalPages} height={8} />
              <Text style={styles.summaryHint}>
                {formatBytes(activeBytes)} written
                {freeSpace ? ` · ${formatBytes(freeSpace)} free on device` : ''}
              </Text>
            </Card>

            {active.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onPause={() => actions.pauseJob(job.id)}
                onResume={() => actions.resumeJob(job.id)}
                onCancel={() => actions.cancelJob(job.id)}
                onRead={() =>
                  nav.push({ name: 'reader', mangaId: job.mangaId, chapterId: job.chapterId })
                }
              />
            ))}
          </>
        )}

        {finished.length > 0 ? <SectionTitle title="Finished" /> : null}
        {finished.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            onRetry={() => actions.retryJob(job.id)}
            onRemove={() => actions.removeJob(job.id)}
            onExport={() => handleExport(job)}
            onRead={() => nav.push({ name: 'reader', mangaId: job.mangaId, chapterId: job.chapterId })}
          />
        ))}

        {logs.length > 0 ? (
          <>
            <SectionTitle title="Activity" />
            <Card style={{ paddingVertical: spacing.sm }}>
              {logs.slice(0, 15).map((line, index) => (
                <Text key={`${index}-${line.slice(0, 12)}`} style={styles.logLine} numberOfLines={2}>
                  {line}
                </Text>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function JobCard({
  job,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  onExport,
  onRead,
}: {
  job: DownloadJob;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  onRemove?: () => void;
  onExport?: () => void;
  onRead?: () => void;
}) {
  const ratio = job.pagesDone / Math.max(1, job.pagesTotal);
  const tone =
    job.status === 'done'
      ? 'success'
      : job.status === 'error'
        ? 'error'
        : job.status === 'paused' || job.status === 'queued'
          ? 'warning'
          : 'accent';

  return (
    <Card style={styles.jobCard}>
      <View style={styles.jobHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.jobTitle} numberOfLines={1}>
            {job.mangaTitle}
          </Text>
          <Text style={styles.jobMeta} numberOfLines={1}>
            Chapter {formatChapterNumber(job.chapterNumber)} · {job.format.toUpperCase()} ·{' '}
            {formatRelativeTime(job.updatedAt)}
          </Text>
        </View>
        <Chip label={job.status.toUpperCase()} tone={tone} />
      </View>

      {job.status === 'downloading' || job.status === 'paused' ? (
        <View style={{ marginTop: spacing.md }}>
          <ProgressBar
            value={job.pagesDone}
            total={job.pagesTotal}
            color={job.status === 'paused' ? colors.warning : colors.accent}
          />
          <Text style={styles.jobProgress}>
            {job.pagesDone}/{job.pagesTotal} pages · {Math.round(ratio * 100)}% ·{' '}
            {formatBytes(job.bytes)}
          </Text>
        </View>
      ) : null}

      {job.status === 'error' && job.error ? (
        <Text style={styles.jobError} numberOfLines={3}>
          {job.error}
        </Text>
      ) : null}

      <View style={styles.jobActions}>
        {job.status === 'downloading' ? <Button label="Pause" size="sm" onPress={onPause} /> : null}
        {job.status === 'paused' || job.status === 'queued' ? (
          <Button label="Resume" size="sm" onPress={onResume} variant="primary" />
        ) : null}
        {job.status === 'error' || job.status === 'canceled' ? (
          <Button label="Retry" size="sm" onPress={onRetry} variant="primary" />
        ) : null}
        {job.status === 'done' ? (
          <>
            <Button
              label={job.format === 'images' ? 'Save to gallery' : 'Save file'}
              size="sm"
              variant="primary"
              onPress={onExport}
            />
            <Button label="Read" size="sm" onPress={onRead} />
          </>
        ) : null}
        {job.status === 'downloading' || job.status === 'queued' || job.status === 'paused' ? (
          <Button label="Cancel" size="sm" variant="danger" onPress={onCancel} />
        ) : (
          <Button label="Remove" size="sm" variant="ghost" onPress={onRemove} />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  summaryRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginBottom: 8 },
  summaryValue: { ...type.display, color: colors.accent, fontSize: 30 },
  summaryLabel: { ...type.small, color: colors.textDim, flex: 1 },
  summaryHint: { ...type.small, color: colors.textFaint, marginTop: spacing.sm, fontWeight: '400' },
  jobCard: { marginTop: spacing.md, gap: 2 },
  jobHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  jobTitle: { ...type.subtitle, color: colors.text, fontSize: 15 },
  jobMeta: { ...type.small, color: colors.textDim, fontWeight: '400', marginTop: 2 },
  jobProgress: { ...type.small, color: colors.textFaint, fontWeight: '400', marginTop: 6 },
  jobError: {
    ...type.small,
    color: colors.error,
    fontWeight: '400',
    marginTop: spacing.sm,
    lineHeight: 16,
  },
  jobActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  logLine: {
    ...type.small,
    color: colors.textFaint,
    fontWeight: '400',
    lineHeight: 17,
    marginBottom: 4,
  },
});
