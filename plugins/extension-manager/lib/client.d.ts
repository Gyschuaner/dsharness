/**
 * dsh-extension-manager — client half (browser bundle).
 * build: 3 (DSH-006 / DSH-026 / DSH-027)
 *
 * Owns the frame-level 「扩展」 entry and full-page navigation. Business
 * plugins contribute sections through `extension.manager.section`; this
 * package does not synthesize business placeholders.
 *
 * TypeScript source compiled to a classic browser script — no JSX or imports.
 */
interface ExtensionSectionRow {
    id: string;
    label: string;
    order: number;
    soon: boolean;
}
interface ExtensionSectionLedger {
    snapshot(): ExtensionSectionRow[];
    subscribe(listener: () => void): () => void;
}
interface ExtensionSlots {
    getVersion?(name: string): number;
    entries(name: string): Array<{
        options?: {
            id?: string;
            label?: unknown;
            order?: number;
        };
    }>;
    subscribe?(name: string, listener: () => void): () => void;
    register(config: Record<string, unknown>, component: React.ComponentType<ExtensionEntryProps>): unknown;
    inject(name: string, effect: () => unknown): void;
}
interface ExtensionsPageProps {
    onClose(): void;
    renderSlot(name: string, props: Record<string, unknown>, options: {
        only: string;
    }): React.ReactNode;
    rows: ExtensionSectionRow[];
}
interface ExtensionEntryProps {
    wide: boolean;
    renderSlot: ExtensionsPageProps['renderSlot'];
    sectionLedger: ExtensionSectionLedger;
}
//# sourceMappingURL=client.d.ts.map