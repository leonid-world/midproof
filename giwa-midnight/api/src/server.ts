import { resolveExactProofCapability } from './resolve.js';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  invalidJsonBody,
  jsonBodyRequired,
  PublicApiError,
  requestBodyTooLarge,
} from './errors.js';
import { NETWORK_ID } from './config.js';
import type { GetEligibilityResult } from './eligibility.js';
import type { EligibilityResolutionJson, ErrorJson } from './types.js';

const RESOLVE_PATH = '/v2/eligibility-results/resolve';
const MAX_JSON_BODY_BYTES = 4_096;

export interface ApiServerDependencies {
  readonly getEligibilityResult: GetEligibilityResult;
  readonly approvedContractAddress: string;
  readonly networkId?: 'undeployed' | 'preview';
  readonly nowSeconds?: () => bigint;
  /** The hosted demo requires Provider 2; generic local readers keep registry compatibility. */
  readonly acceptedProviderId?: string;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(json);
}

function sendError(response: ServerResponse, error: PublicApiError): void {
  const body: ErrorJson = {
    error: {
      code: error.code,
      message: error.publicMessage,
    },
  };
  sendJson(response, error.status, body);
}

function requireJsonContentType(request: IncomingMessage): void {
  const contentType = request.headers['content-type'];
  if (
    typeof contentType !== 'string' ||
    contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json'
  ) {
    throw jsonBodyRequired();
  }
}

function requireUncompressedBody(request: IncomingMessage): void {
  const encoding = request.headers['content-encoding'];
  if (encoding !== undefined && encoding.toLowerCase() !== 'identity') {
    throw new PublicApiError(415, 'UNSUPPORTED_CONTENT_ENCODING', 'Compressed request bodies are not supported.');
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentLength = request.headers['content-length'];
  if (
    typeof contentLength === 'string' &&
    (!/^(0|[1-9][0-9]*)$/.test(contentLength) || BigInt(contentLength) > BigInt(MAX_JSON_BODY_BYTES))
  ) {
    request.resume();
    throw requestBodyTooLarge();
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_JSON_BODY_BYTES) {
      request.resume();
      throw requestBodyTooLarge();
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw invalidJsonBody();
  }
}

export function createApiServer({
  getEligibilityResult,
  approvedContractAddress,
  networkId = NETWORK_ID,
  nowSeconds = () => BigInt(Math.floor(Date.now() / 1_000)),
  acceptedProviderId,
}: ApiServerDependencies): Server {
  if (acceptedProviderId !== undefined &&
      (!/^[1-9][0-9]*$/.test(acceptedProviderId) || BigInt(acceptedProviderId) > 65_535n)) {
    throw new Error('Invalid approved attestation provider ID.');
  }
  return createHttpServer(async (request, response) => {
    const pathname = request.url ?? '/';

    if (pathname === '/health') {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        sendError(response, new PublicApiError(405, 'METHOD_NOT_ALLOWED', 'Only GET is supported for this endpoint.'));
        return;
      }
      const readerHealth = getEligibilityResult.getHealth?.();
      sendJson(response, readerHealth?.status === 'degraded' ? 503 : 200, {
        status: readerHealth?.status ?? 'ok',
        service: 'gasok-midnight-read-api',
        networkId,
        ...(readerHealth ? { inFlight: readerHealth.inFlight } : {}),
      });
      return;
    }

    if (pathname !== RESOLVE_PATH) {
      sendError(response, new PublicApiError(404, 'NOT_FOUND', 'The requested endpoint does not exist.'));
      return;
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      sendError(response, new PublicApiError(405, 'METHOD_NOT_ALLOWED', 'Only POST is supported for this endpoint.'));
      return;
    }

    const controller = new AbortController();
    const onDisconnect = () => {
      if (!response.writableEnded) controller.abort(new Error('The read request was cancelled.'));
    };
    request.once('aborted', onDisconnect);
    response.once('close', onDisconnect);
    try {
      requireJsonContentType(request);
      requireUncompressedBody(request);
      const requestBody = await readJsonBody(request);
      const { verified, result } = await resolveExactProofCapability(requestBody, approvedContractAddress,
        getEligibilityResult, acceptedProviderId, controller.signal, nowSeconds);
      const responseBody: EligibilityResolutionJson = {
        version: 2,
        networkId,
        contractAddress: verified.capability.midnightContractAddress,
        context: {
          giwaChainId: verified.capability.giwaChainId,
          receivableFinanceAddress: verified.capability.receivableFinanceAddress,
          onchainReceivableId: verified.capability.onchainReceivableId,
          subjectRole: verified.capability.subjectRole,
          partyWallet: verified.capability.partyWallet,
          requestId: verified.capability.requestId,
          intendedFunderWallet: verified.capability.intendedFunderWallet,
          minAnnualRevenueKrw: verified.capability.minAnnualRevenueKrw,
          maxDebtRatioBps: verified.capability.maxDebtRatioBps,
          maxOverdueCount: verified.capability.maxOverdueCount,
          policyRequestHash: verified.capability.policyRequestHash,
        },
        result: {
          lookupKey: verified.capability.lookupKey,
          ...result,
        },
      };
      sendJson(response, 200, responseBody);
    } catch (error: unknown) {
      if (response.destroyed) return;
      if (error instanceof PublicApiError) {
        sendError(response, error);
      } else {
        sendError(response, new PublicApiError(500, 'INTERNAL_ERROR', 'The request could not be completed.'));
      }
    } finally {
      request.removeListener('aborted', onDisconnect);
      response.removeListener('close', onDisconnect);
    }
  });
}
