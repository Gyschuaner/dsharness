import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_IMAGES_PER_REQUEST,
  apply,
  countRequestImages,
  limitRequestImages,
} from '../lib/index.js'

function image(id) {
  return { type: 'image', attachment: { id } }
}

function text(value) {
  return { type: 'text', text: value }
}

function message(id, content, source = { kind: 'user' }) {
  return { id, role: 'user', source, content }
}

function request(messages) {
  return Object.freeze({
    provider: 'test-provider',
    model: 'test-model',
    sessionId: 'session-1',
    messages: Object.freeze(messages),
  })
}

function retainedImageIds(value) {
  const ids = []
  const visit = (content) => {
    for (const block of content) {
      if (block.type === 'image') ids.push(block.attachment.id)
      if (block.type === 'tool-result') visit(block.content)
    }
  }

  for (const item of value.messages) visit(item.content)
  return ids
}

test('keeps requests with zero or nine images by identity', () => {
  for (const size of [0, MAX_IMAGES_PER_REQUEST]) {
    const input = request([
      message('current', [text('prompt'), ...Array.from({ length: size }, (_, index) => image(index))]),
    ])

    const result = limitRequestImages(input)

    assert.equal(result.request, input)
    assert.equal(result.omittedImages, 0)
    assert.equal(countRequestImages(result.request), size)
  }
})

test('caps ten images at nine without mutating frozen durable input', () => {
  const content = Object.freeze(Array.from({ length: 10 }, (_, index) => Object.freeze(image(index))))
  const current = Object.freeze(message('current', content))
  const input = request([current])
  const before = JSON.stringify(input)

  const result = limitRequestImages(input)

  assert.notEqual(result.request, input)
  assert.equal(countRequestImages(result.request), 9)
  assert.deepEqual(retainedImageIds(result.request), [0, 1, 2, 3, 4, 5, 6, 7, 8])
  assert.equal(result.omittedImages, 1)
  assert.equal(JSON.stringify(input), before)
})

test('prioritizes the newest message and preserves image order within it', () => {
  const oldest = message('oldest', [text('old'), image('old-1'), image('old-2'), image('old-3')])
  const middle = message('middle', Array.from({ length: 7 }, (_, index) => image(`middle-${index + 1}`)))
  const newest = message('newest', [image('new-1'), text('current'), image('new-2')])
  const input = request([oldest, middle, newest])

  const result = limitRequestImages(input)

  assert.deepEqual(retainedImageIds(result.request), [
    'middle-1',
    'middle-2',
    'middle-3',
    'middle-4',
    'middle-5',
    'middle-6',
    'middle-7',
    'new-1',
    'new-2',
  ])
  assert.equal(result.request.messages[2], newest)
  assert.equal(result.request.messages[2].content[1].text, 'current')
  assert.equal(result.request.messages[0].content[0], oldest.content[0])
})

test('counts and trims images nested inside tool results', () => {
  const nested = {
    type: 'tool-result',
    toolCallId: 'call-1',
    content: [
      text('tool output'),
      ...Array.from({ length: 8 }, (_, index) => image(`tool-${index + 1}`)),
    ],
    isError: false,
  }
  const input = request([
    message('history', [image('history-1'), image('history-2')]),
    message('current', [image('current-1'), nested], { kind: 'tool', callId: 'call-1' }),
  ])

  const result = limitRequestImages(input)

  assert.equal(countRequestImages(result.request), 9)
  assert.deepEqual(retainedImageIds(result.request), [
    'current-1',
    'tool-1',
    'tool-2',
    'tool-3',
    'tool-4',
    'tool-5',
    'tool-6',
    'tool-7',
    'tool-8',
  ])
  assert.equal(result.request.messages[1], input.messages[1])
  assert.equal(result.request.messages[0].content.length, 2)
  assert.ok(result.request.messages[0].content.every((block) => block.type === 'text'))
})

test('enforces the limit when the same image object appears more than once', () => {
  const sharedImage = image('shared')
  const input = request([
    message('history', Array.from({ length: 6 }, () => sharedImage)),
    message('current', Array.from({ length: 6 }, () => sharedImage)),
  ])

  const result = limitRequestImages(input)

  assert.equal(countRequestImages(result.request), 9)
  assert.equal(result.omittedImages, 3)
})

test('rejects configuration that could exceed the hard safety limit', () => {
  const input = request([])

  for (const invalid of [0, -1, 9.5, 10, Number.NaN]) {
    assert.throws(() => limitRequestImages(input, invalid), RangeError)
  }
})

test('middleware re-enters the LLM seam with a bounded copy', async () => {
  let listener
  let listenerOptions
  let originalNextCalled = false
  let dispatched
  const logs = []
  const ctx = {
    on(event, callback, options) {
      assert.equal(event, 'llm/stream')
      listener = callback
      listenerOptions = options
    },
    logger: {
      warn(...args) {
        logs.push(args)
      },
    },
    llm: {
      stream(value) {
        dispatched = value
        return (async function* () {
          yield { type: 'finish', reason: { kind: 'stop' } }
        })()
      },
    },
  }
  apply(ctx)
  const input = request([
    message('history', Array.from({ length: 12 }, (_, index) => image(index))),
  ])

  const stream = listener(input, () => {
    originalNextCalled = true
    throw new Error('overflow request must not reach the original downstream chain')
  })
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)

  assert.deepEqual(listenerOptions, { global: true })
  assert.equal(originalNextCalled, false)
  assert.equal(countRequestImages(dispatched), 9)
  assert.equal(logs.length, 1)
  assert.deepEqual(chunks, [{ type: 'finish', reason: { kind: 'stop' } }])
})

test('middleware passes safe requests and downstream failures through unchanged', async () => {
  let listener
  const expected = new Error('provider failed')
  const ctx = {
    on(_event, callback) {
      listener = callback
    },
    logger: { warn: assert.fail },
    llm: { stream: assert.fail },
  }
  apply(ctx)
  const input = request([message('current', [image('only')])])
  const downstream = (async function* () {
    throw expected
  })()

  const stream = listener(input, () => downstream)

  assert.equal(stream, downstream)
  await assert.rejects(
    async () => {
      for await (const _chunk of stream) {
        // The failure is raised before any chunk.
      }
    },
    (error) => error === expected,
  )
})
