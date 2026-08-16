/**
 * Short-term protection for providers that reject requests containing more
 * than nine images. Durable session messages and attachments remain intact;
 * only a detached request sent to the downstream adapter is trimmed.
 */

export const MAX_IMAGES_PER_REQUEST = 9

const OMITTED_IMAGE_TEXT =
  '[Image omitted from this model request because the 9-image safety limit was reached.]'

export const name = 'image-context-guard'
export const inject = ['llm']

function imageBlocksIn(content, images = []) {
  for (const block of content) {
    if (block?.type === 'image') {
      images.push(block)
      continue
    }

    if (block?.type === 'tool-result' && Array.isArray(block.content)) {
      imageBlocksIn(block.content, images)
    }
  }

  return images
}

export function countRequestImages(request) {
  let total = 0

  for (const message of request.messages ?? []) {
    if (Array.isArray(message?.content)) {
      total += imageBlocksIn(message.content).length
    }
  }

  return total
}

function selectNewestImages(messages, maxImages) {
  const selectedByMessage = new Map()
  let selectedCount = 0

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex]
    if (!Array.isArray(message?.content)) continue

    // Messages are prioritized newest-first. Within one message, preserve the
    // user's original image order instead of selecting from the tail.
    const imageCount = imageBlocksIn(message.content).length
    const selectedOrdinals = new Set()
    for (let imageOrdinal = 0; imageOrdinal < imageCount; imageOrdinal += 1) {
      if (selectedCount >= maxImages) {
        if (selectedOrdinals.size > 0) selectedByMessage.set(messageIndex, selectedOrdinals)
        return selectedByMessage
      }
      selectedOrdinals.add(imageOrdinal)
      selectedCount += 1
    }
    if (selectedOrdinals.size > 0) selectedByMessage.set(messageIndex, selectedOrdinals)
  }

  return selectedByMessage
}

function trimContent(content, selectedOrdinals, cursor = { imageOrdinal: 0 }) {
  let changed = false
  let omittedImages = 0
  const nextContent = []

  for (const block of content) {
    if (block?.type === 'image') {
      const keep = selectedOrdinals.has(cursor.imageOrdinal)
      cursor.imageOrdinal += 1
      if (keep) {
        nextContent.push(block)
      } else {
        changed = true
        omittedImages += 1
        nextContent.push({ type: 'text', text: OMITTED_IMAGE_TEXT })
      }
      continue
    }

    if (block?.type === 'tool-result' && Array.isArray(block.content)) {
      const nested = trimContent(block.content, selectedOrdinals, cursor)
      omittedImages += nested.omittedImages

      if (nested.changed) {
        changed = true
        nextContent.push({ ...block, content: nested.content })
      } else {
        nextContent.push(block)
      }
      continue
    }

    nextContent.push(block)
  }

  return {
    content: changed ? nextContent : content,
    changed,
    omittedImages,
  }
}

/**
 * Return the original request when it is already safe. Overflow requests get
 * a shallow structural copy: only messages containing omitted images and the
 * content arrays on their paths are replaced.
 */
export function limitRequestImages(request, maxImages = MAX_IMAGES_PER_REQUEST) {
  if (!Number.isSafeInteger(maxImages) || maxImages < 1 || maxImages > MAX_IMAGES_PER_REQUEST) {
    throw new RangeError(`maxImages must be an integer between 1 and ${MAX_IMAGES_PER_REQUEST}`)
  }

  const totalImages = countRequestImages(request)
  if (totalImages <= maxImages) {
    return {
      request,
      totalImages,
      retainedImages: totalImages,
      omittedImages: 0,
    }
  }

  const selectedByMessage = selectNewestImages(request.messages, maxImages)
  let changed = false
  let omittedImages = 0
  const messages = request.messages.map((message, messageIndex) => {
    if (!Array.isArray(message?.content)) return message

    const trimmed = trimContent(message.content, selectedByMessage.get(messageIndex) ?? new Set())
    omittedImages += trimmed.omittedImages
    if (!trimmed.changed) return message

    changed = true
    return { ...message, content: trimmed.content }
  })

  if (!changed || omittedImages !== totalImages - maxImages) {
    throw new Error('image-context-guard failed to produce a bounded request')
  }

  return {
    request: { ...request, messages },
    totalImages,
    retainedImages: maxImages,
    omittedImages,
  }
}

export function apply(ctx) {
  ctx.on(
    'llm/stream',
    (request, next) => {
      const limited = limitRequestImages(request)
      if (limited.request === request) return next()

      ctx.logger.warn(
        'trimmed %d of %d image blocks before model dispatch (limit=%d, session=%s)',
        limited.omittedImages,
        limited.totalImages,
        MAX_IMAGES_PER_REQUEST,
        request.sessionId === undefined ? 'none' : String(request.sessionId),
      )

      // llm/stream does not allow rewriting a frozen loop-built request in
      // place. Re-enter the public LLM seam with the detached, now-safe copy;
      // this listener sees <= 9 images on the nested pass and calls next().
      return ctx.llm.stream(limited.request)
    },
    { global: true },
  )
}
