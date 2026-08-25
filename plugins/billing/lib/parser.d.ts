import type { BillingCall, BillingIssue } from './types.js';
export interface ParsedSessionFile {
    sessionId: string;
    sessionTitle: string;
    cwd?: string;
    createdAt?: number;
    calls: BillingCall[];
    issues: BillingIssue[];
}
export declare function parseSessionFile(buffer: Buffer, filePath: string, compressed: boolean, fallbackTimestamp?: number): ParsedSessionFile;
//# sourceMappingURL=parser.d.ts.map