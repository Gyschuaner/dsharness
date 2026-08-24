/**
 * Versioned, read-only Plugin marketplace Registry (DSH-030).
 *
 * The Registry is data only. It never carries executable code or secrets. The
 * Host validates the document before merging it with the built-in featured
 * list, and Phase 1 deliberately leaves Registry-only entries view-only.
 */
export const REGISTRY_SCHEMA_VERSION = 1;
export const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/Gyschuaner/dsharness/main/marketplace/plugin-registry.json';
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const MAX_ITEMS = 200;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function cleanText(value, field, max, required = true) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (required && text === '')
        throw new Error(`${field} 不能为空`);
    if (text.length > max)
        throw new Error(`${field} 不能超过 ${max} 个字符`);
    return text;
}
function safeHttpsUrl(value, field) {
    if (value === undefined || value === null || value === '')
        return null;
    const text = cleanText(value, field, 2048);
    let parsed;
    try {
        parsed = new URL(text);
    }
    catch {
        throw new Error(`${field} 不是合法 URL`);
    }
    if (parsed.protocol !== 'https:')
        throw new Error(`${field} 必须使用 HTTPS`);
    return parsed.toString();
}
function optionalPackageName(value) {
    if (value === undefined || value === null || value === '')
        return null;
    const name = cleanText(value, 'packageName', 214);
    if (!PACKAGE_NAME_RE.test(name))
        throw new Error('packageName 不合法');
    return name;
}
function normalizeItem(value, index) {
    if (!isRecord(value))
        throw new Error(`items[${index}] 必须是对象`);
    const repository = cleanText(value.repository, `items[${index}].repository`, 200);
    if (!REPOSITORY_RE.test(repository))
        throw new Error(`items[${index}].repository 不合法`);
    const id = cleanText(value.id ?? repository, `items[${index}].id`, 200);
    if (id !== repository)
        throw new Error(`items[${index}].id 必须等于 repository`);
    const description = cleanText(value.description, `items[${index}].description`, 240);
    const latestHint = value.latestHint === undefined || value.latestHint === null
        ? null
        : cleanText(value.latestHint, `items[${index}].latestHint`, 120);
    return {
        id,
        repository,
        packageName: optionalPackageName(value.packageName),
        description,
        iconUrl: safeHttpsUrl(value.iconUrl, `items[${index}].iconUrl`),
        latestHint,
    };
}
/**
 * Validate and normalize an untrusted Registry response. Duplicate
 * repositories are merged by keeping the first valid entry, so a bad mirror
 * cannot create duplicate rows in the UI.
 */
export function normalizeRegistry(value) {
    if (!isRecord(value))
        throw new Error('Registry 根节点必须是对象');
    if (value.schemaVersion !== REGISTRY_SCHEMA_VERSION)
        throw new Error(`Registry schemaVersion 必须是 ${REGISTRY_SCHEMA_VERSION}`);
    const generatedAt = cleanText(value.generatedAt, 'generatedAt', 80);
    if (Number.isNaN(Date.parse(generatedAt)))
        throw new Error('generatedAt 不是合法时间');
    if (!Array.isArray(value.items) || value.items.length > MAX_ITEMS)
        throw new Error(`items 必须是最多 ${MAX_ITEMS} 项的数组`);
    const seen = new Set();
    const items = [];
    for (let index = 0; index < value.items.length; index += 1) {
        const item = normalizeItem(value.items[index], index);
        const key = item.repository.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        items.push(item);
    }
    return { schemaVersion: REGISTRY_SCHEMA_VERSION, generatedAt, items };
}
//# sourceMappingURL=registry.js.map