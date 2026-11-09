/**
 * Memoised list building blocks.
 *
 * Every one of these is wrapped in `React.memo` and takes its handlers from the
 * parent as *stable* callbacks that receive an id, rather than a fresh closure
 * per row. That is what lets a download progressing in the background update
 * without re-rendering a two-hundred-row chapter list.
 */

import { Image } from 'expo-image';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { chapterLabel, formatBytes } from '../api/parse';
import type { Chapter, DownloadJob, LibraryEntry } from '../types';
import { colors, coverAspect, radius, spacing, type } from '../theme';
import { Icon, type IconName } from './icons';
import { ProgressBar } from './ui';

const coverProps = {
  contentFit: 'cover' as const,
  cachePolicy: 'memory-disk' as const,
  transition: 140,
};

/** Big cover in a horizontal rail ("Jump back in"). */
export const RailCard = memo(function RailCard({
  mangaId,
  title,
  coverUrl,
  meta,
  progress,
  width,
  onPress,
}: {
  mangaId: string;
  title: string;
  coverUrl: string;
  meta: string;
  progress?: { value: number; total: number };
  width: number;
  onPress: (mangaId: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(mangaId)}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.8 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Image
        source={{ uri: coverUrl }}
        style={[styles.cover, { width, height: width / coverAspect }]}
        recyclingKey={mangaId}
        {...coverProps}
      />
      <Text style={styles.railTitle} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.railMeta} numberOfLines={1}>
        {meta}
      </Text>
      {progress ? (
        <View style={{ marginTop: 6 }}>
          <ProgressBar value={progress.value} total={progress.total} height={2} />
        </View>
      ) : null}
    </Pressable>
  );
});

/** Grid tile for the shelf / search results. */
export const SeriesCard = memo(function SeriesCard({
  entry,
  width,
  onPress,
  onLongPress,
}: {
  entry: LibraryEntry;
  width: number;
  onPress: (mangaId: string) => void;
  onLongPress?: (mangaId: string) => void;
}) {
  const downloaded = Object.keys(entry.chapters).length;
  const reading = entry.reading;
  const subtitle = reading
    ? `Ch. ${chapterNumberFromId(reading.chapterId)} · ${Math.round(
        (reading.page / Math.max(1, reading.total)) * 100,
      )}%`
    : downloaded > 0
      ? `${downloaded} offline`
      : `${entry.chapterCount} chapters`;

  return (
    <Pressable
      onPress={() => onPress(entry.mangaId)}
      onLongPress={onLongPress ? () => onLongPress(entry.mangaId) : undefined}
      delayLongPress={350}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.82 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={entry.title}
    >
      <Image
        source={{ uri: entry.coverUrl }}
        style={[styles.cover, { width, height: width / coverAspect }]}
        recyclingKey={entry.mangaId}
        {...coverProps}
      />
      <Text style={styles.gridTitle} numberOfLines={1}>
        {entry.title}
      </Text>
      <Text style={styles.gridMeta} numberOfLines={1}>
        {subtitle}
      </Text>
      {reading ? (
        <View style={{ marginTop: 5 }}>
          <ProgressBar value={reading.page} total={Math.max(1, reading.total)} height={2} />
        </View>
      ) : null}
    </Pressable>
  );
});

/** Square thumbnail row used in the shelf list layout and the queue. */
export const LibraryRow = memo(function LibraryRow({
  entry,
  onPress,
}: {
  entry: LibraryEntry;
  onPress: (mangaId: string) => void;
}) {
  const downloaded = Object.keys(entry.chapters).length;
  const bytes = Object.values(entry.chapters).reduce((sum, chapter) => sum + chapter.bytes, 0);
  const reading = entry.reading;

  return (
    <Pressable
      onPress={() => onPress(entry.mangaId)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]}
      accessibilityRole="button"
      accessibilityLabel={entry.title}
    >
      <Image
        source={{ uri: entry.coverUrl }}
        style={styles.rowCover}
        recyclingKey={entry.mangaId}
        {...coverProps}
      />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {reading ? `Chapter ${chapterNumberFromId(reading.chapterId)} · ` : ''}
          {downloaded} offline
          {bytes > 0 ? ` · ${formatBytes(bytes)}` : ''}
        </Text>
        {reading ? (
          <View style={{ marginTop: 7 }}>
            <ProgressBar value={reading.page} total={Math.max(1, reading.total)} height={2} />
          </View>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={16} color={colors.textFaint} />
    </Pressable>
  );
});

/** A chapter row on the series screen. */
export const ChapterRow = memo(function ChapterRow({
  chapter,
  selected,
  status,
  saved,
  onToggle,
  onRead,
}: {
  chapter: Chapter;
  selected: boolean;
  status: string | null;
  saved: boolean;
  onToggle: (chapterId: string) => void;
  onRead: (chapterId: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onToggle(chapter.id)}
      style={({ pressed }) => [styles.chapterRow, pressed && { backgroundColor: colors.card }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={chapterLabel(chapter)}
    >
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected ? <Icon name="checkmark" size={13} color={colors.onAccent} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.chapterTitle, selected && { color: colors.text }]} numberOfLines={1}>
          {chapterLabel(chapter)}
        </Text>
        <Text style={styles.chapterMeta} numberOfLines={1}>
          {status ?? `${chapter.pageCount} pages`}
        </Text>
      </View>
      {saved ? (
        <Pressable
          onPress={() => onRead(chapter.id)}
          hitSlop={10}
          style={({ pressed }) => [styles.readButton, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={`Read ${chapterLabel(chapter)}`}
        >
          <Icon name="play" size={13} color={colors.accent} />
        </Pressable>
      ) : null}
    </Pressable>
  );
});

const STATUS_LABEL: Record<DownloadJob['status'], string> = {
  queued: 'Queued',
  downloading: 'Downloading',
  paused: 'Paused',
  done: 'Saved',
  error: 'Failed',
  canceled: 'Canceled',
};

const STATUS_ICON: Record<DownloadJob['status'], IconName> = {
  queued: 'time-outline',
  downloading: 'arrow-down-circle',
  paused: 'pause-circle-outline',
  done: 'checkmark-circle',
  error: 'alert-circle',
  canceled: 'close-circle-outline',
};

const STATUS_COLOR: Record<DownloadJob['status'], string> = {
  queued: colors.textDim,
  downloading: colors.accent,
  paused: colors.warning,
  done: colors.success,
  error: colors.error,
  canceled: colors.textFaint,
};

/** One row in the download queue. */
export const JobRow = memo(function JobRow({
  job,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  onExport,
}: {
  job: DownloadJob;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onExport?: (id: string) => void;
}) {
  const color = STATUS_COLOR[job.status];
  const active = job.status === 'downloading' || job.status === 'queued';
  const percent = job.pagesTotal
    ? Math.round((job.pagesDone / Math.max(1, job.pagesTotal)) * 100)
    : 0;

  return (
    <View style={styles.jobRow}>
      <Image
        source={{ uri: job.coverUrl }}
        style={styles.jobCover}
        recyclingKey={job.mangaId + job.chapterId}
        {...coverProps}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.jobTitle} numberOfLines={1}>
          {job.mangaTitle}
        </Text>
        <Text style={styles.jobMeta} numberOfLines={1}>
          Ch. {job.chapterNumber} · {job.format.toUpperCase()}
          {job.status === 'downloading' && job.pagesTotal > 0
            ? ` · ${job.pagesDone}/${job.pagesTotal} (${percent}%)`
            : ''}
          {job.status === 'done' && job.bytes > 0 ? ` · ${formatBytes(job.bytes)}` : ''}
        </Text>
        {job.status === 'downloading' ? (
          <View style={{ marginTop: 7 }}>
            <ProgressBar value={job.pagesDone} total={Math.max(1, job.pagesTotal)} height={2} />
          </View>
        ) : null}
        {job.error ? (
          <Text style={styles.jobError} numberOfLines={2}>
            {job.error}
          </Text>
        ) : null}
        <View style={styles.jobStatusRow}>
          <Icon name={STATUS_ICON[job.status]} size={12} color={color} />
          <Text style={[styles.jobStatus, { color }]}>{STATUS_LABEL[job.status]}</Text>
        </View>
      </View>
      <View style={styles.jobActions}>
        {job.status === 'downloading' || job.status === 'queued' ? (
          <Pressable
            onPress={() => onPause(job.id)}
            hitSlop={8}
            accessibilityLabel="Pause download"
            style={styles.jobAction}
          >
            <Icon name="pause" size={15} color={colors.text} />
          </Pressable>
        ) : null}
        {job.status === 'paused' ? (
          <Pressable
            onPress={() => onResume(job.id)}
            hitSlop={8}
            accessibilityLabel="Resume download"
            style={styles.jobAction}
          >
            <Icon name="play" size={15} color={colors.text} />
          </Pressable>
        ) : null}
        {job.status === 'error' || job.status === 'canceled' ? (
          <>
            <Pressable
              onPress={() => onRetry(job.id)}
              hitSlop={8}
              accessibilityLabel="Retry download"
              style={styles.jobAction}
            >
              <Icon name="refresh" size={15} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={() => onRemove(job.id)}
              hitSlop={8}
              accessibilityLabel="Remove from queue"
              style={styles.jobAction}
            >
              <Icon name="trash-outline" size={15} color={colors.textDim} />
            </Pressable>
          </>
        ) : null}
        {active ? (
          <Pressable
            onPress={() => onCancel(job.id)}
            hitSlop={8}
            accessibilityLabel="Cancel download"
            style={styles.jobAction}
          >
            <Icon name="close" size={15} color={colors.textDim} />
          </Pressable>
        ) : null}
        {job.status === 'done' && onExport ? (
          <Pressable
            onPress={() => onExport(job.id)}
            hitSlop={8}
            accessibilityLabel="Save file"
            style={styles.jobAction}
          >
            <Icon name="share-outline" size={15} color={colors.text} />
          </Pressable>
        ) : null}
        {job.status === 'done' ? (
          <Pressable
            onPress={() => onRemove(job.id)}
            hitSlop={8}
            accessibilityLabel="Clear from queue"
            style={styles.jobAction}
          >
            <Icon name="close" size={15} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

/** `demo-lantern-ch-3` → "3", falling back to the raw id. */
function chapterNumberFromId(chapterId: string): string {
  const digits = chapterId.match(/(?:ch|chapter)[-_]?([\d.]+)/i);
  return digits ? digits[1] : chapterId.replace(/^.*-/, '');
}

const styles = StyleSheet.create({
  cover: { borderRadius: radius.md, backgroundColor: colors.input },
  railTitle: {
    ...type.small,
    color: colors.text,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  railMeta: { ...type.tiny, color: colors.textFaint, fontWeight: '500', marginTop: 2 },
  gridTitle: { ...type.small, color: colors.text, fontWeight: '600', marginTop: spacing.sm },
  gridMeta: { ...type.tiny, color: colors.textFaint, fontWeight: '500', marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  rowCover: { width: 46, height: 64, borderRadius: radius.sm, backgroundColor: colors.input },
  rowBody: { flex: 1 },
  rowTitle: { ...type.subtitle, color: colors.text, fontSize: 14 },
  rowMeta: { ...type.tiny, color: colors.textFaint, fontWeight: '500', marginTop: 3 },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    minHeight: 58,
  },
  check: {
    width: 21,
    height: 21,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chapterTitle: { ...type.body, color: colors.textDim, fontWeight: '500' },
  chapterMeta: { ...type.tiny, color: colors.textFaint, fontWeight: '500', marginTop: 2 },
  readButton: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'flex-start',
  },
  jobCover: { width: 38, height: 52, borderRadius: radius.xs, backgroundColor: colors.input },
  jobTitle: { ...type.small, color: colors.text, fontWeight: '600' },
  jobMeta: { ...type.tiny, color: colors.textDim, fontWeight: '500', marginTop: 2 },
  jobError: { ...type.tiny, color: colors.error, fontWeight: '500', marginTop: 4 },
  jobStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  jobStatus: { ...type.tiny, fontWeight: '700', fontSize: 10, letterSpacing: 0.3 },
  jobActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  jobAction: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
});
