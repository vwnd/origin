<template>
  <div class="w-full h-full flex flex-col rounded-xl ring ring-default bg-default shadow-xs overflow-hidden">
    <UEditor
      v-model="value"
      content-type="markdown"
      placeholder="Write something, or press '/' for commands…"
      :starter-kit="{
        blockquote: false,
        heading: {
          levels: [1, 2, 3, 4]
        },
        dropcursor: {
          color: 'var(--ui-primary)',
          width: 2
        },
        link: {
          openOnClick: false
        }
      }"
      :ui="{
        root: 'flex flex-col flex-1 min-h-0',
        content: 'flex-1 min-h-0 overflow-y-auto',
        base: 'max-w-3xl mx-auto px-6 sm:px-10 py-10 text-base/7 *:my-4'
      }"
    >
      <template #default="{ editor }">
        <UEditorToolbar
          :editor="editor"
          :items="toolbarItems"
          class="shrink-0 px-2 py-1.5 border-b border-default bg-elevated/40"
        />

        <UEditorDragHandle :editor="editor" />

        <UEditorToolbar
          layout="bubble"
          :editor="editor"
          :items="bubbleItems"
        />

        <UEditorSuggestionMenu
          :editor="editor"
          :items="suggestionItems"
        />
      </template>
    </UEditor>
  </div>
</template>

<script setup lang="ts">
import type { EditorToolbarItem, EditorSuggestionMenuItem } from '@nuxt/ui'

const value = defineModel<string>({ default: '' })

const headings: EditorToolbarItem[] = [
  { kind: 'paragraph', label: 'Text', icon: 'i-lucide-type' },
  { kind: 'heading', level: 1, label: 'Heading 1', icon: 'i-lucide-heading-1' },
  { kind: 'heading', level: 2, label: 'Heading 2', icon: 'i-lucide-heading-2' },
  { kind: 'heading', level: 3, label: 'Heading 3', icon: 'i-lucide-heading-3' },
  { kind: 'heading', level: 4, label: 'Heading 4', icon: 'i-lucide-heading-4' }
]

const toolbarItems: EditorToolbarItem[][] = [
  [
    { kind: 'undo', icon: 'i-lucide-undo-2', tooltip: { text: 'Undo' } },
    { kind: 'redo', icon: 'i-lucide-rotate-cw', tooltip: { text: 'Redo' } }
  ],
  [
    {
      label: 'Text',
      icon: 'i-lucide-type',
      trailingIcon: 'i-lucide-chevron-down',
      items: headings
    }
  ],
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Bold' } },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Italic' } },
    { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline', tooltip: { text: 'Underline' } },
    { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough', tooltip: { text: 'Strikethrough' } },
    { kind: 'mark', mark: 'code', icon: 'i-lucide-code', tooltip: { text: 'Inline code' } },
    { kind: 'link', icon: 'i-lucide-link', tooltip: { text: 'Link' } }
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: 'Bullet list' } },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: 'Numbered list' } },
    { kind: 'codeBlock', icon: 'i-lucide-square-code', tooltip: { text: 'Code block' } },
    { kind: 'horizontalRule', icon: 'i-lucide-minus', tooltip: { text: 'Divider' } }
  ]
]

const bubbleItems: EditorToolbarItem[][] = [
  [
    {
      label: 'Text',
      icon: 'i-lucide-type',
      trailingIcon: 'i-lucide-chevron-down',
      items: headings
    }
  ],
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold' },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic' },
    { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline' },
    { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough' },
    { kind: 'mark', mark: 'code', icon: 'i-lucide-code' },
    { kind: 'link', icon: 'i-lucide-link' }
  ],
  [
    { kind: 'clearFormatting', icon: 'i-lucide-remove-formatting' }
  ]
]

const suggestionItems: EditorSuggestionMenuItem[] = [
  { type: 'label', label: 'Basic blocks' },
  { kind: 'paragraph', label: 'Text', icon: 'i-lucide-type' },
  { kind: 'heading', level: 1, label: 'Heading 1', icon: 'i-lucide-heading-1' },
  { kind: 'heading', level: 2, label: 'Heading 2', icon: 'i-lucide-heading-2' },
  { kind: 'heading', level: 3, label: 'Heading 3', icon: 'i-lucide-heading-3' },
  { type: 'separator' },
  { type: 'label', label: 'Lists & media' },
  { kind: 'bulletList', label: 'Bullet list', icon: 'i-lucide-list' },
  { kind: 'orderedList', label: 'Numbered list', icon: 'i-lucide-list-ordered' },
  { kind: 'codeBlock', label: 'Code block', icon: 'i-lucide-square-code' },
  { kind: 'horizontalRule', label: 'Divider', icon: 'i-lucide-minus' }
]
</script>
