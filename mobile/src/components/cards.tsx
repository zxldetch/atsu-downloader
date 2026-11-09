/**
 * Memoised list building blocks, styled after the atsu.moe app.
 *
 * Two things matter here beyond looks: every component is wrapped in
 * `React.memo` and takes *stable* callbacks that receive an id (not a fresh
 * closure per row), so a download progressing in the background cannot churn a
 * two-hundred-row chapter list.
 */

import { Image } from 'expo-image';
import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  chapterLabel,
  formatBytes,
  formatEta,
  formatRelativeTime,
  formatSpeed,
} from '../api/parse';
import type { Chapter, DownloadJob, LibraryEntry } from '../types';
import { colors, coverAspect, radius, spacing, type, makeStyles } from '../theme';
import { Icon, type IconName } from './icons';
import { ProgressBar } from './ui';

const coverProps = {
  contentFit: 'cover' as const,
  cachePolicy: 'memory-disk' as const,
  transition: 140,
};

/** The little pills atsu pins to the corners of a cover. */
function CoverBadge({
  text,
  tone = 'dark',
  align = 'left',
}: {
  text: string;
  tone?: 'dark' | 'accent' | 'gold' | 'blue';
  align?: 'left' | 'right';
}) {
  const tones = {
    dark: { bg: 'rgba(0,0,0,0.78)', fg: colors.text },
    accent: { bg: colors.accent, fg: colors.onAccent },
    gold: { bg: colors.gold, fg: colors.goldText },
    blue: { bg: colors.blue, fg: colors.text },
  }[tone];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: tones.bg },
        align === 'right' ? { right: 6 } : { left: 6 },
      ]}
    >
      <Text style={[styles.badgeText, { color: tones.fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/**
 * "Continue Reading" row: square thumbnail, title, then one grey meta line with
 * the chapter, percentage and how long ago — atsu's exact layout.
 */
export const ContinueRow = memo(function ContinueRow({
  mangaId,
  title,
  coverUrl,
  label,
  time,
  progress,
  onPress,
}: {
  mangaId: string;
  title: string;
  coverUrl: string;
  label: string;
  time: string;
  progress?: { value: number; total: number };
  onPress: (mangaId: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(mangaId)}
      style={({ pressed }) => [styles.continueRow, pressed && { backgroundColor: colors.input }]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Image
        source={{ uri: coverUrl }}
        style={styles.continueCover}
        recyclingKey={mangaId}
        {...coverProps}
      />
      <View style={styles.continueBody}>
        <Text style={styles.continueTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.continueMeta} numberOfLines={1}>
          {label}
          {time ? `  ·  ${time}` : ''}
        </Text>
        {progress ? (
          <View style={{ marginTop: 8 }}>
            <ProgressBar value={progress.value} total={progress.total} height={3} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

/** Grid tile for the shelf / search results, with atsu's corner badges. */
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
  const lastActivity = reading?.updatedAt ?? entry.addedAt;
  const progress = reading
    ? `Ch. ${chapterNumberFromId(reading.chapterId)} · ${Math.round(
        (reading.page / Math.max(1, reading.total)) * 100,
      )}%`
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
      <View>
        <Image
          source={{ uri: entry.coverUrl }}
          style={[styles.cover, { width, height: width / coverAspect }]}
          recyclingKey={entry.mangaId}
          {...coverProps}
        />
        <CoverBadge text={String(entry.chapterCount)} />
        {downloaded > 0 ? (
          <CoverBadge text={`${downloaded} offline`} tone="accent" align="right" />
        ) : null}
      </View>
      <Text style={styles.gridTitle} numberOfLines={2}>
        {entry.title}
      </Text>
      <Text style={styles.gridChapter} numberOfLines={1}>
        {progress}
      </Text>
      <Text style={styles.gridMeta} numberOfLines={1}>
        {formatRelativeTime(lastActivity)}
      </Text>
    </Pressable>
  );
});

/** Compact row used by search results. */
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
        <Text style={styles.rowChapter} numberOfLines={1}>
          {reading ? `Ch. ${chapterNumberFromId(reading.chapterId)} · ` : ''}
          {downloaded} offline
          {bytes > 0 ? ` · ${formatBytes(bytes)}` : ''}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {formatRelativeTime(reading?.updatedAt ?? entry.addedAt)}
        </Text>
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
  groupLabel,
  onToggle,
  onRead,
}: {
  chapter: Chapter;
  selected: boolean;
  status: string | null;
  saved: boolean;
  /** Shown only in the "all groups" view, where numbers repeat. */
  groupLabel?: string | null;
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
        {selected ? <Icon name="checkmark" size={14} color={colors.onAccent} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.chapterTitle} numberOfLines={1}>
          {chapterLabel(chapter)}
        </Text>
        <Text style={styles.chapterMeta} numberOfLines={1}>
          {status ?? `${chapter.pageCount} pages`}
          {saved ? '  ·  offline' : ''}
          {groupLabel ? `  ·  ${groupLabel}` : ''}
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
          <Icon name="play" size={14} color={colors.onAccent} />
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
  downloading: colors.accentText,
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
          <View style={{ marginTop: 8 }}>
            <ProgressBar value={job.pagesDone} total={Math.max(1, job.pagesTotal)} height={3} />
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
          {job.status === 'downloading' && formatSpeed(job.pagesPerSecond) ? (
            <Text style={styles.jobStatusDetail}>· {formatSpeed(job.pagesPerSecond)}</Text>
          ) : null}
          {job.status === 'downloading' && formatEta(job.etaSeconds) ? (
            <Text style={styles.jobStatusDetail}>· {formatEta(job.etaSeconds)}</Text>
          ) : null}
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

const styles = makeStyles((colors) => ({
  badge: {
    position: 'absolute',
    top: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
    maxWidth: 110,
  },
  badgeText: { ...type.tiny, fontWeight: '700', fontSize: 11 },

  cover: { borderRadius: radius.sm, backgroundColor: colors.input },

  continueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    marginBottom: spacing.sm,
  },
  continueCover: {
    width: 96,
    height: 96,
    borderRadius: radius.sm,
    backgroundColor: colors.input,
  },
  continueBody: { flex: 1, paddingRight: spacing.xs },
  continueTitle: { ...type.title, color: colors.text, fontSize: 19 },
  continueMeta: {
    ...type.small,
    color: colors.textDim,
    fontWeight: '400',
    fontSize: 14,
    marginTop: 5,
  },

  gridTitle: {
    ...type.subtitle,
    color: colors.text,
    fontSize: 15,
    marginTop: spacing.sm,
    lineHeight: 19,
  },
  gridChapter: { ...type.tiny, color: colors.accentText, fontWeight: '600', marginTop: 4 },
  gridMeta: { ...type.tiny, color: colors.textDim, fontWeight: '500', marginTop: 3 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  rowCover: { width: 52, height: 72, borderRadius: radius.xs, backgroundColor: colors.input },
  rowBody: { flex: 1 },
  rowTitle: { ...type.subtitle, color: colors.text, fontSize: 15 },
  rowChapter: { ...type.tiny, color: colors.accentText, fontWeight: '600', marginTop: 3 },
  rowMeta: { ...type.tiny, color: colors.textDim, fontWeight: '400', marginTop: 2 },

  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    minHeight: 60,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chapterTitle: { ...type.body, color: colors.textDim, fontWeight: '500', fontSize: 15 },
  chapterMeta: { ...type.tiny, color: colors.textFaint, fontWeight: '500', marginTop: 3 },
  readButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  jobRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'flex-start',
  },
  jobCover: { width: 42, height: 56, borderRadius: radius.xs, backgroundColor: colors.input },
  jobTitle: { ...type.small, color: colors.text, fontWeight: '600', fontSize: 14 },
  jobMeta: { ...type.tiny, color: colors.textDim, fontWeight: '400', marginTop: 3 },
  jobError: { ...type.tiny, color: colors.error, fontWeight: '500', marginTop: 4 },
  jobStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  jobStatus: { ...type.tiny, fontWeight: '700', fontSize: 10, letterSpacing: 0.3 },
  jobStatusDetail: { ...type.tiny, color: colors.textFaint, fontSize: 10, fontWeight: '500' },
  jobActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  jobAction: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.input,
  },
}));
