/**
 * dsh-shadow-billing — 会话日志折叠器（DSH-032）。
 *
 * 把 DSH 会话日志（多帧 zstd JSONL）折叠成 usage_requests 行：
 * - zstd 分帧按帧头精确切分，尾部残缺帧（活跃写入中）整体跳过；
 * - 字节级增量：从水位 last_offset 续读，另以 seq 过滤兜底防重复；
 * - usage 数据源：本机实测 usage 上报在 `assistant/chunk` 的 usage 类型块
 *   （inputTokens / outputTokens / cacheReadTokens），按 (turn, step) 聚合、
 *   取该 step 最后一次上报（流式可能多次累计上报）；
 * - 模型名从 request/header（data.header.config.model）或
 *   request/context（data.model）恢复。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { dayOf } from './store.js';
import { priceTokens, resolveModel } from './pricing.js';
const ZSTD_MAGIC = 0xfd2fb528;
const SKIPPABLE_MAGIC_MIN = 0x184d2a50;
const SKIPPABLE_MAGIC_MAX = 0x184d2a5f;
/** 按帧头精确切分 zstd 多帧文件；尾部不完整帧被丢弃。 */
export function splitZstdFrames(buf) {
    const frames = [];
    let off = 0;
    while (off + 4 <= buf.length) {
        const magic = buf.readUInt32LE(off);
        if (magic >= SKIPPABLE_MAGIC_MIN && magic <= SKIPPABLE_MAGIC_MAX) {
            if (off + 8 > buf.length)
                break;
            const size = buf.readUInt32LE(off + 4);
            if (off + 8 + size > buf.length)
                break;
            off += 8 + size;
            continue;
        }
        if (magic !== ZSTD_MAGIC)
            break;
        let pos = off + 4;
        if (pos >= buf.length)
            break;
        const descriptor = buf.readUInt8(pos);
        pos += 1;
        const fcsFlag = descriptor >> 6;
        const singleSegment = (descriptor >> 5) & 1;
        const checksumFlag = (descriptor >> 2) & 1;
        const didFlag = descriptor & 3;
        if (!singleSegment)
            pos += 1;
        pos += [0, 1, 2, 4][didFlag];
        const fcsBytes = fcsFlag === 0 ? (singleSegment ? 1 : 0) : (1 << fcsFlag);
        pos += fcsBytes;
        if (pos > buf.length)
            break;
        let ok = true;
        for (;;) {
            if (pos + 3 > buf.length) {
                ok = false;
                break;
            }
            const header = buf.readUIntLE(pos, 3);
            pos += 3;
            const lastBlock = header & 1;
            const blockType = (header >> 1) & 3;
            const blockSize = header >> 3;
            if (blockType === 3) {
                ok = false;
                break;
            }
            pos += blockType === 1 ? 1 : blockSize;
            if (pos > buf.length) {
                ok = false;
                break;
            }
            if (lastBlock)
                break;
        }
        if (!ok)
            break;
        if (checksumFlag) {
            if (pos + 4 > buf.length)
                break;
            pos += 4;
        }
        frames.push(buf.subarray(off, pos));
        off = pos;
    }
    return frames;
}
/** 逐行解析一个会话日志文件（从 startOffset 字节处续读）。 */
export function readSessionLog(filePath, startOffset = 0) {
    const buf = fs.readFileSync(filePath);
    const frames = splitZstdFrames(buf.subarray(startOffset));
    let header = null;
    const events = [];
    let consumed = 0;
    for (const frame of frames) {
        let text;
        try {
            text = zlib.zstdDecompressSync(frame).toString('utf8');
        }
        catch {
            break;
        }
        consumed += frame.length;
        for (const line of text.split('\n')) {
            if (!line)
                continue;
            let row;
            try {
                row = JSON.parse(line);
            }
            catch {
                continue;
            }
            if (row === null || typeof row !== 'object')
                continue;
            if (row.type === 'session' && typeof row.id === 'string') {
                header = { id: row.id, title: typeof row.title === 'string' ? row.title : undefined };
                continue;
            }
            events.push(row);
        }
    }
    return { header, events, nextOffset: startOffset + consumed };
}
/** 只读首帧拿会话 header（frame 0 极小，不随日志增长）。 */
function readHeader(filePath) {
    try {
        const buf = fs.readFileSync(filePath);
        const frames = splitZstdFrames(buf.subarray(0, 262144));
        const firstFrame = frames[0];
        if (firstFrame === undefined)
            return null;
        const firstLine = zlib.zstdDecompressSync(firstFrame).toString('utf8').split('\n')[0] ?? '';
        const row = JSON.parse(firstLine);
        if (row.type === 'session' && typeof row.id === 'string') {
            return { id: row.id, title: typeof row.title === 'string' ? row.title : undefined };
        }
        return null;
    }
    catch {
        return null;
    }
}
/** 折叠一个会话日志文件。 */
export function foldSessionFile(store, pricing, filePath, _logger) {
    let stat;
    try {
        stat = fs.statSync(filePath);
    }
    catch {
        return { imported: 0, repaired: 0, skipped: 0, sessionId: null, skippedUnchanged: false, error: 'no-file' };
    }
    const mtimeMs = Math.round(stat.mtimeMs);
    const header = readHeader(filePath);
    if (header === null) {
        return { imported: 0, repaired: 0, skipped: 0, sessionId: null, skippedUnchanged: false, error: 'no-header' };
    }
    const sessionId = header.id;
    const watermark = store.getWatermark(sessionId);
    const hasUnknownUsage = store.hasUnknownUsage(sessionId);
    if (watermark !== null && mtimeMs <= watermark.fileMtimeMs && !hasUnknownUsage) {
        return { imported: 0, repaired: 0, skipped: 0, sessionId, skippedUnchanged: true };
    }
    const lastSeq = watermark === null ? -1 : watermark.lastSeq;
    let startOffset = watermark === null ? 0 : (watermark.lastOffset || 0);
    let route = watermark?.routeModel === null || watermark?.routeModel === undefined
        ? null
        : { provider: watermark.routeProvider ?? '', model: watermark.routeModel };
    // Old watermarks did not retain the request route. Replay once to recover it
    // and to repair already-persisted unknown rows; future folds remain byte-incremental.
    if (startOffset > 0 && (route === null || route.model === 'unknown' || hasUnknownUsage)) {
        startOffset = 0;
        route = null;
    }
    const { events, nextOffset } = readSessionLog(filePath, startOffset);
    let title = watermark?.title ?? null;
    let maxSeq = lastSeq;
    const usageByStep = new Map();
    const stepKeyOf = (turn, step) => `${turn}:${step}`;
    for (const event of events) {
        const seq = typeof event.seq === 'number' ? event.seq : (typeof event.seq0 === 'number' ? event.seq0 : null);
        if (seq !== null && seq > maxSeq)
            maxSeq = seq;
        switch (event.type) {
            case 'request/header': {
                const headerData = event.data?.header;
                const cfg = headerData?.config;
                if (cfg !== undefined && (cfg.provider !== undefined || cfg.model !== undefined)) {
                    route = { provider: cfg.provider ?? '', model: cfg.model ?? 'unknown' };
                }
                break;
            }
            case 'request/context': {
                const d = event.data;
                if (d !== undefined && (d.provider !== undefined || d.model !== undefined)) {
                    route = { provider: d.provider ?? '', model: d.model ?? 'unknown' };
                }
                break;
            }
            case 'session/title': {
                const d = event.data;
                if (d?.title)
                    title = d.title;
                break;
            }
            case 'assistant/chunk': {
                const d = event.data;
                const chunk = d?.chunk;
                if (chunk?.type !== 'usage' || typeof d?.turn !== 'number' || typeof d?.step !== 'number')
                    break;
                const usage = chunk.usage;
                if (usage === undefined)
                    break;
                const input = usage.inputTokens ?? 0;
                const output = usage.outputTokens ?? 0;
                const cacheRead = usage.cacheReadTokens ?? 0;
                const cacheWrite = usage.cacheWriteTokens ?? 0;
                const key = stepKeyOf(d.turn, d.step);
                const prev = usageByStep.get(key);
                // 同 step 多次上报取最后一次（seq 更大者）。
                if (prev === undefined || seq === null || seq >= prev.seq) {
                    usageByStep.set(key, {
                        seq: seq ?? prev?.seq ?? -1,
                        time: typeof event.time === 'number' ? event.time : Date.now(),
                        turn: d.turn,
                        step: d.step,
                        inputTokens: input,
                        outputTokens: output,
                        cacheReadTokens: cacheRead,
                        cacheWriteTokens: cacheWrite,
                        model: route?.model ?? 'unknown',
                    });
                }
                break;
            }
            default:
                break;
        }
    }
    let imported = 0;
    let repaired = 0;
    let skipped = 0;
    for (const usage of usageByStep.values()) {
        if (usage.inputTokens === 0 && usage.outputTokens === 0
            && usage.cacheReadTokens === 0 && usage.cacheWriteTokens === 0)
            continue;
        const model = usage.model;
        const breakdown = priceTokens(usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.time, model, pricing);
        const costNano = Math.round(breakdown.cost * 1e9);
        const recordId = `${sessionId}:${usage.turn}:${usage.step}`;
        const normalizedModel = resolveModel(model, pricing);
        if (usage.seq <= lastSeq) {
            if (store.repairUnknownUsage(recordId, normalizedModel, costNano))
                repaired += 1;
            continue;
        }
        const inserted = store.insertUsage({
            recordId,
            sessionId,
            model: normalizedModel,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cacheReadTokens: usage.cacheReadTokens,
            cacheWriteTokens: usage.cacheWriteTokens,
            costNano,
            day: dayOf(usage.time),
            createdAt: usage.time,
        });
        if (inserted)
            imported += 1;
        else
            skipped += 1;
    }
    store.putWatermark({
        sessionId,
        logPath: filePath,
        lastSeq: maxSeq,
        fileMtimeMs: mtimeMs,
        title,
        lastOffset: nextOffset,
        routeProvider: route?.provider ?? null,
        routeModel: route?.model ?? null,
        updatedAt: Date.now(),
    });
    return { imported, repaired, skipped, sessionId, skippedUnchanged: false };
}
/** 扫描全部会话日志并折叠。返回聚合结果。 */
export function foldAllSessions(store, pricing, sessionsRoot, logger) {
    const result = { scanned: 0, imported: 0, repaired: 0, skipped: 0, errors: [] };
    let projectDirs;
    try {
        projectDirs = fs.readdirSync(sessionsRoot);
    }
    catch {
        return result;
    }
    for (const projectDir of projectDirs) {
        if (projectDir.startsWith('.'))
            continue;
        const projectPath = path.join(sessionsRoot, projectDir);
        let sessionDirs;
        try {
            sessionDirs = fs.readdirSync(projectPath);
        }
        catch {
            continue;
        }
        for (const sessionDir of sessionDirs) {
            const logPath = path.join(projectPath, sessionDir, 'session.jsonl.zstd');
            if (!fs.existsSync(logPath))
                continue;
            result.scanned += 1;
            try {
                const r = foldSessionFile(store, pricing, logPath, logger);
                result.imported += r.imported;
                result.repaired += r.repaired;
                result.skipped += r.skipped;
                if (r.error !== undefined)
                    result.errors.push(`${sessionDir}: ${r.error}`);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                result.errors.push(`${sessionDir}: ${message}`);
                logger?.warn?.(`shadow-billing: fold ${sessionDir} failed: ${message}`);
            }
        }
    }
    return result;
}
//# sourceMappingURL=fold.js.map