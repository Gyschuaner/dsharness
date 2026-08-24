/**
 * Short-term protection for providers that reject requests containing more
 * than nine images. Durable session messages and attachments remain intact;
 * only a detached request sent to the downstream adapter is trimmed.
 */
export declare const MAX_IMAGES_PER_REQUEST = 9;
export declare const name = "image-context-guard";
export declare const inject: string[];
export interface ContentBlock {
    type?: string;
    content?: ContentBlock[];
    [field: string]: unknown;
}
export interface LlmMessage {
    content?: ContentBlock[] | string | null;
    [field: string]: unknown;
}
export interface LlmRequest {
    messages: LlmMessage[];
    sessionId?: unknown;
    [field: string]: unknown;
}
interface ImageLimitResult {
    request: LlmRequest;
    totalImages: number;
    retainedImages: number;
    omittedImages: number;
}
interface ImageGuardContext {
    on(event: 'llm/stream', listener: (request: LlmRequest, next: () => unknown) => unknown, options: {
        global: true;
    }): void;
    logger: {
        warn(format: string, ...values: unknown[]): void;
    };
    llm: {
        stream(request: LlmRequest): unknown;
    };
}
export declare function countRequestImages(request: LlmRequest): number;
/**
 * Return the original request when it is already safe. Overflow requests get
 * a shallow structural copy: only messages containing omitted images and the
 * content arrays on their paths are replaced.
 */
export declare function limitRequestImages(request: LlmRequest, maxImages?: number): ImageLimitResult;
export declare function apply(ctx: ImageGuardContext): void;
export {};
//# sourceMappingURL=index.d.ts.map