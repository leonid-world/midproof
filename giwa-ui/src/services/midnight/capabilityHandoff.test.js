import { describe, expect, it, vi } from 'vitest'
import { makeProofCapability } from '../../test/midnightFixtures'
import {
  canonicalizeCapabilityText,
  downloadCapabilityFile,
  GENERIC_CAPABILITY_FILENAME,
  MAX_CAPABILITY_FILE_BYTES,
  readCapabilityFile,
  readCapabilityFromClipboard,
  writeCapabilityToClipboard,
} from './capabilityHandoff'

const capabilityText = () => JSON.stringify(makeProofCapability())

function makeFile(name, bytes) {
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: vi
      .fn()
      .mockResolvedValue(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  }
}

describe('capability handoff helpers', () => {
  it('keeps the handoff payload as the exact canonical 9-field capability without a wrapper', () => {
    const canonical = canonicalizeCapabilityText('  ' + capabilityText() + '  ')

    expect(JSON.parse(canonical)).toEqual(makeProofCapability())
    expect(Object.keys(JSON.parse(canonical))).toHaveLength(9)
  })

  it('reads clipboard text only when explicitly called and maps permission failure safely', async () => {
    const readText = vi.fn().mockResolvedValue(capabilityText())
    const pendingRead = readCapabilityFromClipboard({ readText })

    expect(readText).toHaveBeenCalledOnce()
    await expect(pendingRead).resolves.toBe(capabilityText())
    await expect(
      readCapabilityFromClipboard({ readText: vi.fn().mockRejectedValue(new Error('private')) }),
    ).rejects.toMatchObject({ code: 'CLIPBOARD_READ_DENIED' })
  })

  it('writes only canonical capability text and maps clipboard denial', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    await writeCapabilityToClipboard(capabilityText(), { writeText })

    expect(writeText).toHaveBeenCalledWith(capabilityText())
    await expect(
      writeCapabilityToClipboard(capabilityText(), {
        writeText: vi.fn().mockRejectedValue(new Error('private')),
      }),
    ).rejects.toMatchObject({ code: 'CLIPBOARD_WRITE_DENIED' })
  })

  it('accepts strict UTF-8 .gasok-proof and .json files up to 16 KiB', async () => {
    const bytes = new TextEncoder().encode(capabilityText())

    await expect(readCapabilityFile(makeFile('proof.gasok-proof', bytes))).resolves.toBe(
      capabilityText(),
    )
    await expect(readCapabilityFile(makeFile('proof.JSON', bytes))).resolves.toBe(capabilityText())
  })

  it('rejects unsupported, oversized, mismatched, and invalid UTF-8 files before parsing', async () => {
    const bytes = new TextEncoder().encode(capabilityText())
    await expect(readCapabilityFile(makeFile('proof.txt', bytes))).rejects.toMatchObject({
      code: 'INVALID_CAPABILITY_FILE_EXTENSION',
    })
    const arrayBuffer = vi.fn()
    await expect(
      readCapabilityFile({
        name: 'proof.json',
        size: MAX_CAPABILITY_FILE_BYTES + 1,
        arrayBuffer,
      }),
    ).rejects.toMatchObject({ code: 'CAPABILITY_FILE_SIZE_INVALID' })
    expect(arrayBuffer).not.toHaveBeenCalled()
    await expect(
      readCapabilityFile({
        name: 'proof.json',
        size: bytes.byteLength + 1,
        arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer),
      }),
    ).rejects.toMatchObject({ code: 'CAPABILITY_FILE_SIZE_MISMATCH' })
    await expect(
      readCapabilityFile(makeFile('proof.json', Uint8Array.from([0xc3, 0x28]))),
    ).rejects.toMatchObject({ code: 'CAPABILITY_FILE_ENCODING_INVALID' })
  })

  it('downloads with a generic filename and always revokes the Blob URL', () => {
    const click = vi.fn()
    const remove = vi.fn()
    const append = vi.fn()
    const anchor = { click, remove }
    const documentObject = {
      body: { append },
      createElement: vi.fn().mockReturnValue(anchor),
    }
    const urlObject = {
      createObjectURL: vi.fn().mockReturnValue('blob:temporary'),
      revokeObjectURL: vi.fn(),
    }
    const BlobConstructor = vi.fn(function MockBlob(parts, options) {
      this.parts = parts
      this.options = options
    })
    let scheduledCleanup
    const scheduleCleanup = vi.fn((callback) => {
      scheduledCleanup = callback
    })

    const download = downloadCapabilityFile(capabilityText(), {
      documentObject,
      urlObject,
      BlobConstructor,
      scheduleCleanup,
    })

    expect(download.filename).toBe(GENERIC_CAPABILITY_FILENAME)
    expect(download.filename).not.toMatch(/seller|buyer|receivable|[0-9]/i)
    expect(anchor.download).toBe(GENERIC_CAPABILITY_FILENAME)
    expect(anchor.href).toBe('blob:temporary')
    expect(JSON.parse(BlobConstructor.mock.instances[0].parts[0])).toEqual(makeProofCapability())
    expect(Object.keys(JSON.parse(BlobConstructor.mock.instances[0].parts[0]))).toHaveLength(9)
    expect(append).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    expect(urlObject.revokeObjectURL).not.toHaveBeenCalled()
    scheduledCleanup()
    expect(urlObject.revokeObjectURL).toHaveBeenCalledWith('blob:temporary')
  })

  it('revokes the Blob URL even when the synthetic download click fails', () => {
    const urlObject = {
      createObjectURL: vi.fn().mockReturnValue('blob:temporary'),
      revokeObjectURL: vi.fn(),
    }
    const anchor = {
      click: vi.fn(() => {
        throw new Error('download failed')
      }),
      remove: vi.fn(),
    }

    expect(() =>
      downloadCapabilityFile(capabilityText(), {
        documentObject: {
          body: { append: vi.fn() },
          createElement: vi.fn().mockReturnValue(anchor),
        },
        urlObject,
        BlobConstructor: Blob,
      }),
    ).toThrow('download failed')
    expect(urlObject.revokeObjectURL).toHaveBeenCalledWith('blob:temporary')
  })

  it('lets unmount cleanup revoke a pending URL once even if anchor removal fails', () => {
    let scheduledCleanup
    const urlObject = {
      createObjectURL: vi.fn().mockReturnValue('blob:pending'),
      revokeObjectURL: vi.fn(),
    }
    const download = downloadCapabilityFile(capabilityText(), {
      documentObject: {
        body: { append: vi.fn() },
        createElement: vi.fn().mockReturnValue({
          click: vi.fn(),
          remove: vi.fn(() => {
            throw new Error('remove failed')
          }),
        }),
      },
      urlObject,
      BlobConstructor: Blob,
      scheduleCleanup: (callback) => {
        scheduledCleanup = callback
      },
    })

    download.cleanup()
    scheduledCleanup()

    expect(urlObject.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(urlObject.revokeObjectURL).toHaveBeenCalledWith('blob:pending')
  })
})
