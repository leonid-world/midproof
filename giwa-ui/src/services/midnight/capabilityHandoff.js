import { parseProofCapability } from './capabilityVerification'

export const MAX_CAPABILITY_FILE_BYTES = 16 * 1_024
export const GENERIC_CAPABILITY_FILENAME = 'midnight-proof.json'

export class MidnightCapabilityHandoffError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MidnightCapabilityHandoffError'
    this.code = code
  }
}

function handoffError(code, message) {
  return new MidnightCapabilityHandoffError(code, message)
}

export function canonicalizeCapabilityText(text, parseCapability = parseProofCapability) {
  return JSON.stringify(parseCapability(text))
}

export async function readCapabilityFromClipboard(clipboard = globalThis.navigator?.clipboard) {
  if (typeof clipboard?.readText !== 'function') {
    throw handoffError(
      'CLIPBOARD_READ_UNAVAILABLE',
      '이 브라우저에서는 클립보드 읽기를 사용할 수 없습니다. 파일 또는 고급 직접 입력을 사용해 주세요.',
    )
  }
  try {
    return await clipboard.readText()
  } catch {
    throw handoffError(
      'CLIPBOARD_READ_DENIED',
      '클립보드 읽기 권한이 거부되었습니다. 브라우저 권한을 허용하거나 파일을 선택해 주세요.',
    )
  }
}

export async function writeCapabilityToClipboard(
  text,
  clipboard = globalThis.navigator?.clipboard,
) {
  if (typeof clipboard?.writeText !== 'function') {
    throw handoffError(
      'CLIPBOARD_WRITE_UNAVAILABLE',
      '이 브라우저에서는 클립보드 복사를 사용할 수 없습니다. 고급 직접 입력 영역을 열어 복사해 주세요.',
    )
  }
  const canonicalText = canonicalizeCapabilityText(text)
  try {
    await clipboard.writeText(canonicalText)
  } catch {
    throw handoffError(
      'CLIPBOARD_WRITE_DENIED',
      '클립보드 쓰기 권한이 거부되었습니다. 고급 직접 입력 영역을 열어 복사해 주세요.',
    )
  }
  return canonicalText
}

export async function readCapabilityFile(file) {
  if (!file || typeof file.name !== 'string' || typeof file.arrayBuffer !== 'function') {
    throw handoffError('INVALID_CAPABILITY_FILE', '검증 파일을 다시 선택해 주세요.')
  }
  if (!/\.(?:gasok-proof|json)$/i.test(file.name)) {
    throw handoffError(
      'INVALID_CAPABILITY_FILE_EXTENSION',
      '.json 또는 지원되는 이전 형식의 검증 파일만 선택할 수 있습니다.',
    )
  }
  if (
    typeof file.size !== 'number' ||
    !Number.isSafeInteger(file.size) ||
    file.size <= 0 ||
    file.size > MAX_CAPABILITY_FILE_BYTES
  ) {
    throw handoffError(
      'CAPABILITY_FILE_SIZE_INVALID',
      '검증 파일은 비어 있지 않은 16 KiB 이하 파일이어야 합니다.',
    )
  }

  let bytes
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    throw handoffError('CAPABILITY_FILE_READ_FAILED', '검증 파일을 읽지 못했습니다.')
  }
  if (bytes.byteLength !== file.size || bytes.byteLength > MAX_CAPABILITY_FILE_BYTES) {
    throw handoffError(
      'CAPABILITY_FILE_SIZE_MISMATCH',
      '검증 파일 크기가 읽는 동안 변경되었습니다. 파일을 다시 선택해 주세요.',
    )
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw handoffError('CAPABILITY_FILE_ENCODING_INVALID', '검증 파일은 올바른 UTF-8이어야 합니다.')
  }
}

export function downloadCapabilityFile(
  text,
  {
    documentObject = globalThis.document,
    urlObject = globalThis.URL,
    BlobConstructor = globalThis.Blob,
    scheduleCleanup = (callback) => setTimeout(callback, 0),
  } = {},
) {
  if (
    typeof documentObject?.createElement !== 'function' ||
    typeof urlObject?.createObjectURL !== 'function' ||
    typeof urlObject?.revokeObjectURL !== 'function' ||
    typeof BlobConstructor !== 'function'
  ) {
    throw handoffError(
      'CAPABILITY_DOWNLOAD_UNAVAILABLE',
      '이 브라우저에서는 검증 파일 저장을 사용할 수 없습니다.',
    )
  }

  const canonicalText = canonicalizeCapabilityText(text)
  const encoded = new TextEncoder().encode(canonicalText)
  if (encoded.byteLength > MAX_CAPABILITY_FILE_BYTES) {
    throw handoffError(
      'CAPABILITY_FILE_SIZE_INVALID',
      '검증 파일은 16 KiB 이하로만 저장할 수 있습니다.',
    )
  }

  const blob = new BlobConstructor([canonicalText], {
    type: 'application/json;charset=utf-8',
  })
  let objectUrl = ''
  let anchor = null
  let isCleaned = false
  const cleanup = () => {
    if (isCleaned) return
    isCleaned = true
    if (objectUrl) urlObject.revokeObjectURL(objectUrl)
  }

  try {
    objectUrl = urlObject.createObjectURL(blob)
    anchor = documentObject.createElement('a')
    anchor.href = objectUrl
    anchor.download = GENERIC_CAPABILITY_FILENAME
    anchor.hidden = true
    documentObject.body?.append(anchor)
    anchor.click()
  } catch (error) {
    cleanup()
    throw error
  } finally {
    try {
      anchor?.remove()
    } catch {
      // The Blob URL cleanup below is the security boundary; a detached anchor is best effort.
    }
  }

  try {
    scheduleCleanup(cleanup)
  } catch (error) {
    cleanup()
    throw error
  }
  return Object.freeze({ filename: GENERIC_CAPABILITY_FILENAME, cleanup })
}
