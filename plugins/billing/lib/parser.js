import { basename, dirname } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { estimatePrice } from './pricing.js';
const ZSTD_MAGIC = 0xFD2FB528;
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function finiteInteger(value) {
    return typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(Math.trunc(value)) && value >= 0
        ? Math.trunc(value)
        : undefined;
}
function stringValue(value) {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
function usageFrom(value) {
    const input = record(value);
    if (input === undefined)
        return undefined;
    const inputTokens = finiteInteger(input.inputTokens);
    const outputTokens = finiteInteger(input.outputTokens);
    const cacheReadTokens = finiteInteger(input.cacheReadTokens) ?? 0;
    const cacheWriteTokens = finiteInteger(input.cacheWriteTokens) ?? 0;
    if (inputTokens === undefined || outputTokens === undefined)
        return undefined;
    return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens };
}
function sessionIdFromPath(filePath) {
    const folder = basename(dirname(filePath));
    return folder.startsWith('session-') ? folder.slice('session-'.length) : folder;
}
function sessionTitleFromHeader(header, fallback) {
    if (header.cwd !== undefined) {
        const cwdName = basename(header.cwd);
        if (cwdName !== '')
            return cwdName;
    }
    return fallback;
}
function issue(path, code, message) {
    return { path, code, message };
}
function scanZstdFrames(buffer) {
    const frames = [];
    let offset = 0;
    while (offset < buffer.length) {
        const start = offset;
        if (buffer.length - offset < 4)
            return { frames, tornStart: start };
        if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
            throw new Error(`Zstandard 帧魔数错误（字节 ${offset}）`);
        }
        offset += 4;
        if (offset === buffer.length)
            return { frames, tornStart: start };
        const descriptor = buffer.readUInt8(offset);
        offset += 1;
        if ((descriptor & 0x18) !== 0)
            throw new Error(`Zstandard 帧头保留位错误（字节 ${offset - 1}）`);
        const contentSizeFlag = descriptor >>> 6;
        const singleSegment = (descriptor & 0x20) !== 0;
        const checksum = (descriptor & 0x04) !== 0;
        const dictionaryFlag = descriptor & 0x03;
        const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
        const contentSizeBytes = contentSizeFlag === 0
            ? (singleSegment ? 1 : 0)
            : 1 << contentSizeFlag;
        const headerBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
        if (buffer.length - offset < headerBytes)
            return { frames, tornStart: start };
        offset += headerBytes;
        for (;;) {
            if (buffer.length - offset < 3)
                return { frames, tornStart: start };
            const blockHeader = buffer.readUIntLE(offset, 3);
            offset += 3;
            const lastBlock = (blockHeader & 1) !== 0;
            const blockType = (blockHeader >>> 1) & 0x03;
            const blockSize = blockHeader >>> 3;
            if (blockType === 0x03)
                throw new Error(`Zstandard block 类型错误（字节 ${offset - 3}）`);
            offset += blockType === 0x01 ? 1 : blockSize;
            if (buffer.length < offset)
                return { frames, tornStart: start };
            if (lastBlock)
                break;
        }
        if (checksum) {
            if (buffer.length - offset < 4)
                return { frames, tornStart: start };
            offset += 4;
        }
        frames.push({ start, end: offset });
    }
    return { frames };
}
function decodeFrames(buffer, path) {
    const issues = [];
    let scan;
    try {
        scan = scanZstdFrames(buffer);
    }
    catch (error) {
        return {
            texts: [],
            issues: [issue(path, 'ZSTD_CORRUPT', error instanceof Error ? error.message : String(error))],
        };
    }
    if (scan.tornStart !== undefined) {
        issues.push(issue(path, 'ZSTD_TORN_FRAME', `日志末尾存在未完成的 Zstandard 帧，已读取前 ${scan.tornStart} 字节。`));
    }
    const texts = [];
    for (const frame of scan.frames) {
        try {
            texts.push(zstdDecompressSync(buffer.subarray(frame.start, frame.end)).toString('utf8'));
        }
        catch (error) {
            issues.push(issue(path, 'ZSTD_DECOMPRESS_FAILED', error instanceof Error ? error.message : String(error)));
        }
    }
    return { texts, issues };
}
export function parseSessionFile(buffer, filePath, compressed, fallbackTimestamp = 0) {
    const path = filePath;
    const issues = [];
    const decoded = compressed ? decodeFrames(buffer, path) : { texts: [buffer.toString('utf8')], issues: [] };
    const texts = decoded.texts;
    issues.push(...decoded.issues);
    const sessionIdFallback = sessionIdFromPath(path);
    let header = {};
    let sessionTitle = sessionIdFallback;
    let currentModel = 'unknown';
    const calls = new Map();
    let pending = '';
    const consumeLine = (line, complete) => {
        if (line.trim() === '')
            return;
        let parsed;
        try {
            parsed = JSON.parse(line);
        }
        catch {
            issues.push(issue(path, complete ? 'MALFORMED_JSON' : 'TRUNCATED_JSON', complete ? '日志中包含无法解析的 JSON 行。' : '日志末尾存在不完整 JSON 行，已忽略。'));
            return;
        }
        const entry = record(parsed);
        if (entry === undefined) {
            issues.push(issue(path, 'INVALID_RECORD', '日志行不是 JSON 对象，已忽略。'));
            return;
        }
        if (entry.type === 'session') {
            const id = stringValue(entry.id);
            const cwd = stringValue(entry.cwd);
            const createdAt = finiteInteger(entry.createdAt);
            header = {
                ...(id === undefined ? {} : { id }),
                ...(cwd === undefined ? {} : { cwd }),
                ...(createdAt === undefined ? {} : { createdAt }),
            };
            sessionTitle = sessionTitleFromHeader(header, sessionIdFallback);
            return;
        }
        const data = record(entry.data);
        if (entry.type === 'session/title') {
            const title = stringValue(data?.title);
            if (title !== undefined)
                sessionTitle = title;
            return;
        }
        if (entry.type === 'request/context') {
            currentModel = stringValue(data?.model) ?? currentModel;
            return;
        }
        let usageValue;
        let priority = 0;
        if (entry.type === 'assistant/message') {
            usageValue = data?.usage;
            priority = 2;
        }
        else if (entry.type === 'assistant/chunk') {
            const chunk = record(data?.chunk);
            if (chunk?.type !== 'usage')
                return;
            usageValue = chunk.usage;
            priority = 1;
        }
        else {
            return;
        }
        const usage = usageFrom(usageValue);
        if (usage === undefined)
            return;
        const turn = finiteInteger(data?.turn);
        const step = finiteInteger(data?.step);
        if (turn === undefined || step === undefined) {
            issues.push(issue(path, 'USAGE_WITHOUT_STEP', 'usage 缺少 turn/step，已忽略。'));
            return;
        }
        const message = record(data?.message);
        const source = record(message?.source);
        const model = stringValue(source?.model) ?? currentModel;
        const timestamp = finiteInteger(entry.time) ?? header.createdAt ?? fallbackTimestamp;
        const callKey = `${header.id ?? sessionIdFallback}:${turn}:${step}`;
        const previous = calls.get(callKey);
        if (previous !== undefined && previous.priority > priority)
            return;
        calls.set(callKey, { ...usage, turn, step, timestamp, model, priority });
    };
    for (const text of texts) {
        pending += text;
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines)
            consumeLine(line, true);
    }
    if (pending.trim() !== '')
        consumeLine(pending, false);
    const sessionId = header.id ?? sessionIdFallback;
    const resultCalls = [...calls.entries()].map(([callKey, candidate]) => {
        const price = estimatePrice(candidate.model, candidate.timestamp, candidate);
        return {
            callKey,
            sessionId,
            sessionTitle,
            model: candidate.model,
            timestamp: candidate.timestamp,
            turn: candidate.turn,
            step: candidate.step,
            inputTokens: candidate.inputTokens,
            outputTokens: candidate.outputTokens,
            cacheReadTokens: candidate.cacheReadTokens,
            cacheWriteTokens: candidate.cacheWriteTokens,
            estimatedCost: price.estimatedCost,
            priceMode: price.mode,
            priceReason: price.reason,
        };
    });
    return {
        sessionId,
        sessionTitle,
        ...header.cwd === undefined ? {} : { cwd: header.cwd },
        ...header.createdAt === undefined ? {} : { createdAt: header.createdAt },
        calls: resultCalls,
        issues,
    };
}
//# sourceMappingURL=parser.js.map