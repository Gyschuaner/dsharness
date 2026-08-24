import type * as React from 'react'

declare global {
  interface ClientContext {
    get(name: string): unknown
    effect?(effect: () => void | (() => void)): void
  }

  interface ClientPluginExports {
    apply?: (ctx: ClientContext) => void
    [name: string]: unknown
  }

  interface ClientModule {
    exports: ClientPluginExports
  }

  type ClientPrimitive = React.ComponentType<Record<string, unknown>>
  interface ClientPrimitives {
    Button: ClientPrimitive
    Modal: ClientPrimitive
    IconApiOutline14: ClientPrimitive
    IconCheckOutline14: ClientPrimitive
    IconChevronDownOutline14: ClientPrimitive
    IconChevronLeftOutline14: ClientPrimitive
    IconChevronRightOutline14: ClientPrimitive
    IconChevronUpOutline14: ClientPrimitive
    IconCloseOutline16: ClientPrimitive
    IconCodeOutline16: ClientPrimitive
    IconCordisPluginOutline14: ClientPrimitive
    IconEditOutline16: ClientPrimitive
    IconLinkOutline16: ClientPrimitive
    IconPlusOutline16: ClientPrimitive
    IconRefreshOutline16: ClientPrimitive
    IconRightUpOutline14: ClientPrimitive
    IconSearchOutline16: ClientPrimitive
    IconSkillOutline16: ClientPrimitive
    IconTrashOutline16: ClientPrimitive
  }

  interface ClientRequire {
    (id: 'react'): typeof React
    (id: '@deepseek-ai/dsh-client-ui-primitives'): ClientPrimitives
    (id: string): unknown
  }

  interface ClientModuleRegistration {
    id: string
    factory(requireModule: ClientRequire): ClientPluginExports
  }

  interface Window {
    __ModuleLoader__: {
      load(registration: ClientModuleRegistration): void
    }
  }
}

export {}
